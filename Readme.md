# Inventeringskarta - Uppsala län
Detta projekt automatiserar hämtning och visualisering av avverkningsanmälningar från Skogsstyrelsen. Det kombinerar dagsfärsk data med en historisk databas för att säkerställa att inga områden försvinner när de blir äldre än 5 år.

## Arbetsflöde
1. Uppdatera data (Python)
Varje gång du vill ha färsk data från Skogsstyrelsen:
Gå till Skogsstyrelsens geodata-sida.
Ladda ner filen "Avverkningsanmälningar (hela landet)" i formatet GPKG.
Ersätt den befintliga sksAvverkAnm.gpkg i mappen data/ med den nya filen.
Kör Python-skriptet:
    python data/Begransa_anmalningar.py

Vad skriptet gör:
Filtrerar ut alla anmälningar för Uppsala län (Länskod 03).
Jämför den nya datan med din befintliga uppsala_anmalningar.geojson.
Varnar i terminalen om specifika ärenden har tagits bort från Skogsstyrelsen (t.ex. pga. ålder).
Spara en sammanslagen fil där även de "borttagna" områdena finns kvar (historiksäkring).


## index.html
Själva grunden för kartan. Här laddas biblioteken:
Leaflet.js: För den interaktiva kartan.
PapaParse: För att läsa in din Master-Excel (om du har en sådan kopplad).
Tailwind CSS: (Eventuellt) för layout och styling.

## script_2.js
Funktioner på webbsidan. Skriptet gör följande:
Laddar GeoJSON: Hämtar data/uppsala_anmalningar.geojson.
Styling: Bestämmer hur ytorna ser ut (t.ex. blå för vanliga, eller grå/streckade för ärenden som identifierats som "gamla").
Popups: Kopplar ihop diarienumret (Beteckn) med informationen i filen så att du kan klicka på ett område och se fakta.
Sök/Filter: Innehåller logik för att bara visa de områden som är relevanta för din inventering.

## 📁 Filstruktur
'
Inventeringar/
├── index.html                  # Huvudfilen för kartan
├── script_2.js                 # Logik för karta, filter och popup-fönster
├── style.css                   # Anpassad design för layout och knappar
│
└── data/                       # All rådata och bearbetningsskript
   ├── Begransa_anmalningar.py # Python-skriptet som rensar och sparar historik
   ├── sksAvverkAnm.gpkg       # Källfil från Skogsstyrelsen (Hela Sverige)
   └── uppsala_anmalningar.geojson # Den färdiga, filtrerade filen som kartan läser
'
