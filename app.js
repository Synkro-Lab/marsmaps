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


// --- Capas superpuestas con deslizador de opacidad (topografía, térmica...) ---
const overlayBox = document.createElement('div');
overlayBox.id = 'overlay-box';
overlayBox.innerHTML = '<h3>Capas superpuestas</h3>';
document.body.appendChild(overlayBox);
L.DomEvent.disableClickPropagation(overlayBox);    // que usar los sliders no mueva el mapa
L.DomEvent.disableScrollPropagation(overlayBox);

OVERLAYS.forEach(o => {
  if (o.url.includes('PEGAR')) return;             // todavía sin URL: se omite
  const layer = L.tileLayer(o.url, {
    maxNativeZoom: o.maxNativeZoom, maxZoom: 8, opacity: o.opacity,
    zIndex: 10,                                    // siempre por encima del mapa base
    attribution: 'NASA/JPL Trek'
  });
  o._layer = layer;                                // guardamos la capa para saber luego si está encendida
  layersControl.addOverlay(layer, o.name);         // casilla para encender/apagar
  const row = document.createElement('label');
  const pct = document.createElement('b');
  pct.textContent = Math.round(o.opacity * 100) + '%';
  row.append(o.name + ': ', pct);
  const sl = document.createElement('input');
  sl.type = 'range'; sl.min = 0; sl.max = 100; sl.value = o.opacity * 100;
  sl.addEventListener('input', () => {
    layer.setOpacity(sl.value / 100);
    pct.textContent = sl.value + '%';
  });
  overlayBox.append(row, sl);
});

if (OVERLAYS.some(o => o.termica && o._layer)) {   // leyenda: una sola vez, después de crear las capas
  const leyenda = document.createElement('p');
  leyenda.className = 'leyenda';
  leyenda.innerHTML = '<b>Térmica (THEMIS):</b> imagen infrarroja en gris, no son grados. De día, más brillante = más caliente. De noche, más brillante = el suelo retiene calor (roca, terreno firme); oscuro = polvo fino y blando.';
  overlayBox.appendChild(leyenda);
}


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
            const termico = await textoTermico(e.latlng);
      if (frozen) return;
      elevBox.textContent = `Lat ${e.latlng.lat.toFixed(3)}, Lon ${e.latlng.lng.toFixed(3)} · Altitud ${Math.round(h)} m${lastSpread !== null ? ' ±' + Math.round(lastSpread) : ''} (aprox.)` + termico;
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


// --- Lectura térmica relativa (THEMIS en gris: el brillo es radiación infrarroja, NO grados) ---
const tileCache = {};
function loadTileUrl(url, z, x, y) {
  const key = `${url}|${z}/${x}/${y}`;
  if (!tileCache[key]) {
    tileCache[key] = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = img.width; cv.height = img.height;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        resolve(ctx);
      };
      img.onerror = () => reject(new Error('tile térmico no disponible'));
      img.src = L.Util.template(url, { z, x, y });
    });
  }
  return tileCache[key];
}

async function grisAt(o, ll) {            // brillo promedio 0-255 en 5x5 píxeles
  const z = o.maxNativeZoom;
  const p = map.project(ll, z);
  const tx = Math.floor(p.x / 256), ty = Math.floor(p.y / 256);
  const ctx = await loadTileUrl(o.url, z, tx, ty);
  const N = 5, half = 2;
  const px = Math.max(0, Math.min(256 - N, Math.floor(p.x - tx * 256) - half));
  const py = Math.max(0, Math.min(256 - N, Math.floor(p.y - ty * 256) - half));
  const d = ctx.getImageData(px, py, N, N).data;
  let suma = 0;
  for (let i = 0; i < d.length; i += 4) suma += (d[i] + d[i + 1] + d[i + 2]) / 3;
  return suma / (d.length / 4);
}

