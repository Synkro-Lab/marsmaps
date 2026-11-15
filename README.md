# Martian Map

**NASA Space Apps Challenge 2026 · Interplanetary Survival Guide: Martian Map**

A heads-up-display (HUD) style map a Mars astronaut could use to plan and follow a surface route. It layers optical, topographic and thermal NASA data, shows nearby points of interest on a Halo-style radar, estimates elevation anywhere on the map, and replays the real traverse of the Perseverance rover with its own raw photos at every stop.

**Live demo:** https://synkro-lab.github.io/marsmaps/ <!-- TODO: confirm the final URL -->
**Video:** <!-- TODO: add link -->
**Team:** <!-- TODO: team name and members -->

---

## What it does

| Feature | How it works |
|---|---|
| **Three kinds of data, combined** | Optical (Viking color mosaic as base map), topographic (MOLA color relief) and thermal (THEMIS infrared, day and night). Each overlay has its own opacity slider, so the astronaut can blend them. |
| **Halo-style radar** | Drag the astronaut marker; the radar shows nearby named features by distance and bearing, with an adjustable range. Distances use Mars' radius (3,389.5 km), not Earth's. |
| **~2,000 named features** | A database of Martian nomenclature (name, feature type, origin, elevation), filterable by type from the layer control. |
| **Elevation anywhere** | Hover the map to get an estimated elevation with an error margin (see *Method* below). Named features and rover waypoints carry measured elevations. |
| **Route planner** | Click waypoints (or named features) to build a route. It reports total distance, ascent, descent and maximum slope. |
| **Real rover traverse + photos** | 708 Perseverance waypoints (sol 13 to 2022) drawn on the map. Click a waypoint to see raw photos taken at that location, loaded live from NASA's raw-images API. A guided tour button replays the traverse stop by stop, and one button copies the traverse into the route planner. |
| **Terrain hints from thermal data** | With the night-infrared layer on, hovering shows a *relative* "soil firmness" index. Rock holds heat at night; fine dust does not. |

## Method and honest limits

* **Elevation is estimated, not measured.** NASA Trek does not expose a raw elevation grid in the browser, so the app reads the color of the MOLA color-relief tile and converts it to meters. The conversion was calibrated automatically against 500 named features of known elevation. In a leave-one-out test (each point estimated from the other 499), the **median error was about 100 m and 97% of points fell within ±1,500 m**. It is weakest above roughly 6,000 m and on white (snow/ice or strongly lit) pixels, where the app widens the error margin shown next to the value.
* **Thermal values are relative.** THEMIS mosaics are infrared brightness, not calibrated temperatures. The app shows a relative index and says so. By day, brighter means warmer; at night, brighter means the ground retains heat (rock, firmer terrain).
* **Slope is approximate.** Rover waypoints are close together and their elevations are noisy, so slope is computed over stretches of at least 30 m.
* **Photos:** when NASA has no photo from the exact waypoint, the popup says so and shows photos from the same sol.
* **Not included yet:** radiation and weather layers (for example Curiosity RAD and Perseverance MEDA data), a spectral layer, and automatic obstacle-avoiding routing. These are the natural next steps.

## Data sources

* NASA Mars Trek (JPL): MGS MOLA color relief, Viking MDIM color mosaic, MOLA+HRSC shaded relief, THEMIS day and night infrared mosaics.
* NASA Mars 2020 Perseverance: traverse waypoints (MMGIS `M20_waypoints`) and raw images (NASA raw-images API). Photos: NASA/JPL-Caltech.
* Martian nomenclature database: <!-- TODO (Diego): cite the original source, e.g. the IAU Gazetteer of Planetary Nomenclature, and the date it was downloaded -->

## Run it locally

No build step. Clone the repo and serve the folder with any static server, for example the *Live Server* extension in VS Code, then open `index.html`.

```
index.html          page
app.js              logic (map, radar, route, elevation, rover)
data.js             layers and points of interest
nomenclatura.js     named-features database
calibracion.js      color-to-elevation calibration samples
m20_waypoints.js    local copy of NASA's Perseverance waypoints
style.css           styles
```

Built with [Leaflet](https://leafletjs.com/). Optional: `generarCalibracion()` in the browser console regenerates `calibracion.js`.

---

## Resumen en español

**Martian Map** es un mapa tipo HUD para un astronauta en Marte. Combina datos ópticos (Viking), topográficos (MOLA) y térmicos (THEMIS) con deslizadores de opacidad, un radar estilo Halo de puntos de interés cercanos, una estimación de altitud con margen de error (calibrada con ~500 puntos de altura conocida: error mediano de ~100 m), un planificador de rutas con distancia, desnivel y pendiente, y el recorrido real del rover Perseverance con las fotos raw de NASA en cada parada.

**Límites:** la altitud es estimada, la información térmica es relativa (no son grados) y la pendiente es aproximada. Faltan capas de radiación y clima, y rutas que esquiven obstáculos automáticamente.
