// ===== LÓGICA (edita aquí: Choisaint) =====
const MARS_R = 3389.5;          // radio de Marte en km
const EARTH_R = 6371;           // Leaflet asume la Tierra en sus cálculos
const RADAR_PX = 90;            // radio del radar en píxeles

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
  rangeCircle.setLatLng(me).setRadius(rangeKm * 1000 * (EARTH_R / MARS_R)); // corrige radio terrestre

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

// --- Altitud: se lee el brillo del píxel en el mosaico DEM gris de MOLA ---
const demCache = {};
function loadDemTile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (!demCache[key]) {
    demCache[key] = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";   // si Trek no manda CORS, getImageData fallará (ver mensaje)
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = img.width; cv.height = img.height;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        resolve(ctx);
      };
      img.onerror = () => reject(new Error('No se pudo cargar el tile DEM'));
      img.src = L.Util.template(DEM.url, { z, x, y });
    });
  }
  return demCache[key];
}
async function elevationAt(ll) {
  const z = DEM.maxNativeZoom;
  const p = map.project(ll, z);                       // píxel global en ese zoom
  const tx = Math.floor(p.x / 256), ty = Math.floor(p.y / 256);
  const ctx = await loadDemTile(z, tx, ty);
  const gray = ctx.getImageData(Math.floor(p.x - tx * 256), Math.floor(p.y - ty * 256), 1, 1).data[0];
  return DEM.min + (gray / 255) * (DEM.max - DEM.min); // 0 a 255 -> metros
}

const elevBox = document.getElementById('elev-box');
let hoverTimer;
map.on('mousemove', e => {
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(async () => {
    try {
      const h = await elevationAt(e.latlng);
      elevBox.textContent = `Altitud: ${Math.round(h)} m (aprox.)`;
    } catch (err) {
      elevBox.textContent = 'Altitud no disponible: ' + err.message;
      console.error(err);
    }
  }, 80);
});

// --- Ruta (inicio movible + puntos) ---
const startMarker = L.marker([START[0] - 0.2, START[1] - 0.3], {
  draggable: true, title: "Inicio de la ruta",
  icon: L.divIcon({ className: '', html: '<div class="start-pin"></div>', iconSize: [14, 14], iconAnchor: [7, 7] })
}).addTo(map);

let routing = false, waypoints = [], statsToken = 0;
const routeLine = L.polyline([], { color: "#e0894f", weight: 3, dashArray: "6 6" }).addTo(map);
const routeInfo = document.getElementById('route-info');
const routeElev = document.getElementById('route-elev');
const btnRoute = document.getElementById('btn-route');
const routePoints = () => [startMarker.getLatLng(), ...waypoints];

function updateRoute() {
  const pts = routePoints();
  routeLine.setLatLngs(pts);
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += distKm(pts[i - 1], pts[i]);
  routeInfo.textContent = waypoints.length ? `Ruta: ${pts.length} puntos, ${total.toFixed(1)} km` : 'Ruta: arrastra el punto de inicio o haz clic para sumar puntos';
}

// Perfil de altitud: toma muestras a lo largo de la ruta
async function updateRouteStats() {
  const token = ++statsToken;
  const pts = routePoints();
  if (pts.length < 2) { routeElev.textContent = ''; return; }
  const samples = [];
  for (let i = 1; i < pts.length; i++) {
    const n = Math.max(2, Math.min(15, Math.ceil(distKm(pts[i - 1], pts[i]) / 2))); // una muestra cada ~2 km
    for (let k = 0; k < n; k++) {
      const t = k / n;
      samples.push(L.latLng(pts[i-1].lat + (pts[i].lat - pts[i-1].lat) * t, pts[i-1].lng + (pts[i].lng - pts[i-1].lng) * t));
    }
  }
  samples.push(pts[pts.length - 1]);
  try {
    const hs = await Promise.all(samples.map(elevationAt));
    if (token !== statsToken) return;   // llegó una ruta más nueva
    let up = 0, down = 0, maxSlope = 0;
    for (let i = 1; i < hs.length; i++) {
      const dh = hs[i] - hs[i - 1], dm = distKm(samples[i - 1], samples[i]) * 1000;
      if (dh > 0) up += dh; else down -= dh;
      if (dm > 0) maxSlope = Math.max(maxSlope, Math.abs(dh) / dm * 100);
    }
    routeElev.textContent = `Sube ${Math.round(up)} m, baja ${Math.round(down)} m, pendiente máx. ~${maxSlope.toFixed(0)}% (resolución ~460 m)`;
  } catch (err) {
    routeElev.textContent = 'Altitud no disponible: ' + err.message;
  }
}

btnRoute.addEventListener('click', () => {
  routing = !routing;
  btnRoute.classList.toggle('active', routing);
  btnRoute.textContent = routing ? 'Terminar ruta' : 'Trazar ruta';
});
document.getElementById('btn-clear').addEventListener('click', () => { waypoints = []; updateRoute(); updateRouteStats(); });
document.getElementById('btn-start').addEventListener('click', () => {
  startMarker.setLatLng(astro.getLatLng()); updateRoute(); updateRouteStats();
});
startMarker.on('drag', updateRoute);
startMarker.on('dragend', updateRouteStats);
map.on('click', e => { if (routing) { waypoints.push(e.latlng); updateRoute(); updateRouteStats(); } });

updateRadar();
updateRoute();
