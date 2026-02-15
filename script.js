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

// 4. Exempel-data (Här simulerar vi de polygoner du senare laddar från GeoJSON/MasterSheet)
const examplePolygon = L.polygon([
    [59.87, 17.60],
    [59.88, 17.60],
    [59.88, 17.62],
    [59.87, 17.62]
], {
    color: 'red',
    fillColor: '#f03',
    fillOpacity: 0.5,
    huvudId: 'A 11833-2025',
    namn: 'Fågelbo 1:1. Järpskogen',
    status: 'Intermistiskt förbud',
    naturtyp: 'Gransumpskog',
    kommentar: 'Svar på kyrkans yttrande senast 1 december. MÖD dom planerad 16 april.',
    mapp: 'https://google.com'
}).addTo(map);

// 5. Klick-logik: Flytta data till sidopanelen
examplePolygon.on('click', function(e) {
    const props = e.target.options; // Här hämtar vi egenskaperna vi gett polygonen

    // Göm placeholder, visa data-containern
    document.getElementById('placeholder-text').style.display = 'none';
    document.getElementById('data-content').style.display = 'block';

    // Injicera data
    document.getElementById('info-title').innerText = props.namn;
    document.getElementById('info-status').innerText = props.status;
    document.getElementById('info-dnr').innerText = props.huvudId;
    document.getElementById('info-natur').innerText = props.naturtyp;
    document.getElementById('info-comment').innerText = props.kommentar;
    document.getElementById('info-link').href = props.mapp;
    
    // Zoom till området (valfritt)
    map.fitBounds(e.target.getBounds());
});

// 6. Kontroll för lager-checkboxar (logik för att tända/släcka kommer senare)
document.getElementById('layer-arter').addEventListener('change', function(e) {
    if(e.target.checked) {
        alert("Här kommer vi ladda in artpunkter från Excel/Google Sheets!");
    }
});