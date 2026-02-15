// 1. Initiera kartan (Uppsala som startpunkt)
const map = L.map('map').setView([59.8585, 17.6389], 11);

// 2. Definiera bakgrundskartor (Använder OpenStreetMap som placeholder för Lantmäteriet)
const topoLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
}).addTo(map);

// 3. Funktion för att uppdatera koordinater i headern
map.on('mousemove', function(e) {
    const lat = e.latlng.lat.toFixed(5);
    const lng = e.latlng.lng.toFixed(5);
    document.getElementById('coords').innerHTML = `Lat: ${lat}, Lng: ${lng}`;
});

// ... (behåll punkt 1-3 som de är)

// 6. Kontroll för lager-checkboxar
document.getElementById('layer-arter').addEventListener('change', function(e) {
    if(e.target.checked) {
        alert("Här kommer vi ladda in artpunkter från Excel/Google Sheets!");
    }
});

// 7. Funktionen som hanterar klick på anmälningar
function onEachFeature(feature, layer) {
    layer.on('click', function (e) {
        const p = feature.properties;
        document.getElementById('placeholder-text').style.display = 'none';
        document.getElementById('data-content').style.display = 'block';

        document.getElementById('info-title').innerText = p.Beteckn || "Namn saknas";
        document.getElementById('info-dnr').innerText = p.Beteckn;
        document.getElementById('info-status').innerText = p.ArendeStatus || "Anmäld";
        
        const infoText = `
            <b>Typ:</b> ${p.Avverktyp}<br>
            <b>Ändamål:</b> ${p.Andamal}<br>
            <b>Areal:</b> ${p.AnmaldHa} ha<br>
            <b>Inkom:</b> ${p.Inkomdatum}
        `;
        document.getElementById('info-comment').innerHTML = infoText;
        
        // Stoppa klicket från att gå igenom till kartan under
        L.DomEvent.stopPropagation(e);
    });
}

// 8. Logik för att ladda och filtrera Skogsstyrelsens lager
let anmalningarLayer; 

function uppdateraSksLager() {
    const checkbox = document.getElementById('layer-sks');
    const inputField = document.getElementById('weeks-input');
    const veckor = parseInt(inputField.value) || 0;

    // Rensa gammalt lager
    if (anmalningarLayer) {
        map.removeLayer(anmalningarLayer);
    }

    // Om inte ikryssad eller 0 veckor, rita inget mer
    if (!checkbox.checked || veckor <= 0) return;

    fetch('data/uppsala_anmalningar.geojson')
        .then(response => response.json())
        .then(data => {
            const gransDatum = new Date();
            gransDatum.setDate(gransDatum.getDate() - (veckor * 7));

            anmalningarLayer = L.geoJSON(data, {
                filter: function(feature) {
                    if (!feature.properties.Inkomdatum) return false;
                    const inkom = new Date(feature.properties.Inkomdatum);
                    return inkom >= gransDatum;
                },
                style: {
                    color: '#e67e22', 
                    weight: 2,
                    fillOpacity: 0.3
                },
                onEachFeature: onEachFeature 
            }).addTo(map);
        })
        .catch(err => console.error("Kunde inte läsa GeoJSON:", err));
}

// Lyssnare för kontroller
document.getElementById('layer-sks').addEventListener('change', uppdateraSksLager);
document.getElementById('weeks-input').addEventListener('input', () => {
    if (document.getElementById('layer-sks').checked) {
        uppdateraSksLager();
    }
});