// Texto para la caja de abajo: solo de las capas térmicas que estén encendidas
async function textoTermico(ll) {
  const partes = [];
  for (const o of OVERLAYS) {
    if (!o.termica || !o._layer || !map.hasLayer(o._layer)) continue;
    const etiqueta = o.termica === 'dia' ? 'Calor de día' : 'Firmeza del suelo';
    try {
      const g = await grisAt(o, ll);
      if (g < 2) { partes.push(`${etiqueta}: sin datos`); continue; }
      const nivel = g < 85 ? 'bajo' : g < 170 ? 'medio' : 'alto';
      partes.push(`${etiqueta} (rel.): ${nivel} ${Math.round(g / 2.55)}/100`);
    } catch (err) { /* sin lectura: no se muestra */ }
  }
  return partes.length ? ' · ' + partes.join(' · ') : '';
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
    let up = 0, down = 0, maxSlope = 0, ref = 0;
    const MIN_TRAMO_M = 30;                       // tramos más cortos se agrupan: el ruido de altura no se acumula
    for (let i = 1; i < hs.length; i++) {
      const dm = distKm(pts[ref], pts[i]) * 1000;
      if (dm < MIN_TRAMO_M && i < hs.length - 1) continue;
      const dh = hs[i] - hs[ref];
      if (dh > 0) up += dh; else down -= dh;
      if (dm >= MIN_TRAMO_M) maxSlope = Math.max(maxSlope, Math.abs(dh) / dm * 100);
      ref = i;
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

// --- Rover Perseverance: ruta (M20_waypoints.json) + fotos raw de NASA por sol ---
// Ruta: si existe m20_waypoints.js (const M20_WAYPOINTS = {...}) se usa ese; si no, se descarga de NASA.
const M20_JSON = "https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json";
// Fotos raw: se piden al hacer clic en un waypoint (una consulta por sol, con caché)
const M20_RAW_API = "https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&ver=1.2";
const M20_RAW_PAGINAS = 5;    // máx. páginas de 100 fotos por sol que se revisan
const M20_MAX_FOTOS = 6;      // fotos mostradas por waypoint
const M20_EN_RADAR = false;   // true = los waypoints también salen en el radar y en "Cerca de ti"
const M20_MS_PASO = 2500;     // milisegundos entre waypoints en el recorrido automático

const m20Group = L.layerGroup();
const m20Line = L.polyline([], { color: "#5ee7d6", weight: 2, opacity: 0.8 }).addTo(m20Group);
let m20Pts = [], m20Idx = -1, m20Timer = null;
const m20RawCache = {};       // sol -> Promise con todas las fotos de ese sol

// Convierte el GeoJSON de NASA en una lista simple de waypoints
function m20Parse(gj) {
  return gj.features.map(f => {
    const p = f.properties;
    return { lat: p.lat, lng: normLng(p.lon), sol: p.sol, site: p.site, drive: p.drive,
             km: p.dist_km, elev: p.elev_geoid, nota: p.Note, final: p.final };
  }).filter(p => isFinite(p.lat) && isFinite(p.lng))
    .sort((a, b) => a.sol - b.sol);                 // orden cronológico (estable: respeta el orden del archivo)
}

// --- Fotos raw ---
async function m20RawDeSol(sol) {
  if (!m20RawCache[sol]) {
    m20RawCache[sol] = (async () => {
      let todas = [];
      for (let page = 0; page < M20_RAW_PAGINAS; page++) {
        const url = `${M20_RAW_API}&num=100&page=${page}&order=sol+asc&condition_2=${sol}:sol:gte&condition_3=${sol}:sol:lte`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const j = await resp.json();
        const arr = j.images || j.image || [];
        todas = todas.concat(arr);
        if (arr.length < 100) break;
      }
      return todas;
    })().catch(err => { delete m20RawCache[sol]; throw err; });   // si falla, que se pueda reintentar
  }
  return m20RawCache[sol];
}

const m20Prioridad = c => /MCZ|ZCAM/i.test(c) ? 0 : /NAVCAM/i.test(c) ? 1 : /SUPERCAM/i.test(c) ? 2 : /HAZCAM/i.test(c) ? 3 : 4;
const m20Cam = i => (i.camera && i.camera.instrument) || '?';

function m20Dim(i) {   // tamaño de la foto "(1648,1200)" para reservar el alto antes de que cargue
  let ext = i.extended;
  if (typeof ext === 'string') { try { ext = JSON.parse(ext); } catch (e) { ext = {}; } }
  const m = /\((\d+)\s*,\s*(\d+)\)/.exec((ext && ext.dimension) || '');
  return m ? [+m[1], +m[2]] : [4, 3];
}

// Elige las fotos de ESTE waypoint: mismo sitio y drive; si no hay, cae a las del sol
function m20Elegir(imgs, p) {
  const ok = imgs.filter(i => i.image_files && (i.image_files.small || i.image_files.medium));
  const exactas = ok.filter(i => Number(i.site) === Number(p.site) && Number(i.drive) === Number(p.drive));
  let base = exactas.length ? exactas : ok;
  const completas = base.filter(i => i.sample_type !== 'Thumbnail');
  if (completas.length) base = completas;
  base = base.slice().sort((a, b) =>
    m20Prioridad(m20Cam(a)) - m20Prioridad(m20Cam(b)) ||
    String(a.date_taken_utc).localeCompare(String(b.date_taken_utc)));
  const cuenta = {}, lista = [];
  for (const i of base) {                           // máximo 2 por cámara, para variar
    const c = m20Cam(i);
    cuenta[c] = (cuenta[c] || 0) + 1;
    if (cuenta[c] > 2) continue;
    lista.push({ cam: c, hora: i.date_taken_mars || '', dim: m20Dim(i),
                 small: i.image_files.small || i.image_files.medium,
                 large: i.image_files.large || i.image_files.medium || i.image_files.full_res });
    if (lista.length >= M20_MAX_FOTOS) break;
  }
  return { lista, exacto: exactas.length > 0, total: ok.length };
}

// fotos: null = cargando · {error} = falló · {lista, exacto, total} = listo
function m20Popup(p, fotos) {
  const galeria = `https://mars.nasa.gov/mars2020/multimedia/raw-images/?sol=${p.sol}`;
  let h = `<b>Sol ${p.sol}</b> · sitio ${p.site}, drive ${p.drive}`;
  h += `<br>${p.lat.toFixed(5)}°, ${p.lng.toFixed(5)}° · ${p.km} km recorridos`;
  if (p.elev !== undefined) h += `<br>Altitud: ${Math.round(p.elev)} m`;
  if (p.nota) h += `<br><small>${esc(p.nota)}</small>`;
  if (!fotos) return h + `<br><small>Cargando fotos raw…</small>`;
  if (fotos.error) return h + `<br><small>⚠ No se pudieron cargar las fotos (${esc(fotos.error)}). ` +
                              `<a href="${galeria}" target="_blank" rel="noopener">Ver el sol ${p.sol} en NASA ↗</a></small>`;
  if (!fotos.lista.length) return h + `<br><small>NASA no tiene fotos raw de este sol. ` +
                              `<a href="${galeria}" target="_blank" rel="noopener">Ver galería ↗</a></small>`;
  h += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;width:280px">` +
    fotos.lista.map(i =>
      `<a href="${i.large}" target="_blank" rel="noopener" title="${esc(i.cam)} · ${esc(i.hora)}" style="display:block;width:calc(50% - 3px)">` +
      `<img src="${i.small}" alt="${esc(i.cam)}" style="width:100%;aspect-ratio:${i.dim[0]}/${i.dim[1]};display:block;background:#222" ` +
      `onerror="this.style.visibility='hidden'"><small>${esc(i.cam)}</small></a>`).join('') + `</div>`;
  h += `<small style="display:block;margin-top:6px">` +
       (fotos.exacto ? 'Fotos tomadas en este punto. ' : 'Sin fotos exactas de este punto: se muestran fotos de ese sol. ') +
       `<a href="${galeria}" target="_blank" rel="noopener">Todas las del sol ${p.sol} ↗</a> · Fotos: NASA/JPL-Caltech</small>`;
  return h;
}

async function m20CargarFotos(p, pop) {
  let html;
  try {
    html = m20Popup(p, m20Elegir(await m20RawDeSol(p.sol), p));
  } catch (err) {
    console.warn('Fotos raw M20:', err);
    html = m20Popup(p, { error: err.message });
  }
  if (map.hasLayer(pop)) pop.setContent(html);       // si ya abrió otro popup, no lo pisa
}

// Diagnóstico: en la consola escribe  probarRawM20()  (o probarRawM20(100) para otro sol)
async function probarRawM20(sol = 14) {
  const t0 = performance.now();
  const imgs = await m20RawDeSol(sol);
  console.log(`API raw OK: ${imgs.length} fotos en el sol ${sol} (${Math.round(performance.now() - t0)} ms)`);
  const ej = imgs.find(i => i.image_files);
  if (ej) console.log('Ejemplo:', m20Cam(ej), '· site', ej.site, '· drive', ej.drive, '·', ej.image_files.small);
  return imgs;
}

// Va a un waypoint: abre su popup y pide sus fotos. moverAstro = el astronauta (y el radar) lo siguen.
function m20Ir(i, moverAstro = true) {
  if (!m20Pts.length) return;
  i = Math.max(0, Math.min(m20Pts.length - 1, i));
  m20Idx = i;
  const p = m20Pts[i], ll = L.latLng(p.lat, p.lng);
  if (moverAstro) { astro.setLatLng(ll); updateRadar(); map.panTo(ll); }
  const pop = L.popup({ maxWidth: 320 }).setLatLng(ll).setContent(m20Popup(p, null)).openOn(map);
  m20Info.textContent = `Sol ${p.sol} · waypoint ${i + 1}/${m20Pts.length}`;
  m20CargarFotos(p, pop);
}

function m20Parar() {
  clearInterval(m20Timer); m20Timer = null;
  btnM20Play.textContent = '▶ Recorrido';
}
function m20Play() {
  if (!m20Pts.length) return;
  if (m20Timer) { m20Parar(); return; }
  if (m20Idx >= m20Pts.length - 1) m20Idx = -1;       // si terminó, vuelve a empezar
  btnM20Play.textContent = '⏸ Pausar';
  const paso = () => { if (m20Idx >= m20Pts.length - 1) m20Parar(); else m20Ir(m20Idx + 1); };
  paso();
  m20Timer = setInterval(paso, M20_MS_PASO);
}

// Copia la ruta del rover a TU ruta (inicio + puntos): así obtienes distancia total y perfil de altitud
function m20CargarComoRuta() {
  if (m20Pts.length < 2) return;
  m20Parar();
  const aLatLng = p => { const l = L.latLng(p.lat, p.lng); l.elev = p.elev; return l; };   // altura real medida por el rover
  startMarker.setLatLng(aLatLng(m20Pts[0]));
  waypoints = m20Pts.slice(1).map(aLatLng);
  updateRoute(); updateRouteStats();
  map.fitBounds(routeLine.getBounds());
}

// Panel dentro de "Ruta"
const m20Box = document.createElement('div');
m20Box.innerHTML = '<h3>Rover Perseverance</h3>';
const m20Btn = (txt, title, fn) => {
  const b = document.createElement('button');
  b.textContent = txt; b.title = title; b.style.margin = '0 4px 4px 0';
  b.addEventListener('click', fn);
  return b;
};
const btnM20Play = m20Btn('▶ Recorrido', 'Recorre la ruta waypoint por waypoint', m20Play);
const m20Info = document.createElement('p');
m20Info.textContent = 'Cargando ruta del rover…';
m20Box.append(
  btnM20Play,
  m20Btn('◀', 'Waypoint anterior', () => { m20Parar(); m20Ir(m20Idx - 1); }),
  m20Btn('▶|', 'Waypoint siguiente', () => { m20Parar(); m20Ir(m20Idx + 1); }),
  m20Btn('Usar como mi ruta', 'Copia la ruta del rover a Trazar ruta', m20CargarComoRuta),
  m20Info
);
routeElev.after(m20Box);

async function cargarRover() {
  let gj;
  if (typeof M20_WAYPOINTS !== 'undefined') gj = M20_WAYPOINTS;       // m20_waypoints.js: funciona abriendo index.html directo
  else {
    const resp = await fetch(M20_JSON);                                // alternativa: requiere que NASA permita CORS
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    gj = await resp.json();
  }
  m20Pts = m20Parse(gj);
  m20Line.setLatLngs(m20Pts.map(p => [p.lat, p.lng]));

  m20Pts.forEach((p, i) => {
    const fin = p.final === "y";                       // "y" = fin de recorrido, "m" = a mitad de recorrido
    L.circleMarker([p.lat, p.lng], {
        radius: fin ? 5 : 3, weight: 1, color: "#5ee7d6",
        fillColor: fin ? "#5ee7d6" : "#0b0d12", fillOpacity: 0.9, bubblingMouseEvents: false })
      .on('click', () => {
        if (routing) {                                 // modo ruta: el waypoint entra a la ruta
          const ll = L.latLng(p.lat, p.lng);
          ll.elev = p.elev;
          waypoints.push(ll);
          updateRoute(); updateRouteStats();
        } else m20Ir(i, false);                        // modo normal: muestra sus fotos
      })
      .addTo(m20Group);
    if (M20_EN_RADAR) POIS.push({ name: `Perseverance · sol ${p.sol}`, lat: p.lat, lng: p.lng,
                                  elev: p.elev, type: 'rover', cat: 'Rover' });
  });

  m20Group.addTo(map);
  layersControl.addOverlay(m20Group, `Ruta Perseverance (sol ${m20Pts[0].sol}–${m20Pts[m20Pts.length - 1].sol})`);
  map.fitBounds(m20Line.getBounds());
  if (M20_EN_RADAR) updateRadar();
  m20Info.textContent = `${m20Pts.length} waypoints · haz clic en uno para ver sus fotos raw`;
}

updateRadar();
updateRoute();

// Carga la base de datos al final, cuando todo lo demás ya existe
cargarNomenclatura().catch(err => {
  console.error('No se pudo cargar la base de datos:', err);
  routeElev.textContent = '⚠ No se pudo cargar la base de datos (falta nomenclatura.js o mars_nomenclature.json)';
});

// Ruta del rover Perseverance (después de la base de datos, para que el control de capas ya tenga sus tipos)
cargarRover().catch(err => {
  console.error('No se pudo cargar la ruta del rover:', err);
  m20Info.textContent = '⚠ No se pudo cargar la ruta (falta m20_waypoints.js o NASA bloqueó la descarga)';
});
