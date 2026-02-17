let masterData = [];
let masterLayer, anmalningarLayer, egnaOmradenLayer;
let masterCircles = L.layerGroup(); 

const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSoJz7Pap7O0UQqtmPWNeZ8M3MmNVkcLC8tkw8PjTufkZkKq-74wH2HuwqcTQfN20be77kNkoy-rrLh/pub?output=csv';
const filAnmalningar = 'data/uppsala_anmalningar.geojson';
const filEgna = 'data/egna_omraden.geojson';

// --- INITIALISERING ---
const map = L.map('map').setView([59.8585, 17.6389], 11);

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
        complete: function(results) {
            masterData = results.data;
            console.log("Master v2 laddad:", masterData.length, "rader.");
            uppdateraKartan();
        }
    });
}

// --- HUVUDFUNKTION FÖR KARTAN ---
function uppdateraKartan() {
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

    // 3. LAGER: SKS-data (Används för både Pågående Ärenden och Råa anmälningar)
    fetch(filAnmalningar).then(r => r.json()).then(data => {
        
        // --- A. PÅGÅENDE ÄRENDEN (Blå ytor från Master) ---
        if (visaArende) {
            masterLayer = L.geoJSON(data, {
                pane: 'masterPane',
                filter: f => {
                    const match = masterData.find(row => row.Diarienummer === f.properties.Beteckn);
                    return match && match.Typ.toLowerCase() === 'ärende';
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
            anmalningarLayer = L.geoJSON(data, {
                pane: 'sksPane',
                filter: f => {
                    // Skippa om den redan finns i Master
                    //const finnsIMaster = masterData.some(row => row.Diarienummer === f.properties.Beteckn);
                    //if (finnsIMaster) return false;

                    // Datumfilter
                    const inkomDatum = new Date(f.properties.Inkomdatum);
                    const idag = new Date();
                    const gransDatum = new Date();
                    gransDatum.setDate(idag.getDate() - (antalVeckor * 7));

                    return inkomDatum >= gransDatum;
                },
                style: getSksStyle,
                onEachFeature: (f, l) => onEachFeature(f, l, 'sks') //onEachFeature: onEachFeature
            }).addTo(map);
            
            // Lägg anmälningarna längst bak så de inte täcker våra egna markeringar
            anmalningarLayer.bringToBack();
        }
    });

    // 4. LAGER: EGNA PROJEKT (Lila ytor från egna_omraden.geojson)
    if (visaEgenHuvud) {
        fetch(filEgna).then(r => r.json()).then(data => {
            egnaOmradenLayer = L.geoJSON(data, {
                pane: 'masterPane',
                filter: f => {
                    const match = masterData.find(row => row.Diarienummer === f.properties.Beteckn);
                    
                    // Om den inte finns i Master alls, visa den som "Egen" som default
                    if (!match) return true; 
                    if (match.Typ.toLowerCase() !== 'egen') return false;

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
        });
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
    const match = masterData.find(row => row.Diarienummer === feature.properties.Beteckn);
    const skede = match ? (match.Skede || "").toLowerCase() : "";

    if (skede === 'skyddad') return { color: "#1b5e20", fillColor: "#2e7d32", fillOpacity: 0.6, weight: 3 };
    if (skede === 'avverkad') return { color: "#757575", fillColor: "#9e9e9e", fillOpacity: 0.4, weight: 2 };
    
    const isPlanerad = skede === 'planerad';
    return {
        color: typ === 'egen' ? '#8e44ad' : '#2980b9',
        weight: 3,
        dashArray: isPlanerad ? '5, 5' : '0',
        fillOpacity: 0.6
    };
}

function getSksStyle(f) {
    const inkom = new Date(f.properties.Inkomdatum);
    const nu = new Date();
    const diffDagar = (nu - inkom) / (1000 * 60 * 60 * 24);
    const farg = diffDagar <= 42 ? '#e6311c' : '#e67e22'; // 6 veckor gräns
    return { color: farg, weight: 2, fillOpacity: 0.7, fillColor: farg };
}

function ritaCirkel(feature, layer) {
    const match = masterData.find(row => row.Diarienummer === feature.properties.Beteckn);
    if (!match) return;

    const prio = (match.Prioritet || "").toLowerCase();
    const skede = (match.Skede || "").toLowerCase();
    const deadlineStr = match["Åtgärd krävs"];

    // Fyllnadsfärg
    let färg = "#ffffff"; 
    if (skede === 'skyddad') färg = "#1b5e20";
    else if (skede === 'avverkad') färg = "#9e9e9e";
    else if (prio === 'hög') färg = "#ff0404";
    else if (prio === 'mellan') färg = "#f1c40f";
    else if (prio === 'låg') färg = "#09ca59";

    // Kant (Varningar)
    let kant = "transparent"; //färg; 
    let tjocklek = 0;

    if (deadlineStr && skede !== 'skyddad' && skede !== 'avverkad') {
        const d = new Date(deadlineStr);
        const nu = new Date();
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
    layer.on('click', function(e) {
        const p = feature.properties;
        const id = p.Beteckn;
        const match = (typ !== 'sks') ? masterData.find(row => row.Diarienummer === id) : null;

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
            const matchIMaster = masterData.find(row => 
                row.Diarienummer && row.Diarienummer.toLowerCase() === id
            );
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
                const match = masterData.find(row => row.Diarienummer === hittatLager.feature.properties.Beteckn);
                const typ = (match && match.Typ) ? match.Typ.toLowerCase() : 'sks';
                hittatLager.setStyle(typ === 'sks' ? getSksStyle(hittatLager.feature) : getYtStyle(hittatLager.feature, typ));
            }
        }, 1200);
    } else {
        alert("Hittade inget område som matchar: " + term);
    }
}

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
    'weeks-input',        // Antal veckor (sifferbox)
    'layer-arter'         // Artpunkter
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

// --- STARTA ALLT ---
document.addEventListener('DOMContentLoaded', function() {
    laddaMasterSheet();
});