// ===== LÓGICA (edita aquí: Choisaint) =====
const MARS_R = 3389.5;          // radio de Marte en km
const EARTH_R = 6371;           // Leaflet asume la Tierra en sus cálculos
const RADAR_PX = 90;            // radio del radar en píxeles (mitad de 180) maldito seas github

// --- Distancia y rumbo en Marte (no usar map.distance: asume la Tierra) ---
const rad = d => d * Math.PI / 180;
function distKm(a, b) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * MARS_R * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {   // radianes, 0 = norte, sentido horario
  const dLng = rad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
            Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dLng);
  return Math.atan2(y, x);
}

// --- Mapa ---
const map = L.map('map', { crs: L.CRS.EPSG4326, center: START, zoom: 5, minZoom: 1, maxZoom: 8 });

const baseLayers = {};
BASE_LAYERS.forEach((b, i) => {
  const layer = L.tileLayer(b.url, { maxNativeZoom: b.maxNativeZoom, maxZoom: 8, attribution: 'NASA/JPL Trek' });
  baseLayers[b.name] = layer;
  if (i === 0) layer.addTo(map);
});

// --- Puntos de interés ---
const poiGroup = L.layerGroup().addTo(map);
POIS.forEach(p => {
  const color = p.type === "peligro" ? "#e0894f" : p.type === "base" ? "#5ee7d6" : "#f2d36b";
  L.circleMarker([p.lat, p.lng], { radius: 7, color, fillOpacity: 0.8 })
    .bindPopup(`<b>${p.name}</b><br>${p.desc}`).addTo(poiGroup);
});

// --- Astronauta (arrástralo y el radar se actualiza) ---
const astro = L.marker(START, { draggable: true, title: "Astronauta" }).addTo(map);
const rangeCircle = L.circle(START, { radius: 0, color: "#5ee7d6", weight: 1, fill: false }).addTo(map);

L.control.layers(baseLayers, { "Puntos de interés": poiGroup }).addTo(map);

// --- Radar ---
const rangeInput = document.getElementById('range');
const rangeLabel = document.getElementById('range-label');
const blips = document.getElementById('radar-blips');
const nearby = document.getElementById('nearby');

function updateRadar() {
  const rangeKm = Number(rangeInput.value);
  rangeLabel.textContent = rangeKm;
  const me = astro.getLatLng();
  // El círculo de Leaflet usa radio terrestre, se corrige para que represente km de Marte
  rangeCircle.setLatLng(me).setRadius(rangeKm * 1000 * (EARTH_R / MARS_R));

  blips.innerHTML = '';
  nearby.innerHTML = '';
  const found = [];
  POIS.forEach(p => {
    const d = distKm(me, p);
    if (d > rangeKm) return;
    const th = bearing(me, p);
    const r = (d / rangeKm) * RADAR_PX;
    const el = document.createElement('div');
    el.className = 'blip';
    el.style.left = (RADAR_PX + r * Math.sin(th)) + 'px';
    el.style.top  = (RADAR_PX - r * Math.cos(th)) + 'px';
    el.title = p.name;
    blips.appendChild(el);
    found.push({ p, d });
  });
  found.sort((a, b) => a.d - b.d).forEach(({ p, d }) => {
    const li = document.createElement('li');
    li.textContent = `${p.name}: ${d.toFixed(1)} km`;
    nearby.appendChild(li);
  });
  if (!found.length) nearby.innerHTML = '<li>Nada en el radar</li>';
}
astro.on('drag', updateRadar);
rangeInput.addEventListener('input', updateRadar);

// --- Ruta ---
let routing = false, waypoints = [];
const routeLine = L.polyline([], { color: "#e0894f", weight: 3, dashArray: "6 6" }).addTo(map);
const routeInfo = document.getElementById('route-info');
const btnRoute = document.getElementById('btn-route');

function updateRoute() {
  routeLine.setLatLngs(waypoints);
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) total += distKm(waypoints[i - 1], waypoints[i]);
  routeInfo.textContent = waypoints.length ? `Ruta: ${waypoints.length} puntos, ${total.toFixed(1)} km` : 'Ruta: sin puntos';
}
btnRoute.addEventListener('click', () => {
  routing = !routing;
  btnRoute.classList.toggle('active', routing);
  btnRoute.textContent = routing ? 'Terminar ruta' : 'Trazar ruta';
});
document.getElementById('btn-clear').addEventListener('click', () => { waypoints = []; updateRoute(); });
map.on('click', e => { if (routing) { waypoints.push(e.latlng); updateRoute(); } });

updateRadar();
