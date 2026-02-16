let masterData = [];
let masterLayer;
let anmalningarLayer; 
let egnaOmradenLayer;
let masterCircles = L.layerGroup(); // En grupp för alla prioriterings-cirklar

const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSoJz7Pap7O0UQqtmPWNeZ8M3MmNVkcLC8tkw8PjTufkZkKq-74wH2HuwqcTQfN20be77kNkoy-rrLh/pub?output=csv';
const fil1 = 'data/skogsstyrelsen_omraden.geojson';
const fil2 = 'data/egna_omraden.geojson';

function uppdateraKartan() {
    const visaMaster = document.getElementById('layer-master').checked;
    const visaSks = document.getElementById('layer-sks').checked;
    const veckor = parseInt(document.getElementById('weeks-input').value) || 0;

    // Rensa gamla lager
    if (masterLayer) map.removeLayer(masterLayer);
    if (anmalningarLayer) map.removeLayer(anmalningarLayer);
    masterCircles.clearLayers();

    fetch('data/uppsala_anmalningar.geojson')
        .then(response => response.json())
        .then(data => {
            
            // LAGER 1: PÅGÅENDE ÄRENDEN (Master Sheet)
            if (visaMaster) {
                masterLayer = L.geoJSON(data, {
                    filter: function(feature) {
                        return masterData.some(row => row.Diarienummer === feature.properties.Beteckn);
                    },
                    style: function(feature) {
                        const dnr = feature.properties.Beteckn;
                        const farg = getPrioritetsFarg(dnr);
                        return { color: farg, weight: 4, fillOpacity: 0.5 };
                    },
                    onEachFeature: function(feature, layer) {
                        onEachFeature(feature, layer); // Kör klick-logiken
                        ritaPrioritetsCirkel(feature, layer, false); // Rita Master-cirkel (isEget = false)
                    }
                }).addTo(map);
            }

            // LAGER 2: SKS ANMÄLNINGAR (Bara det som INTE finns i Master)
            if (visaSks && veckor > 0) {
                anmalningarLayer = L.geoJSON(data, {
                    filter: function(feature) {
                        const dnr = feature.properties.Beteckn;
                        const finnsIMaster = masterData.some(row => row.Diarienummer === dnr);
                        if (finnsIMaster) return false;

                        const inkom = new Date(feature.properties.Inkomdatum);
                        const grans = new Date();
                        grans.setDate(grans.getDate() - (veckor * 7));
                        return inkom >= grans;
                    },
                    style: function(feature) {
                        const inkom = new Date(feature.properties.Inkomdatum);
                        const nu = new Date();
                        const diffDagar = (nu - inkom) / (1000 * 60 * 60 * 24);
                        
                        // Om yngre än 6 veckor (42 dagar) -> Starkare röd
                        // Annars -> Orange
                        const farg = diffDagar <= 42 ? '#e74c3c' : '#e67e22';
                        
                        return { 
                            color: farg, 
                            weight: 2, 
                            opacity: 0.9,
                            fillOpacity: 0.4, 
                            fillColor: farg 
                        };
                    },
                    onEachFeature: onEachFeature
                }).addTo(map);
            }
        
        if (document.getElementById('layer-egne').checked) { laddaEgnaOmraden(); }

        });
}

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
            //if (document.getElementById('layer-sks').checked) {
                //uppdateraSksLager();
            //}
            uppdateraKartan(); // Denna sköter nu både Master-lager och SKS-lager

            laddaEgnaOmraden();
        },
        error: function(err) {
            console.error("Fel vid PapaParse:", err);
        }
    });
}


// Initiera kartan (Uppsala som startpunkt)
const map = L.map('map').setView([59.8585, 17.6389], 11);
masterCircles.addTo(map);

// Definiera bakgrundskartor (Använder OpenStreetMap som placeholder för Lantmäteriet)
const topoLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
}).addTo(map);

