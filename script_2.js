let masterData = [];
let masterById = new Map();
let masterLayer, anmalningarLayer, egnaOmradenLayer;
let masterCircles = L.layerGroup(); 
let lastClickedLayer = null;
let anmalningarData = null;
let egnaOmradenData = null;


const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSoJz7Pap7O0UQqtmPWNeZ8M3MmNVkcLC8tkw8PjTufkZkKq-74wH2HuwqcTQfN20be77kNkoy-rrLh/pub?output=csv';
const filAnmalningar = 'data/uppsala_anmalningar.geojson';
const filEgna = 'data/egna_omraden.geojson';

function getRowById(id) {
    return masterById.get(id) || null;
}

function parseDateOnly(value) {
    if (!value) return null;
    const isoMatch = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        const year = Number(isoMatch[1]);
        const month = Number(isoMatch[2]) - 1;
        const day = Number(isoMatch[3]);
        return new Date(year, month, day);
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function getStartOfToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function showStatusMessage(message, isError = false) {
    const el = document.getElementById('status-message');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('is-error', Boolean(isError));
}

function showTemporaryStatus(message, isError = false, timeoutMs = 2500) {
    showStatusMessage(message, isError);
    if (!message) return;
    window.setTimeout(() => {
        showStatusMessage('');
    }, timeoutMs);
}

async function fetchJsonWithTimeout(url, timeoutMs = 12000) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
    } finally {
        window.clearTimeout(timeoutId);
    }
}

async function ensureGeoJsonDataLoaded() {
    const loaders = [];

    if (!anmalningarData) {
        loaders.push(
            fetchJsonWithTimeout(filAnmalningar).then(data => {
                anmalningarData = data;
            })
        );
    }

    if (!egnaOmradenData) {
        loaders.push(
            fetchJsonWithTimeout(filEgna).then(data => {
                egnaOmradenData = data;
            })
        );
    }

    if (loaders.length) {
        await Promise.all(loaders);
    }
}

// --- INITIALISERING ---
const map = L.map('map').setView([60.0, 17.48], 10);

// Skapa fasta våningar (Panes) innan lagren läggs till
map.createPane('sksPane');      // Bottenvåning för råa anmälningar
map.getPane('sksPane').style.zIndex = 400;

map.createPane('masterPane');   // Mellanvåning för Pågående & Egna
map.getPane('masterPane').style.zIndex = 500;

map.createPane('circlePane');   // Toppvåning för Prio-cirklar
map.getPane('circlePane').style.zIndex = 600;

masterCircles.addTo(map);

const topoLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
}).addTo(map);

const satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Esri, DigitalGlobe, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community'
});

// --- DATALADDNING ---
function laddaMasterSheet() {
    if (typeof Papa === 'undefined') {
        setTimeout(laddaMasterSheet, 500);
        return;
    }
    Papa.parse(csvUrl, {
        download: true,
        header: true,
        skipEmptyLines: true,
        error: function(err) {
            console.error("Kunde inte läsa master-sheet:", err);
            showStatusMessage("Kunde inte läsa masterdata. Kontrollera nätverket.", true);
        },
        complete: function(results) {
            if (results.errors && results.errors.length) {
                console.error("Fel i master-sheet:", results.errors);
                showStatusMessage("Masterdata innehåller fel och kan vara ofullständig.", true);
            } else {
                showStatusMessage("");
            }
            masterData = results.data;
            masterById = new Map(
                masterData
                    .filter(row => row.Diarienummer)
                    .map(row => [row.Diarienummer, row])
            );
            console.log("Master v2 laddad:", masterData.length, "rader.");
            uppdateraKartan();
        }
    });
}

