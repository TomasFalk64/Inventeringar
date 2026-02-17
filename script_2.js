let masterData = [];
let masterLayer, anmalningarLayer, egnaOmradenLayer;
let masterCircles = L.layerGroup(); 

const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSoJz7Pap7O0UQqtmPWNeZ8M3MmNVkcLC8tkw8PjTufkZkKq-74wH2HuwqcTQfN20be77kNkoy-rrLh/pub?output=csv';
const filAnmalningar = 'data/uppsala_anmalningar.geojson';
const filEgna = 'data/egna_omraden.geojson';

// --- INITIALISERING ---
const map = L.map('map').setView([59.8585, 17.6389], 11);
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
    const visaArende = document.getElementById('check-typ-arende').checked;
    const visaEgen = document.getElementById('check-typ-egen').checked;
    const visaSks = document.getElementById('layer-sks').checked;
    const antalVeckor = document.getElementById('weeks-input').value;

    const filterSkede = {
        planerad: document.getElementById('check-skede-planerad').checked,
        klar: document.getElementById('check-skede-klar').checked,
        avslutad: document.getElementById('check-skede-avslutad').checked
    };

    if (masterLayer) map.removeLayer(masterLayer);
    if (anmalningarLayer) map.removeLayer(anmalningarLayer);
    if (egnaOmradenLayer) map.removeLayer(egnaOmradenLayer);
    masterCircles.clearLayers();

    // Ladda SKS-basen (Används för både Master-ärenden och nya anmälningar)
    fetch(filAnmalningar).then(r => r.json()).then(data => {
        
        // 1. LAGER: Master-baserade områden (Blå ytor)
        masterLayer = L.geoJSON(data, {
            filter: f => {
                const match = masterData.find(row => row.Diarienummer === f.properties.Beteckn);
                if (!match) return false;
                if (match.Typ.toLowerCase() !== 'ärende') return false;
                return kollaSkedeFilter(match.Skede, filterSkede);
            },
            style: f => getYtStyle(f, 'ärende'),
            onEachFeature: (f, l) => { onEachFeature(f, l); ritaCirkel(f, l); }
        });
        if (visaArende) masterLayer.addTo(map);

        // 2. LAGER: SKS Anmälningar (Bara de som INTE finns i Master och är inom tidsramen)
        if (visaSks) {
            anmalningarLayer = L.geoJSON(data, {
                filter: f => {
                    // Kolla först om den redan finns i Master (då ska den inte visas här)
                    const finnsIMaster = masterData.some(row => row.Diarienummer === f.properties.Beteckn);
                    if (finnsIMaster) return false;

                    // Kolla datumet
                    const inkomDatum = new Date(f.properties.Inkomdatum);
                    const idag = new Date();
                    const gransDatum = new Date();
                    gransDatum.setDate(idag.getDate() - (antalVeckor * 7));

                    return inkomDatum >= gransDatum; // Visa bara om inkommit efter gränsen
                },
                style: getSksStyle,
                onEachFeature: onEachFeature
            }).addTo(map);
        }
    });

    // 3. LAGER: Egna områden (Lila/Gröna ytor från egna_omraden.geojson)
    fetch(filEgna).then(r => r.json()).then(data => {
        egnaOmradenLayer = L.geoJSON(data, {
            filter: f => {
                const match = masterData.find(row => row.Diarienummer === f.properties.Beteckn);
                if (!match) return visaEgen; // Visa om den saknas i master men finns i filen
                if (match.Typ.toLowerCase() !== 'egen') return false;
                return kollaSkedeFilter(match.Skede, filterSkede);
            },
            style: f => getYtStyle(f, 'egen'),
            onEachFeature: (f, l) => { onEachFeature(f, l); ritaCirkel(f, l); }
        });
        if (visaEgen) egnaOmradenLayer.addTo(map);
    });
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

    if (skede === 'skyddad') return { color: "#1b5e20", fillColor: "#2e7d32", fillOpacity: 0.4, weight: 3 };
    if (skede === 'avverkad') return { color: "#757575", fillColor: "#9e9e9e", fillOpacity: 0.2, weight: 2 };
    
    const isPlanerad = skede === 'planerad';
    return {
        color: typ === 'egen' ? '#8e44ad' : '#2980b9',
        weight: 3,
        dashArray: isPlanerad ? '5, 8' : '0',
        fillOpacity: 0.3
    };
}