// Funktion för att uppdatera koordinater i headern
map.on('mousemove', function(e) {
    const lat = e.latlng.lat.toFixed(5);
    const lng = e.latlng.lng.toFixed(5);
    document.getElementById('coords').innerHTML = `Lat: ${lat}, Lng: ${lng}`;
});

function laddaEgnaOmraden() {
    fetch(fil2)
        .then(response => response.json())
        .then(data => {
            if (egnaOmradenLayer) map.removeLayer(egnaOmradenLayer);
            
            egnaOmradenLayer = L.geoJSON(data, {
                style: {
                    color: '#8e44ad', // Lila för egna områden
                    weight: 3,
                    fillOpacity: 0.3
                },
                onEachFeature: function(feature, layer) {
                    onEachFeature(feature, layer); // Klick-info
                    
                    // RITA ALLTID CIRKELN om den finns i MasterData
                    // Vi skickar 'true' för att få den lila/vita stilen
                    ritaPrioritetsCirkel(feature, layer, true);
                }
            }).addTo(map);
        })
        .catch(err => console.log("Inga egna områden hittades än (fil2)."));
}

// Kontroll för lager-checkboxar
document.getElementById('layer-arter').addEventListener('change', function(e) {
    if(e.target.checked) {
        alert("Här kommer vi ladda in artpunkter från Excel/Google Sheets!");
    }
});


function ritaPrioritetsCirkel(feature, layer, isEget = false) {
    const dnr = feature.properties.Beteckn || feature.properties.Diarienummer;
    const match = masterData.find(row => row.Diarienummer === dnr);


    if (match) {
        const center = layer.getBounds().getCenter();
        const basFarg = getPrioritetsFarg(dnr);
        let varningsKant = basFarg;
        let kantBredd = isEget ? 4 : 2;

        if (match["Åtgärd krävs"]) {
            const deadline = new Date(match["Åtgärd krävs"]);
            const idag = new Date();
            
            if (deadline < idag) {
                // DATUM HAR PASSERAT - Gör kanten svart och jättetjock
                varningsKant = "#000000"; 
                kantBredd = 6;
            } else {
                // DATUM NÄRMAR SIG (inom 7 dagar) - Gör kanten vit
                const marginal = new Date();
                marginal.setDate(idag.getDate() + 7);
                if (deadline <= marginal) {
                    varningsKant = "#ffffff";
                    kantBredd = 5;
                }
            }
        }
        
        const circle = L.circleMarker(center, {
            radius: isEget ? 10 : 10, // storlek på egna och pågående cirklar
            fillColor: isEget ? '#8e44ad' : basFarg, // Lila fyllning om det är eget
            color: varningsKant, 
            weight: kantBredd, 
            opacity: 1,
            fillOpacity: 0.9,
            interactive: false
        });

        circle.addTo(masterCircles);
    }
}




