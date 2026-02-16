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
            if (document.getElementById('layer-sks').checked) {
                uppdateraSksLager();
            }
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
function getPrioritetsFarg(dnr) {
    // Leta efter polygonens dnr i masterData
    const match = masterData.find(row => row.Diarienummer === dnr);
    
    if (!match) return null; // Ingen match = använd standardfärg (orange/röd)

    // Bestäm färg baserat på Prioritet-kolumnen
    const prio = (match.Prioritet || "").toLowerCase();
    
    if (prio.includes("hög")) return "#c0392b";   // Mörkröd
    if (prio.includes("mellan")) return "#f1c40f"; // Stark gul
    if (prio.includes("låg")) return "#27ae60";    // Grön
    
    return "#3498db"; // Blå om den finns i master men saknar prio-värde
}


let anmalningarLayer; 

function uppdateraSksLager() {
    const checkbox = document.getElementById('layer-sks');
    const veckor = parseInt(document.getElementById('weeks-input').value) || 0;

    // Rensa gammalt
    if (anmalningarLayer) {
        map.removeLayer(anmalningarLayer);
        anmalningarLayer = null; // Viktigt: nollställ variabeln
    }

    // Om inte ikryssad eller 0 veckor, rita inget mer
    if (!checkbox.checked || veckor <= 0) return;

    fetch('data/uppsala_anmalningar.geojson')
        .then(response => response.json())
        .then(data => {
            const gransDatum = new Date();
            gransDatum.setDate(gransDatum.getDate() - (parseInt(document.getElementById('weeks-input').value) * 7));

            anmalningarLayer = L.geoJSON(data, {
                filter: function(feature) {
                    const dnr = feature.properties.Beteckn;
                    const inkomDatumStr = feature.properties.Inkomdatum;
                    
                    // 1. Kolla om den finns i Master Sheet
                    const finnsIMaster = masterData.some(row => row.Diarienummer === dnr);
                    
                    // 2. Om den finns i Master - VISA ALLTID
                    if (finnsIMaster) return true;

                    // 3. Om den INTE finns i Master - Kolla vecko-filtret
                    if (!inkomDatumStr) return false; 
                    
                    const inkom = new Date(inkomDatumStr);
                    const nuvarandeVeckoGrans = new Date();
                    nuvarandeVeckoGrans.setDate(nuvarandeVeckoGrans.getDate() - (veckor * 7));

                    // Visa endast om datumet är efter gränsen
                    return inkom >= nuvarandeVeckoGrans;
                },
                style: function(feature) {
                    const dnr = feature.properties.Beteckn;
                    const masterFarg = getPrioritetsFarg(dnr);
                    
                    if (masterFarg) {
                        // OM DEN FINNS I MASTER - lys med prioritetsfärg
                        return {
                            color: masterFarg,
                            weight: 4,         // Tjockare linje för "våra" områden
                            fillOpacity: 0.6,
                            fillColor: masterFarg
                        };
                    } else {
                        // STANDARDVY (Myndighetsdata)
                        const inkom = new Date(feature.properties.Inkomdatum);
                        const diffIVeckor = (new Date() - inkom) / (1000 * 60 * 60 * 24 * 7);
                        const farg = diffIVeckor <= 6 ? '#e74c3c' : '#e67e22';
                        
                        return {
                            color: farg,
                            weight: 1,
                            fillOpacity: 0.1, // Svagare fyllning för områden vi inte kollat
                            fillColor: farg
                        };
                    }
                },
                onEachFeature: onEachFeature 
            }).addTo(map);
        });
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