// --- HUVUDFUNKTION FÖR KARTAN ---
async function uppdateraKartan() {
    // 1. Hämta status från kontrollpanelen
    const visaArende = document.getElementById('check-typ-arende').checked;
    const visaEgenHuvud = document.getElementById('check-typ-egen').checked;
    const visaSks = document.getElementById('layer-sks').checked;
    
    // Submeny för Egna projekt
    const visaPlanerad = document.getElementById('check-skede-planerad').checked;
    const visaInventerad = document.getElementById('check-skede-klar').checked;

    // SKS Inställningar
    const antalVeckor = parseInt(document.getElementById('weeks-input').value) || 12;

    // 2. Rensa gamla lager från kartan
    if (masterLayer) map.removeLayer(masterLayer);
    if (anmalningarLayer) map.removeLayer(anmalningarLayer);
    if (egnaOmradenLayer) map.removeLayer(egnaOmradenLayer);
    masterCircles.clearLayers(); // Rensar alla prio-cirklar

    try {
        await ensureGeoJsonDataLoaded();
    } catch (err) {
        console.error("Kunde inte läsa GeoJSON-data:", err);
        showStatusMessage("Kunde inte läsa kartdata. Försök igen senare.", true);
        return;
    }

    showStatusMessage("");

    // 3. LAGER: SKS-data (Används för både Pågående Ärenden och Råa anmälningar)
    if (visaArende) {
        masterLayer = L.geoJSON(anmalningarData, {
            pane: 'masterPane',
            filter: f => {
                const match = getRowById(f.properties.Beteckn);
                return match && (match.Typ || '').toLowerCase() === 'ärende';
            },
            style: f => getYtStyle(f, 'ärende'),
            onEachFeature: (f, l) => {
                onEachFeature(f, l, 'arende');
                ritaCirkel(f, l);
                l.bringToFront(); // Gör ärenden prioriterade för klick
            }
        }).addTo(map);
    }

    // --- B. RÅA SKS-ANMÄLNINGAR (Röd/Orange - ej i Master) ---
    if (visaSks) {
        const idag = getStartOfToday();
        const gransDatum = new Date(idag);
        gransDatum.setDate(gransDatum.getDate() - (antalVeckor * 7));

        anmalningarLayer = L.geoJSON(anmalningarData, {
            pane: 'sksPane',
            filter: f => {
                const inkomDatum = parseDateOnly(f.properties.Inkomdatum);
                if (!inkomDatum) return false;
                return inkomDatum >= gransDatum;
            },
            style: getSksStyle,
            onEachFeature: (f, l) => onEachFeature(f, l, 'sks')
        }).addTo(map);

        // Lägg anmälningarna längst bak så de inte täcker våra egna markeringar
        anmalningarLayer.bringToBack();
    }

    // 4. LAGER: EGNA PROJEKT (Lila ytor från egna_omraden.geojson)
    if (visaEgenHuvud) {
        egnaOmradenLayer = L.geoJSON(egnaOmradenData, {
            pane: 'masterPane',
            filter: f => {
                const match = getRowById(f.properties.Beteckn);

                // Om den inte finns i Master alls, visa den som "Egen" som default
                if (!match) return true;
                if ((match.Typ || '').toLowerCase() !== 'egen') return false;

                // Submeny-filter baserat på Skede
                const skede = (match.Skede || "").toLowerCase();
                if (skede === 'planerad') return visaPlanerad;
                if (skede === 'inventerad' || skede === 'klar') return visaInventerad;

                // Om det är t.ex. "Skyddad" eller "Avverkad" men Typ=Egen, visa den
                return true;
            },
            style: f => getYtStyle(f, 'egen'),
            onEachFeature: (f, l) => {
                onEachFeature(f, l, 'egen');
                ritaCirkel(f, l);
                l.bringToFront(); // Gör egna projekt prioriterade för klick
            }
        }).addTo(map);
    }
}

// --- HJÄLPFUNKTIONER FÖR STIL ---

function kollaSkedeFilter(skede, filter) {
    const s = (skede || "").toLowerCase();
    if (s === 'planerad' || s === 'pågående') return filter.planerad;
    if (s === 'klar' || s === 'inventerad' || s === 'skyddad') return filter.klar;
    if (s === 'avverkad' || s === 'avslutad') return filter.avslutad;
    return true;
}

function getYtStyle(feature, typ) {
    const match = getRowById(feature.properties.Beteckn);
    const skede = match ? (match.Skede || "").toLowerCase() : "";

    if (skede === 'skyddad') return { color: "#1b5e20", fillColor: "#2e7d32", fillOpacity: 0.6, weight: 3 };
    if (skede === 'avverkad') return { color: "#757575", fillColor: "#9e9e9e", fillOpacity: 0.4, weight: 2 };
    
    const isPlanerad = skede === 'planerad';
    return {
        color: typ === 'egen' ? '#8e44ad' : '#2980b9',
        weight: 3,
        dashArray: isPlanerad ? '5, 5' : '0',
        fillOpacity: 0.7
    };
}