// Funktion som hanterar klick på anmälningar
function onEachFeature(feature, layer) {
    layer.on('click', function (e) {
        const p = feature.properties;
        
        // 1. Identifiera ID:t oavsett om det kommer från SKS (Beteckn) eller Egna/Master (Diarienummer)
        const id = p.Beteckn || p.Diarienummer || p.id; 
        
        // 2. Leta efter matchning i MasterData
        const match = masterData.find(row => row.Diarienummer === id);

        const titleEl = document.getElementById('info-title');
        const badgeContainer = document.getElementById('badge-container');
        const dnrEl = document.getElementById('info-dnr');
        const naturEl = document.getElementById('info-natur');
        const commentEl = document.getElementById('info-comment');
        const docBtn = document.getElementById('btn-open-folder');

        document.getElementById('placeholder-text').style.display = 'none';
        document.getElementById('data-content').style.display = 'block';
        badgeContainer.innerHTML = '';

        // 3. Om vi hittar en match i Google Sheets (MasterData)
        if (match) {
            titleEl.innerText = id;
            
            // Status och färger
            const statusVal = match.Status || "Ingen status";
            const statusColor = statusVal.includes('Överklagad') ? '#e74c3c' : '#e67e22';
            badgeContainer.innerHTML += `<span class="badge" style="background-color: ${statusColor}">${statusVal}</span>`;
            
            if (match["Tillfälligt förbud"]) {
                badgeContainer.innerHTML += `<span class="badge" style="background-color: #8e44ad;">${match["Tillfälligt förbud"]}</span>`;
            }
            if (match["Prioritet"]) {
                badgeContainer.innerHTML += `<span class="badge" style="background-color: #2c3e50;">${match["Prioritet"]}</span>`;
            }
            
            // Fyll i info från Google Sheets
            dnrEl.innerText = match["Trivialnamn på skog"] || id;
            naturEl.innerText = match["Prioriterade arter"] || "Ej angivet";
            
            commentEl.innerHTML = `
                <div style="background: #f4f4f4; padding: 12px; border-radius: 8px; border-left: 4px solid #e67e22; margin-top: 10px; font-size: 0.95em;">
                    <p style="margin: 0 0 8px 0;"><strong>Fastighet:</strong> ${match["Fastighet"] || p.Kommun || "Ej angivet"}</p>
                    <p style="margin: 0 0 8px 0;"><strong>Nästa steg:</strong> ${match["Nästa steg"] || "Inga planerade åtgärder"}</p>
                    <hr style="border: 0; border-top: 1px solid #ddd; margin: 10px 0;">
                    <p style="margin: 0;"><strong>Övriga kommentarer:</strong><br>
                    <span style="color: #444;">${match["Övriga kommentarer"] || "Inga anteckningar."}</span></p>
                </div>
            `;

            docBtn.onclick = () => {
                const länk = match["Dokumentlänk"];
                if (länk && länk.startsWith('http')) {
                    window.open(länk, '_blank');
                } else {
                    alert(`Ingen länk hittades för ${id}.\n\nKontrollera kolumnen 'Dokumentlänk' i Master-arket.`);
                }
            };

        } else {
            // 4. Om ingen match finns i Google Sheets (Visar rådata från SKS/GeoJSON)
            titleEl.innerText = id;
            badgeContainer.innerHTML = `<span class="badge" style="background-color: #95a5a6">Ej i arkiv</span>`;
            
            dnrEl.innerText = p.ArendeStatus || "SKS Anmälan";
            naturEl.innerText = p.Skogstyp || "Ej angivet";
            
            commentEl.innerHTML = `
                <div style="margin-top: 15px">
                    <ul style="list-style: none; padding: 0; font-size: 0.9em; color: #555;">
                        <li><b>Typ:</b> ${p.Avverktyp || "Uppgift saknas"}</li>
                        <li><b>Areal:</b> ${p.AnmaldHa ? p.AnmaldHa + ' ha' : "Uppgift saknas"}</li>
                        <li><b>Inkom:</b> ${p.Inkomdatum ? p.Inkomdatum.split('T')[0] : "-"}</li>
                    </ul>
                </div>
            `;
            
            docBtn.onclick = () => {
                alert(`Detta område (${id}) finns inte i Master-arket än.`);
            };
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


// Skapa satellitlagret som en variabel så vi kan hålla koll på det
const satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EBP, and the GIS User Community'
});

document.getElementById('basemap-select').addEventListener('change', function(e) {
    if (e.target.value === 'sat') {
        // Ta bort topo, lägg till satellit
        map.removeLayer(topoLayer);
        satLayer.addTo(map);
    } else {
        // Ta bort satellit, lägg till topo
        map.removeLayer(satLayer);
        topoLayer.addTo(map);
    }
});

document.addEventListener('DOMContentLoaded', function() {
    laddaMasterSheet();
});

// Koppla de nya checkboxarna till funktionen
document.getElementById('layer-master').addEventListener('change', uppdateraKartan);
document.getElementById('layer-sks').addEventListener('change', uppdateraKartan);
document.getElementById('weeks-input').addEventListener('change', uppdateraKartan);
document.getElementById('layer-egne').addEventListener('change', function(e) {
    if (!e.target.checked && egnaOmradenLayer) {
        map.removeLayer(egnaOmradenLayer);
    }
    uppdateraKartan(); 
});