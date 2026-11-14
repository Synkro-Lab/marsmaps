// ===== DATOS (edita aquí: Diego) =====

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
  }
];

// Posición inicial del astronauta: cráter Jezero [lat, lng]
const START = [18.38, 77.58];

// Puntos de interés. OJO: son EJEMPLOS cercanos a Jezero; reemplazar por datos reales.
const POIS = [
  { name: "Delta del cráter (ejemplo)",    lat: 18.45, lng: 77.40, type: "ciencia", desc: "Posibles sedimentos de un antiguo río" },
  { name: "Zona de arena (ejemplo)",       lat: 18.10, lng: 77.90, type: "peligro", desc: "Terreno blando, riesgo para vehículos" },
  { name: "Afloramiento mineral (ejemplo)", lat: 18.80, lng: 77.70, type: "ciencia", desc: "Rocas con minerales de interés" },
  { name: "Cresta rocosa (ejemplo)",       lat: 17.90, lng: 77.20, type: "peligro", desc: "Pendiente fuerte" },
  { name: "Punto de reabastecimiento (ejemplo)", lat: 18.55, lng: 78.10, type: "base", desc: "Refugio y recarga" }
];

// Capa de altitud: DEM en escala de grises de MOLA (Trek). VERIFICAR el nombre en
// https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars (busca "DEM Grayscale - Mars Orbiter Laser Altimeter")
// min y max: altitud (m) que representan el negro y el blanco. Son valores aproximados:
// CALIBRAR con dos puntos conocidos (p. ej. cumbre del Olympus Mons ~21 200 m, fondo de Hellas ~ -8 200 m).
const DEM = {
  url: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_DEM_mosaic_global_463m/1.0.0/default/default028mm/{z}/{y}/{x}.png",
  maxNativeZoom: 5,
  min: -8200,
  max: 21200
};