function getSksStyle(f) {
    const inkom = parseDateOnly(f.properties.Inkomdatum);
    if (!inkom) return { color: '#e67e22', weight: 2, fillOpacity: 0.6, fillColor: '#e67e22' };
    const nu = getStartOfToday();
    const diffDagar = (nu - inkom) / (1000 * 60 * 60 * 24);
    const farg = diffDagar <= 42 ? '#e6311c' : '#e67e22'; // 6 veckor gräns
    return { color: farg, weight: 2, fillOpacity: 0.6, fillColor: farg };
}

function ritaCirkel(feature, layer) {
    const match = getRowById(feature.properties.Beteckn);
    if (!match) return;

    const prio = (match.Prioritet || "").toLowerCase();
    const skede = (match.Skede || "").toLowerCase();
    const deadlineStr = match["Åtgärd krävs"];

    // Fyllnadsfärg
    let färg = "transparent"; // eller vit
    if (skede === 'skyddad') färg = "#1b5e20";
    else if (skede === 'avverkad') färg = "#9e9e9e";
    else if (prio === 'hög') färg = "#ff0404";
    else if (prio === 'mellan') färg = "#f1c40f";
    else if (prio === 'låg') färg = "#09ca59";

    // Kant (Varningar)
    let kant = "transparent"; //färg; 
    let tjocklek = 0;

    if (deadlineStr && skede !== 'skyddad' && skede !== 'avverkad') {
        const d = parseDateOnly(deadlineStr);
        const nu = getStartOfToday();
        if (!d) return;
        const dagar = Math.ceil((d - nu) / (1000 * 60 * 60 * 24));

        if (dagar <= 0) { kant = "#000000"; tjocklek = 3; }
        else if (dagar <= 7) { kant = "#5f6161"; tjocklek = 3; }
    }

    const circle = L.circleMarker(layer.getBounds().getCenter(), {
        radius: 10,
        fillColor: färg,
        color: kant,
        weight: tjocklek,
        fillOpacity: 0.8,
        interactive: false,
        pane: 'circlePane'
    }).addTo(masterCircles);
}

// --- INFORUTA & KLICK ---
function onEachFeature(feature, layer, typ) { 
    const p = feature.properties;
    const id2 = p.Diarienummer || p.Beteckn || "";
    layer.bindTooltip(id2, {
        sticky: true,       // Gör att rutan följer musen
        direction: 'top',
        opacity: 0.9,
        className: 'custom-tooltip' // Vi använder denna för att styla i CSS
    });
    layer.on('click', function(e) {

        if (lastClickedLayer) {
                let originalStyle;
                
                // Vi kollar vilken "typ" det gamla lagret hade för att välja rätt stil-funktion
                if (lastClickedLayer.myCustomTyp === 'sks') {
                    originalStyle = getSksStyle(lastClickedLayer.feature);
                } else {
                    // För 'arende' och 'egen' använder du funktionen getYtStyle(f, typ)
                    originalStyle = getYtStyle(lastClickedLayer.feature, lastClickedLayer.myCustomTyp);
                }
                
                lastClickedLayer.setStyle(originalStyle);
            }

            // 2. MARKERA DET NYA LAGRET (Gult och tjockt)
            layer.setStyle({
                //weight: 5,
                //color: '#ffeb3b', 
                fillOpacity: 0.8
            });

        // Spara undan typen på lagret så vi vet hur det ska återställas nästa gång
        layer.myCustomTyp = typ; 
        lastClickedLayer = layer;
        
        const id = p.Beteckn;
        const match = (typ !== 'sks') ? getRowById(id) : null;

        // 1. NOLLSTÄLL ALLT (Dölj alla vyer och kommentar-delar)
        document.getElementById('view-master').style.display = 'none';
        document.getElementById('view-sks').style.display = 'none';
        document.getElementById('placeholder-text').style.display = 'none';
        document.getElementById('data-content').style.display = 'block';
        
        // Dölj hela kommentarssektionen som standard
        document.getElementById('comment-label').style.display = 'none';
        document.getElementById('info-comment').style.display = 'none';

        if (match) {
            // --- VISA MASTER-VY ---
            document.getElementById('view-master').style.display = 'block';
            
            // Tänd kommentarerna igen för Master-data
            document.getElementById('comment-label').style.display = 'block';
            document.getElementById('info-comment').style.display = 'block';
            
            document.getElementById('info-title').innerText = match.Trivialnamn || id;
            document.getElementById('info-fastighet').innerText = "Fastighet: " + (match.Fastighet || "-");
            
            document.getElementById('info-dnr').innerText = id;
            document.getElementById('info-inkom').innerText = match["Inkomstdatum"] || "-";
            document.getElementById('info-atgard').innerText = match["Åtgärd krävs"] || "-";
            document.getElementById('info-prio').innerText = match.Prioritet || "-";
            document.getElementById('info-juridik').innerText = match.Juridik || "-";
            document.getElementById('info-next-step').innerText = match["Nästa steg"] || "-";
            document.getElementById('info-arter').innerText = match["Prioriterade arter"] || "Inga noterade";
            
            document.getElementById('info-comment').innerText = match["Övriga kommentarer"] || "";

            const linkBtn = document.getElementById('btn-open-doc');
            if (match.Dokumentlänk && match.Dokumentlänk.trim() !== "") {
                linkBtn.href = match.Dokumentlänk;
                linkBtn.style.display = 'inline-block'; // Visa knappen!
                
                // Valfritt: Ändra texten på knappen om det är en mapp istället för webblänk
                if (!match.Dokumentlänk.startsWith('http')) {
                    linkBtn.innerText = "Öppna projektmapp";
                } else {
                    linkBtn.innerText = "Öppna dokument";
                }
            } else {
                linkBtn.style.display = 'none'; // Dölj om fältet är tomt
            }

        } else {
            // --- VISA SKS-VY ---
            document.getElementById('view-sks').style.display = 'block';
            
            document.getElementById('info-title').innerText = "SKS Originaldata";
            document.getElementById('info-fastighet').innerText = (p.Lan || "") + " " + (p.Kommun || "");

            document.getElementById('sks-dnr').innerText = p.Beteckn || "-";
            document.getElementById('sks-typ').innerText = p.Avverktyp || "-";
            document.getElementById('sks-ha').innerText = p.AnmaldHa || "-";
            document.getElementById('sks-datum').innerText = p.Inkomdatum ? p.Inkomdatum.split('T')[0] : "-"; 
            document.getElementById('sks-status').innerText = p.ArendeStatus || "-";
            document.getElementById('sks-skogstyp').innerText = p.Skogstyp || "-";
           
            document.getElementById('btn-open-doc').style.display = 'none';
        }

        L.DomEvent.stopPropagation(e);
    });
}