function getSksStyle(f) {
    const inkom = new Date(f.properties.Inkomdatum);
    const nu = new Date();
    const diffDagar = (nu - inkom) / (1000 * 60 * 60 * 24);
    const farg = diffDagar <= 42 ? '#e74c3c' : '#e67e22'; // 6 veckor gräns
    return { color: farg, weight: 2, fillOpacity: 0.4, fillColor: farg };
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
    else if (prio === 'hög') färg = "#e74c3c";
    else if (prio === 'mellan') färg = "#f1c40f";
    else if (prio === 'låg') färg = "#2ecc71";

    // Kant (Varningar)
    let kant = "transparent";
    let tjocklek = 0;

    if (deadlineStr && skede !== 'skyddad' && skede !== 'avverkad') {
        const d = new Date(deadlineStr);
        const nu = new Date();
        const dagar = Math.ceil((d - nu) / (1000 * 60 * 60 * 24));

        if (dagar <= 0) { kant = "#000000"; tjocklek = 3; }
        else if (dagar <= 7) { kant = "#7f8c8d"; tjocklek = 3; }
    }

    const circle = L.circleMarker(layer.getBounds().getCenter(), {
        radius: 10,
        fillColor: färg,
        color: kant,
        weight: tjocklek,
        fillOpacity: 0.9,
        interactive: false
    }).addTo(masterCircles);
}

// --- INFORUTA & KLICK ---
function onEachFeature(feature, layer) {
    layer.on('click', function(e) {
        const id = feature.properties.Beteckn;
        const match = masterData.find(row => row.Diarienummer === id);
        const p = feature.properties;

        document.getElementById('placeholder-text').style.display = 'none';
        document.getElementById('data-content').style.display = 'block';

        if (match) {
            document.getElementById('info-title').innerText = match.Trivialnamn || id;
            document.getElementById('info-fastighet').innerText = "Fastighet: " + (match.Fastighet || "-");
            document.getElementById('info-dnr').innerText = id;
            document.getElementById('info-prio').innerText = match.Prioritet || "Oklart";
            document.getElementById('info-juridik').innerText = match.Juridik || "Ingen";
            document.getElementById('info-next-step').innerText = match["Nästa steg"] || "Ingen åtgärd planerad";
            document.getElementById('info-arter').innerText = match["Prioriterade arter"] || "-";
            document.getElementById('info-comment').innerText = match["Övriga kommentarer"] || "";

            // Dynamisk länk
            const linkBtn = document.getElementById('btn-open-doc');
            if (match.Dokumentlänk) {
                linkBtn.style.display = 'block';
                linkBtn.href = match.Dokumentlänk;
                linkBtn.innerText = match.Dokumentlänk.includes('document') ? "📄 Öppna dokument" : "📂 Öppna mapp";
            } else {
                linkBtn.style.display = 'none';
            }
        } else {
            // SKS-rådata om ej i Master
            document.getElementById('info-title').innerText = "Ny anmälan";
            document.getElementById('info-fastighet').innerText = p.Kommun || "SKS";
            document.getElementById('info-dnr').innerText = id;
            document.getElementById('info-next-step').innerText = "Ej i Master - Behöver kollas!";
            document.getElementById('info-comment').innerText = `Inkom: ${p.Inkomdatum}\nTyp: ${p.Avverktyp}`;
            document.getElementById('btn-open-doc').style.display = 'none';
        }
        L.DomEvent.stopPropagation(e);
    });
}

// --- EVENT LISTENERS ---
document.getElementById('weeks-input').addEventListener('change', uppdateraKartan);

document.getElementById('basemap-select').addEventListener('change', e => {
    if (e.target.value === 'sat') { map.removeLayer(topoLayer); satLayer.addTo(map); }
    else { map.removeLayer(satLayer); topoLayer.addTo(map); }
});

[
    'check-typ-arende', 'check-typ-egen', 'layer-sks', 
    'check-skede-planerad', 'check-skede-klar', 'check-skede-avslutad'
].forEach(id => {
    document.getElementById(id).addEventListener('change', uppdateraKartan);
});

// Starta allt
laddaMasterSheet();