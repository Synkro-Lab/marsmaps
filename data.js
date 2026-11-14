// ===== DATOS (edita aquí) =====

// Capas base de NASA Trek. VERIFICAR cada URL en trek.nasa.gov/mars
// Para agregar otra capa (térmica, mineralogía...), copia un bloque y cambia nombre y URL.
const BASE_LAYERS = [
  {
    name: "Topografía (MOLA)",
    url: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg",
    maxNativeZoom: 5
  },
  {
    name: "Mosaico Viking",
    url: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg",
    maxNativeZoom: 5
  },
  {
    name: "Relieve sombreado (MOLA+HRSC, 200 m)",
    url: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_MOLA_blend200ppx_HRSC_Shade_clon0dd_200mpp_lzw/1.0.0/default/default028mm/{z}/{y}/{x}.jpg",
    maxNativeZoom: 8
  }
];

// Posición inicial del astronauta: cráter Jezero [lat, lng]
const START = [18.38, 77.58];

// Puntos de interés. Opcional: agrega elev: <metros> (medido con Show Pixel Value) a cada uno,
// por ejemplo { name: "...", lat: 18.40, lng: 77.68, elev: -2600, type: "base", desc: "..." }
const POIS = [
  { name: "Curiosity Landing Site",    lat: -4.58, lng: 137.44, type: "landing", desc: "NASA’s Curiosity rover landed on Mars on Aug. 5, 2012" },
  { name: "Insight Landing Site",	lat: 4.49, lng: 135.60, type: "landing", desc: "Landed: Nov. 26, 2018, at 11:52:59 a.m. PT (2:52:59 p.m. ET)" },
  { name: "Jezero Crater",	lat: 18.40, lng: 77.68, type: "base", desc: "Measuring roughly 49 km in diameter, Jezero Crater formed during Mars' Noachian period, approximately 4.1 to 3.7 billion years ago." },
  { name: "Opportunity Landing Site",       lat: -1.94, lng: -5.53, type: "Landing", desc: "Landed on Mars in early 2004 soon after its twin rover Spirit" },
  { name: "Phonix Landing Site", lat: 68.21, lng: -125.75, type: "Landing", desc: "On May 25, 2008, NASA's Phoenix probe touched down in Mars' northern plains known as Vastitas Borealis" }
];

// Capa de altitud: se estima por el TONO de la capa MOLA a color (no hay DEM puro en Trek).
// La conversión tono -> metros sale de CAL_TABLE (más abajo).
const DEM = {
  url: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg",
  maxNativeZoom: 5,
};
// [tono, metros] medidos con Show Pixel Value. Orden: tono de menor a mayor.
// OJO: estos valores son de EJEMPLO, hay que reemplazarlos con mediciones reales.
const CAL_TABLE = [[0, 21000], [60, 3000], [120, -1500], [200, -5000], [270, -8200]];