function utforSokning() {
    const term = document.getElementById('map-search').value.toLowerCase().trim();
    if (term.length < 2) return;

    let hittatLager = null;

    // Vi letar igenom alla lager som för tillfället finns på kartan
    const allaLagerGrupper = [masterLayer, egnaOmradenLayer, anmalningarLayer];
    
    allaLagerGrupper.forEach(group => {
        if (!group) return;
        group.eachLayer(layer => {
            const p = layer.feature.properties;
            const id = (p.Beteckn || p.Diarienummer || "").toLowerCase();
            
            // Kolla även i MasterData för att kunna söka på "Trivialnamn"
            const matchIMaster = getRowById(p.Beteckn || p.Diarienummer || '');
            const trivialNamn = matchIMaster && matchIMaster.Trivialnamn ? matchIMaster.Trivialnamn.toLowerCase() : "";

            // Om söktermen matchar ID eller Trivialnamn
            if (id.includes(term) || trivialNamn.includes(term)) {
                hittatLager = layer;
            }
        });
    });

    if (hittatLager) {
        const bounds = hittatLager.getBounds();
        map.fitBounds(bounds, { maxZoom: 16, padding: [20, 20] });
        
        // Simulera ett klick för att öppna infopanelen
        hittatLager.fire('click');

        // Visuell feedback (blink)
        const originalStyle = { ...hittatLager.options.style };
        hittatLager.setStyle({ color: 'yellow', weight: 8, fillOpacity: 0.7 });
        
        setTimeout(() => {
            // Återställ till originalstil (använder befintlig logik)
            if (hittatLager.feature) {
                const match = getRowById(hittatLager.feature.properties.Beteckn);
                const typ = (match && match.Typ) ? match.Typ.toLowerCase() : 'sks';
                hittatLager.setStyle(typ === 'sks' ? getSksStyle(hittatLager.feature) : getYtStyle(hittatLager.feature, typ));
            }
        }, 1200);
    } else {
        showTemporaryStatus("Hittade inget område som matchar: " + term, true);
    }
}

const legendControl = L.control({ position: 'topright' });

