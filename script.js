let masterData = [];

// Byt ut denna mot din riktiga CSV-länk från Google (Arkiv -> Dela -> Publicera på webben -> CSV)
const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSoJz7Pap7O0UQqtmPWNeZ8M3MmNVkcLC8tkw8PjTufkZkKq-74wH2HuwqcTQfN20be77kNkoy-rrLh/pub?output=csv';

function laddaMasterSheet() {
    // Kontrollera om Papa faktiskt har laddats
    if (typeof Papa === 'undefined') {
        console.log("PapaParse inte redo än, väntar 500ms...");
        setTimeout(laddaMasterSheet, 500); // Försök igen om en halv sekund
        return;
    }

    Papa.parse(csvUrl, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            masterData = results.data;
            console.log("Master Sheet laddat!", masterData.length, "rader hittades.");
        },
        error: function(err) {
            console.error("Fel vid PapaParse:", err);
        }
    });
}


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

// 7. Funktion som hanterar klick på anmälningar
function onEachFeature(feature, layer) {
    layer.on('click', function (e) {
        const p = feature.properties;
        const match = masterData.find(row => row.Diarienummer === p.Beteckn);

        // Hämta elementen
        const titleEl = document.getElementById('info-title');
        const badgeContainer = document.getElementById('badge-container'); // Den nya containern
        const dnrEl = document.getElementById('info-dnr');
        const naturEl = document.getElementById('info-natur');
        const commentEl = document.getElementById('info-comment');

        document.getElementById('placeholder-text').style.display = 'none';
        document.getElementById('data-content').style.display = 'block';

        // Töm alltid badge-containern först
        badgeContainer.innerHTML = '';

        if (match) {
            titleEl.innerText = match["Trivialnamn på skog"] || p.Beteckn;
            
            // Lägg till badges i containern
            const statusColor = match.Status.includes('Överklagad') ? '#e74c3c' : '#e67e22';
            badgeContainer.innerHTML += `<span class="badge" style="background-color: ${statusColor}">${match.Status}</span>`;
            
            if (match["Tillfälligt förbud"]) {
                badgeContainer.innerHTML += `<span class="badge" style="background-color: #8e44ad;">${match["Tillfälligt förbud"]}</span>`;
            }
            if (match["Prioritet"]) {
                badgeContainer.innerHTML += `<span class="badge" style="background-color: #2c3e50;">${match["Prioritet"]}</span>`;
            }
            
            dnrEl.innerText = p.Beteckn;
            naturEl.innerText = match["Prioriterade arter"] || "Ej angivet";
            
            commentEl.innerHTML = `
                <div style="background: #f4f4f4; padding: 12px; border-radius: 8px; border-left: 4px solid #e67e22; margin-top: 10px; font-size: 0.95em;">
                    <p style="margin: 0 0 8px 0;"><strong>Fastighet:</strong> ${match["Fastighet"] || p.Kommun}</p>
                    <p style="margin: 0 0 8px 0;"><strong>Nästa steg:</strong> ${match["Nästa steg"] || "Inga planerade åtgärder"}</p>
                    <hr style="border: 0; border-top: 1px solid #ddd; margin: 10px 0;">
                    <p style="margin: 0;"><strong>Övriga kommentarer:</strong><br>
                    <span style="color: #444;">${match["Övriga kommentarer"] || "Inga anteckningar."}</span></p>
                </div>
            `;
        } else {
        // --- VY FÖR ÄRENDEN UTAN MATCH ---
            titleEl.innerText = p.Beteckn;
            badgeContainer.innerHTML = `<span class="badge" style="background-color: #95a5a6">Ej i arkiv</span>`;
            
            dnrEl.innerText = p.Beteckn;
            naturEl.innerText = p.Skogstyp;
            
            commentEl.innerHTML = `
                <div style="margin-top: 15px">
                    <ul style="list-style: none; padding: 0; font-size: 0.9em; color: #555;">
                        <li><b>Typ:</b> ${p.Avverktyp || "Uppgift saknas"}</li>
                        <li><b>Areal:</b> ${p.AnmaldHa} ha</li>
                        <li><b>Inkom:</b> ${p.Inkomdatum ? p.Inkomdatum.split('T')[0] : "-"}</li>
                        <li><b>Status:</b> ${p.ArendeStatus}</li>
                    </ul>
                </div>
            `;
        }
        
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
                style: function(feature) {
                    const inkom = new Date(feature.properties.Inkomdatum);
                    const idag = new Date();
                    
                    // Räkna ut tidsskillnaden i millisekunder och gör om till veckor
                    // 1000ms * 60s * 60m * 24h * 7d = 1 vecka
                    const diffIVeckor = (idag - inkom) / (1000 * 60 * 60 * 24 * 7);

                    if (diffIVeckor <= 6) {
                        // Nyare än 6 veckor = Röd
                        return {
                            color: '#e74c3c', 
                            weight: 3,        // Lite tjockare linje för att synas bättre
                            fillOpacity: 0.4,
                            fillColor: '#e74c3c'
                        };
                    } else {
                        // Äldre än 6 veckor = Orange
                        return {
                            color: '#e67e22',
                            weight: 2,
                            fillOpacity: 0.2,
                            fillColor: '#e67e22'
                        };
                    }
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

document.addEventListener('DOMContentLoaded', function() {
    laddaMasterSheet();
});