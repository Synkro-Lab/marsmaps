// ===== LÓGICA (edita aquí: Choisaint) =====
const MARS_R = 3389.5;          // radio de Marte en km
const EARTH_R = 6371;           // Leaflet asume la Tierra en sus cálculos
const RADAR_PX = 90;            // radio del radar en píxeles
const DB_URL = "mars_nomenclature.json";  // base de datos de nomenclatura (build_mars_db.py)
const MAX_BLIPS = 150;          // máximo de puntos dibujados en el radar
const MAX_NEARBY = 15;          // máximo de filas en "Cerca de ti"

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
// preferCanvas: dibuja los ~2000 puntos en un canvas (mucho más rápido que SVG)
const map = L.map('map', { crs: L.CRS.EPSG4326, center: START, zoom: 5, minZoom: 1, maxZoom: 8, preferCanvas: true });

const baseLayers = {};
BASE_LAYERS.forEach((b, i) => {
  const layer = L.tileLayer(b.url, { maxNativeZoom: b.maxNativeZoom, maxZoom: 8, attribution: 'NASA/JPL Trek' });
  baseLayers[b.name] = layer;
    if (b.name === "Mosaico Viking") layer.addTo(map);
});

// --- Puntos de interés ---
const poiGroup = L.layerGroup();   // empieza apagado; contiene los manuales y todos los grupos por tipo
const tipoGroups = {};                        // un grupo por tipo de la base de datos

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Color estable para cada tipo (Crater, Mons, Vallis...) sin tener que definirlos a mano
function colorTipo(cat) {
  let h = 0;
  for (const c of cat) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h}, 70%, 60%)`;
}

function popupHtml(p) {
  let h = `<b>${esc(p.name)}</b>`;
  if (p.fromDb) {
    if (p.tipo)   h += `<br>Tipo: ${esc(p.tipo)}`;
    if (p.etnia)  h += `<br>Etnia: ${esc(p.etnia)}`;
    if (p.origen) h += `<br>Origen: ${esc(p.origen)}`;
  } else if (p.desc) {
    h += `<br>${esc(p.desc)}`;
  }
  if (p.elev !== undefined) h += `<br>Altitud: ${p.elev} m`;
  return h;
}

function addPoi(p, group) {
  const color = p.fromDb ? colorTipo(p.cat)
    : p.type === "peligro" ? "#e0894f" : p.type === "base" ? "#5ee7d6" : "#f2d36b";
  L.circleMarker([p.lat, p.lng], {
      radius: p.fromDb ? 4 : 9, weight: p.fromDb ? 1 : 3,
      color, fillOpacity: 0.8, bubblingMouseEvents: false })
    .on('click', () => {
      if (routing) {                       // modo ruta: el punto entra a la ruta
        const ll = L.latLng(p.lat, p.lng);
        ll.elev = p.elev;                  // altura (medida a mano o de la base de datos)
        waypoints.push(ll);
        updateRoute(); updateRouteStats();
      } else {                             // modo normal: muestra la información
        L.popup().setLatLng([p.lat, p.lng]).setContent(popupHtml(p)).openOn(map);
      }
    })
    .addTo(group);
}
POIS.forEach(p => addPoi(p, poiGroup));

// --- Base de datos de nomenclatura (mars_nomenclature.json) ---
// La base trae longitudes 0..360; el mapa usa -180..180
const normLng = lng => ((lng + 180) % 360 + 360) % 360 - 180;

async function cargarNomenclatura() {
  let filas;
  if (typeof NOMENCLATURA !== 'undefined') {
    filas = NOMENCLATURA;                       // viene de nomenclatura.js: funciona abriendo index.html directo
  } else {
    const resp = await fetch(DB_URL);           // alternativa: requiere servidor local
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    filas = await resp.json();
  }

  const existentes = new Set(POIS.map(p => p.name.toLowerCase()));   // no duplicar los manuales
  const conteo = {};
  for (const f of filas) {
    if (!f.nombre || f.latitud == null || f.longitud == null) continue;
    if (existentes.has(f.nombre.toLowerCase())) continue;
    const cat = (f.tipo || 'Otros').split(',')[0].trim();            // "Crater, craters" -> "Crater"
    const p = {
      name: f.nombre, lat: f.latitud, lng: normLng(f.longitud),
      elev: f.altitud ?? undefined,
      type: 'nomenclatura', fromDb: true, cat,
      tipo: f.tipo, etnia: f.etnia, origen: f.origen
    };
    POIS.push(p);                                                    // el radar también los ve
       if (!tipoGroups[cat]) { tipoGroups[cat] = L.layerGroup(); poiGroup.addLayer(tipoGroups[cat]); }
    addPoi(p, tipoGroups[cat]);
    conteo[cat] = (conteo[cat] || 0) + 1;
  }
  // Un interruptor por tipo en el control de capas
  Object.keys(tipoGroups).sort().forEach(cat =>
    layersControl.addOverlay(tipoGroups[cat], `${cat} (${conteo[cat]})`));
  updateRadar();
}

// --- Astronauta (arrástralo y el radar se actualiza) ---
const astro = L.marker(START, { draggable: true, title: "Astronauta" }).addTo(map);
const rangeCircle = L.circle(START, { radius: 0, color: "#5ee7d6", weight: 1, fill: false }).addTo(map);

const layersControl = L.control.layers(baseLayers, { "Puntos de interés": poiGroup }).addTo(map);

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
    if (d <= rangeKm) found.push({ p, d });
  });
  found.sort((a, b) => a.d - b.d);

  found.slice(0, MAX_BLIPS).forEach(({ p, d }) => {
    const th = bearing(me, p);
    const r = (d / rangeKm) * RADAR_PX;
    const el = document.createElement('div');
    el.className = 'blip';
    el.style.left = (RADAR_PX + r * Math.sin(th)) + 'px';
    el.style.top  = (RADAR_PX - r * Math.cos(th)) + 'px';
    el.title = p.name;
    blips.appendChild(el);
  });
  found.slice(0, MAX_NEARBY).forEach(({ p, d }) => {
    const li = document.createElement('li');
    li.textContent = `${p.name}${p.cat ? ' (' + p.cat + ')' : ''}: ${d.toFixed(1)} km`;
    nearby.appendChild(li);
  });
  if (!found.length) nearby.innerHTML = '<li>Nada en el radar</li>';
  else if (found.length > MAX_NEARBY) {
    const li = document.createElement('li');
    li.textContent = `…y ${found.length - MAX_NEARBY} más dentro del alcance`;
    nearby.appendChild(li);
  }
}
astro.on('drag', updateRadar);
rangeInput.addEventListener('input', updateRadar);

// --- Altitud: se estima por el color del mapa MOLA, calibrado con la base de nomenclatura ---
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

function hueOf(r, g, b) {
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  if (d === 0) return null;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

function heightFromHue(h) {
  const T = CAL_TABLE;
  if (h <= T[0][0]) return T[0][1];
  for (let i = 1; i < T.length; i++) {
    if (h <= T[i][0]) {
      const [h0, e0] = T[i - 1], [h1, e1] = T[i];
      return e0 + (h - h0) * (e1 - e0) / (h1 - h0);
    }
  }
  return T[T.length - 1][1];
}

let lastHue = null;   // último tono leído (para calibrar)
let lastSat = 0;
let frozen = false;   // true = la caja de altitud se queda quieta

// Lee el color promedio (5x5 píxeles) del mapa en un punto
async function colorAt(ll) {
  const z = DEM.maxNativeZoom;
  const p = map.project(ll, z);                       // píxel global en ese zoom
  const tx = Math.floor(p.x / 256), ty = Math.floor(p.y / 256);
  const ctx = await loadDemTile(z, tx, ty);
  const N = 5, half = 2;
  const px = Math.max(0, Math.min(256 - N, Math.floor(p.x - tx * 256) - half));
  const py = Math.max(0, Math.min(256 - N, Math.floor(p.y - ty * 256) - half));
  const d = ctx.getImageData(px, py, N, N).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4; r /= n; g /= n; b /= n;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const s = mx === 0 ? 0 : (mx - mn) / mx;
  let h = hueOf(r, g, b);
  if (h === null) h = 0;
  if (h > 320) h -= 360;   // rojos que cruzan el 0: sin esto se leerían como la zona más baja
  return { h, s };
}

// Estima la altura por vecinos más cercanos en (tono, saturación).
// data = CALIB = [[tono, sat, metros], ...] generado con generarCalibracion() a partir de la base de nomenclatura.
function estimar(h, s, data = CALIB, skip = -1) {
  const blanco = s < SAT_MIN;
  const cand = [];
  for (let i = 0; i < data.length; i++) {
    if (i === skip) continue;
    const [h2, s2, a2] = data[i];
    if (blanco !== (s2 < SAT_MIN)) continue;            // los blancos solo se comparan con blancos
    const dh = blanco ? 0 : (h - h2) / 10;
    const ds = (s - s2) / 0.05;
    cand.push({ d: dh * dh + ds * ds, a: a2 });
  }
  if (!cand.length) return null;
  cand.sort((x, y) => x.d - y.d);
  const v = (blanco ? cand : cand.slice(0, 9)).map(x => x.a).sort((x, y) => x - y);
  const q1 = v[Math.floor((v.length - 1) * 0.25)], q3 = v[Math.floor((v.length - 1) * 0.75)];
  return { alt: v[v.length >> 1], spread: (q3 - q1) / 2 };   // spread = margen de error (±)
}

let lastSpread = null;
async function elevationAt(ll) {
  const { h, s } = await colorAt(ll);
  lastHue = s < SAT_MIN ? null : h;
  lastSat = s;
  if (typeof CALIB !== 'undefined') {                   // con calibracion.js: vecinos más cercanos
    const e = estimar(h, s);
    if (e) { lastSpread = e.spread; return e.alt; }
  }
  lastSpread = null;                                    // sin calibracion.js: tabla vieja
  if (s < SAT_MIN) throw new Error('blanco: sin dato (cumbre o ladera iluminada)');
  return heightFromHue(h);
}

// Se ejecuta UNA vez desde la consola del navegador: generarCalibracion()
// Lee el color del mapa en puntos de la base de nomenclatura (altura real conocida) y descarga calibracion.js
async function generarCalibracion(n = 500) {
    const todas = POIS.filter(p => p.fromDb && p.elev !== undefined);
  const altas = todas.filter(p => p.elev > 3000);   // todas las zonas altas: hay pocas y son las difíciles
  const resto = todas.filter(p => p.elev <= 3000).sort(() => Math.random() - 0.5).slice(0, n);
  const filas = [...altas, ...resto];
  const datos = [];
  for (let i = 0; i < filas.length; i += 20) {
    const lote = filas.slice(i, i + 20);
    const res = await Promise.allSettled(lote.map(p => colorAt(L.latLng(p.lat, p.lng))));
    res.forEach((r, j) => {
      if (r.status === 'fulfilled')
        datos.push([+r.value.h.toFixed(1), +r.value.s.toFixed(3), Math.round(lote[j].elev)]);
    });
    elevBox.textContent = `Calibrando… ${Math.min(i + 20, filas.length)} / ${filas.length}`;
  }
  // Prueba "dejando uno afuera": cada punto se estima con todos los demás
  const errs = datos.map((x, i) => {
    const e = estimar(x[0], x[1], datos, i);
    return e ? Math.abs(e.alt - x[2]) : null;
  }).filter(e => e !== null).sort((a, b) => a - b);
  console.log(`Puntos: ${datos.length} · error mediano: ${Math.round(errs[errs.length >> 1])} m · ` +
    `dentro de ±1500 m: ${Math.round(100 * errs.filter(e => e <= 1500).length / errs.length)}%`);
  Object.keys(demCache).forEach(k => delete demCache[k]);   // libera memoria
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([`const CALIB = ${JSON.stringify(datos)};\n`], { type: 'text/javascript' }));
  a.download = 'calibracion.js'; a.click();
  elevBox.textContent = 'Calibración lista: calibracion.js descargado';
}

const elevBox = document.getElementById('elev-box');
let hoverTimer;
map.on('mousemove', e => {
  if (frozen) return;
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(async () => {
    try {
      const h = await elevationAt(e.latlng);
      if (frozen) return;
      elevBox.textContent = `Lat ${e.latlng.lat.toFixed(3)}, Lon ${e.latlng.lng.toFixed(3)} · tono ${lastHue === null ? 'blanco' : Math.round(lastHue)} · sat ${Math.round(lastSat * 100)}% · Altitud ${Math.round(h)} m${lastSpread !== null ? ' ±' + Math.round(lastSpread) : ''} (aprox.)`;
    } catch (err) {
            elevBox.textContent = `Lat ${e.latlng.lat.toFixed(3)}, Lon ${e.latlng.lng.toFixed(3)} · sat ${Math.round(lastSat * 100)}% · ${err.message}`;
    }
  }, 80);
});
// Clic (fuera del modo ruta): fija o suelta la lectura para poder copiarla
map.on('click', () => {
  if (routing) return;
  frozen = !frozen;
  elevBox.style.outline = frozen ? '1px solid #5ee7d6' : 'none';
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
  let approx = false;
  try {
    const hs = await Promise.all(pts.map(async q => {
      if (q.elev !== undefined) return q.elev;   // altura medida a mano
      approx = true;
      return elevationAt(q);                     // estimación por color
    }));
    if (token !== statsToken) return;
    let up = 0, down = 0, maxSlope = 0;
    for (let i = 1; i < hs.length; i++) {
      const dh = hs[i] - hs[i - 1], dm = distKm(pts[i - 1], pts[i]) * 1000;
      if (dh > 0) up += dh; else down -= dh;
      if (dm > 0) maxSlope = Math.max(maxSlope, Math.abs(dh) / dm * 100);
    }
    routeElev.textContent = `${approx ? '≈ ' : ''}Sube ${Math.round(up)} m, baja ${Math.round(down)} m, pendiente máx. ~${maxSlope.toFixed(0)}%`;
  }
  catch (err) { routeElev.textContent = 'Altitud no disponible: ' + err.message; }
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

// --- Panel de ruta colapsable ---
const panel = document.getElementById('panel');
const btnCollapse = document.getElementById('btn-collapse');
btnCollapse.addEventListener('click', () => {
  const collapsed = panel.classList.toggle('collapsed');
  btnCollapse.textContent = collapsed ? '+' : '–';
  btnCollapse.title = collapsed ? 'Expandir panel' : 'Colapsar panel';
});

updateRadar();
updateRoute();

// Carga la base de datos al final, cuando todo lo demás ya existe
cargarNomenclatura().catch(err => {
  console.error('No se pudo cargar la base de datos:', err);
  routeElev.textContent = '⚠ No se pudo cargar la base de datos (falta nomenclatura.js o mars_nomenclature.json)';
});