legendControl.onAdd = function (map) {
    const div = L.DomUtil.create('div', 'map-legend');
    
    div.innerHTML = `
        <div class="legend-header" id="legend-toggle">
            <span>Teckenförklaring</span>
            <span id="legend-icon">−</span>
        </div>
        <div id="legend-body" class="legend-content">
            <hr class="legend-divider">

            <div class="legend-section-title">Status</div>
            <div class="legend-item"><div class="legend-color legend-color-status-egen"></div> Egna inventeringar</div>
            <div class="legend-item"><div class="legend-color legend-color-status-arende"></div> Pågående ärenden</div>
            
            <div class="legend-section-title">Anmälan SKS</div>
            <div class="legend-item"><div class="legend-color legend-color-sks-new"></div> Nyare än 6 veckor</div>
            <div class="legend-item"><div class="legend-color legend-color-sks-old"></div> Äldre än 6 veckor</div>

            <div class="legend-section-title legend-section-title-top">Prioritering</div>
            <div class="legend-grid">
                <div class="legend-item"><div class="legend-circle legend-circle-high"></div> Hög</div>
                <div class="legend-item"><div class="legend-circle legend-circle-medium"></div> Mellan</div>
                <div class="legend-item"><div class="legend-circle legend-circle-low"></div> Låg</div>
                <div class="legend-item"><div class="legend-circle legend-circle-harvested"></div> Avverkad</div>
            </div>
            <div class="legend-item"><div class="legend-circle legend-circle-protected"></div> Skyddad</div>

            <div class="legend-section-title legend-section-title-top">Varningar & Deadlines</div>
            <div class="legend-item"><div class="legend-circle legend-circle-warning"></div> ⚠️ Åtgärd krävs</div>
            <div class="legend-item"><div class="legend-circle legend-circle-deadline"></div> ⚠️ Deadline nära (7 dagar)</div>
            
        </div>
    `;

    L.DomEvent.disableClickPropagation(div);
    
    div.querySelector('#legend-toggle').onclick = function() {
        const body = div.querySelector('#legend-body');
        const icon = div.querySelector('#legend-icon');
        if (body.classList.contains('minimized')) {
            body.classList.remove('minimized');
            icon.innerText = '−';
        } else {
            body.classList.add('minimized');
            icon.innerText = '+';
        }
    };

    return div;
};

legendControl.addTo(map);



// EVENTLYSSNARE
// 1. Basemap-väljaren
const basemapSelect = document.getElementById('basemap-select');
if (basemapSelect) {
    basemapSelect.addEventListener('change', e => {
        if (e.target.value === 'sat') { 
            map.removeLayer(topoLayer); 
            satLayer.addTo(map); 
        } else { 
            map.removeLayer(satLayer); 
            topoLayer.addTo(map); 
        }
    });
}

// 2. Alla filter som ska uppdatera kartan
const inputIds = [
    'check-typ-arende',   // Pågående ärenden
    'check-typ-egen',     // Egna projekt (huvud)
    'check-skede-planerad', // Submeny Planerade
    'check-skede-klar',     // Submeny Inventerade
    'layer-sks',          // SKS huvudruta
    'weeks-input'        // Antal veckor (sifferbox)
    
];

inputIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        // Om det är sifferboxen lyssnar vi på 'input' så det ändras direkt
        const eventType = el.type === 'number' ? 'input' : 'change';
        el.addEventListener(eventType, uppdateraKartan);
    } else {
        // Detta hjälper oss att se om vi stavat fel på något ID i framtiden
        console.warn(`Hittade inte elementet: ${id}`);
    }
});

// 3. Sökfunktionen
const searchBtn = document.getElementById('search-btn');
if (searchBtn) searchBtn.addEventListener('click', utforSokning);

const searchInput = document.getElementById('map-search');
if (searchInput) {
    searchInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') utforSokning();
    });
}

// 4. Uppdatera koordinatvisaren vid musrörelse
map.on('mousemove', function(e) {
    const lat = e.latlng.lat.toFixed(5);
    const lng = e.latlng.lng.toFixed(5);
    const coordsElement = document.getElementById('coords');
    if (coordsElement) {
        coordsElement.innerText = `Lat: ${lat}, Lng: ${lng}`;
    }
});

// --- STARTA ALLT ---
document.addEventListener('DOMContentLoaded', function() {
    laddaMasterSheet();
});
