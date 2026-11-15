# FieldWork Labs

A local agricultural monitoring application with work map imports, geographic visualization, measurement summaries, and integration with an external simulation API. HTML, CSS, and JavaScript frontend; Python 3.10 or later backend, with no external dependencies.

## Run

From the repository root:

```bash
python3 backend/app.py
```

Open http://127.0.0.1:8000. For a different port: `python3 backend/app.py --port 8080`.

## Configuration and modules

| Variable | Default | CLI argument |
| --- | --- | --- |
| `FIELDWORK_HOST` | `127.0.0.1` | `--host` |
| `FIELDWORK_PORT` | `8000` | `--port` |
| `FIELDWORK_FRONTEND_DIR` | Repository's `frontend/` | `--frontend-dir` |
| `FIELDWORK_DATA_DIR` | Repository's `storage/` | `--data-dir` |
| `FIELDWORK_PREDICTION_URL` | `http://localhost:8001/api/v1/simular` | No CLI argument |

Externally supplied relative paths are resolved from the working directory. Default paths are independent of that directory. Variables are read from the process environment; the backend does not load `.env` files automatically.

```bash
FIELDWORK_HOST=0.0.0.0 FIELDWORK_PORT=8080 python3 -m backend.app
```

## Backend structure

- `backend/datasets/`: GeoJSON boundaries, environmental catalog, dates, and demo parameters.
- `backend/repositories/`: access to demo observations, sample maps, and SQLite persistence.
- `backend/services/`: environmental queries, map imports/exports, and prediction client.
- `backend/domain/workmaps.py`: supported variables, validation, metadata, and shared record summaries.
- `backend/geometry.py` and `backend/simulation.py`: geographic calculations and synthetic spatial generation.
- `backend/server.py`, `backend/config.py`, and `backend/app.py`: HTTP, configuration, and process composition.

Imported maps and examples share summary calculations and catalog representation. Geometric areas use a single function in `geometry.py`. User files remain in `storage/`; static demo data is located in `datasets/`.

To verify imports, persistence, and simulation: `python3 -m unittest discover -s tests -v`.

## Frontend structure

The browser loads `frontend/app.js` as a native module. No build step or development dependencies are required. It is served by the Python backend.

- `views/`: Fields (Lotes), Summary (Resumen), Work maps (Mapas de trabajo), Predictions (Predicciones), and Reports (Reportes), with their mount and cleanup lifecycles.
- `services/`: JSON HTTP client and access to observations, maps, and simulation.
- `datasets/`: measurement catalog, palettes, and report reference values.
- `domain/`: statistics, map names, and shared selection and simulation state.
- `maps/`: Leaflet presentation and ArcGIS adapter.
- `components/`: navigation and chat.
- `shared/`: element creation and number and date formatting.
- `config/arcgis.js`: geographic service configuration.
- `styles/main.css`: styles, responsive rules, and printing, preserving cascade order.

Views use explicit imports. Queries share response validation and honor cancellation when switching views. Environmental dates come from the backend catalog. `window.GeoMap` and `window.ARCGIS_CONFIG` retain public access for integrations.

To run frontend tests with Node.js: `node --test tests/frontend.test.mjs`.

## Features

- **Summary** (initial view): file selection, aggregate indicators, measurement averages and availability, and a schematic geometry view.
- **Fields**: simulated environmental layers over Lote Norte or the selected file's boundary, with mean, minimum, maximum, standard deviation, and distribution by zone.
- **Work maps**: CSV and GeoJSON imports, including boundaries without measurements.
- **Predictions**: submission of coordinates and a climate scenario to an external API.
- **Reports**: fixed rotation comparisons, reference climatology, and export through the browser's print dialog.
- Three observation dates and seven prioritized variables: accumulated precipitation, antecedent moisture, elevation and slope, evapotranspiration, air temperature, NDVI, and surface temperature. Additional basemap.
- Map with zoom, panning, centering, fullscreen mode, and a toggleable boundary.
- Date and variable switching with visual transitions between layers.
- Responsive desktop and mobile layout.
- Side navigation between Summary, Fields, Predictions, Work maps, and Reports.
- Animated collapsible menu, with a saved desktop preference and an overlay on mobile. The ☰ button shows or hides it; Escape closes it.

**The basemap is real and boundaries may come from user files; environmental layers and their statistics are generated locally and are simulated.** The satellite view uses Esri World Imagery and the street view uses OpenStreetMap through Leaflet 1.9.4. Internet access is required to load Leaflet and imagery. It does not use Google Maps or a Google key. The monitoring view has no authentication or index calculations from spectral bands. Imported work maps are persisted locally in SQLite. Google Fonts are optional and have local fallbacks.

## Direct ArcGIS connection

The map includes **Esri Leaflet 3.0.19** on top of Leaflet. It directly queries REST services published on ArcGIS Online or ArcGIS Enterprise, without routing their data through the Python demo endpoints. No package installation is required.

Configure `frontend/config/arcgis.js` with your services' REST URLs (not the ArcGIS application URL):

```javascript
window.ARCGIS_CONFIG = {
  layers: [
    {
      id: 'lotes', name: 'Lotes', type: 'feature',
      url: 'https://services.arcgis.com/ORG/arcgis/rest/services/Lotes/FeatureServer/0',
      where: '1=1', popupFields: ['nombre', 'superficie'], fitBounds: true
    },
    {
      id: 'ndvi', name: 'Published NDVI', type: 'image',
      url: 'https://SERVIDOR/arcgis/rest/services/NDVI/ImageServer',
      opacity: 0.7
    }
  ]
};
```

Replace the domains, service names, and fields with your actual values and reload the page. Supported types:

- `feature`: `FeatureServer/0` or `MapServer/0` sublayer; supports `where` filters, popup attributes, and initial centering with `fitBounds: true` (use on only one layer).
- `map`: `MapServer` service; supports selecting sublayers with `layers: [0, 1]` and preserves server rendering.
- `image`: `ImageServer` service, for published imagery and indices.

Each layer supports a unique `id`, `name`, `opacity` between 0 and 1, and `visible: false` to start hidden. The map control lets you show or hide each service. Features are queried according to the visible extent; images are requested as you navigate. Popups show only the configured fields, as text. FeatureLayer uses Leaflet symbology; use a MapServer to reproduce complex server symbology.

When services are configured, the illustrative polygon and raster are hidden to prevent overlap with real data. Panels and dates **continue using demo variables**; they do not filter ArcGIS layers or calculate statistics from them. If a service fails, an error is displayed without substituting fictional geometry. Without configured services, the original demo remains available.

The integration uses [Esri Leaflet](https://developers.arcgis.com/esri-leaflet/api-reference/). URLs must use HTTPS and services must allow access from the website's origin (CORS). Private services require OAuth/Identity integration and ArcGIS permissions; this version reports the need for authentication without storing credentials. Do not place secrets or permanent tokens in public files.

For future integrations, `GeoMap.arcgis.addLayer(config)`, `getLayer(id)`, and `removeLayer(id)` allow services to be managed at runtime; `getLayer` exposes the Esri layer for queries and filters. `GeoMap.getMap()` exposes the Leaflet instance for plugins. This does not load the ArcGIS Maps SDK for JavaScript or import WebMaps by ID: those features require adding the SDK and its authentication while preserving the `GeoMap` interface used by the dashboard.

## Simulation on other real fields

The nine sample files now use **agricultural boundaries visible in satellite imagery**, traced visually as was done for Lote Norte. They no longer use invented rectangles. They represent three parcels near Ibarlucea, Rosario, Santa Fe, with internal names to simplify navigation; neither the producer nor the farm is identified. Boundaries are approximate, with no cadastral validation. **Crops, growing seasons, field operations, and yield, moisture, speed, and elevation values remain simulated.**

| Field | Approximate area | Assumed crop | Simulated yield 2026-10-29 | 2026-11-05 | 2026-11-12 |
| --- | --- | --- | --- | --- | --- |
| Campo Oeste · Ibarlucea | 50.96 ha | Wheat | 3.2 t/ha | 3.8 t/ha | 4.4 t/ha |
| Campo Sur · Ibarlucea | 38.17 ha | Barley | 3.6 t/ha | 4.2 t/ha | 4.8 t/ha |
| Campo Este · Ibarlucea | 58.77 ha | Corn | 7.4 t/ha | 8.6 t/ha | 9.8 t/ha |

All three are larger than Lote Norte's approximate 19.58 ha. The boundary area is calculated from its coordinates; areas from the old rectangular examples are not imposed.

The source is [Esri World Imagery](https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer). `backend/datasets/example_fields.geojson` preserves the WGS84 vertices and, for each parcel, the method, digitization date, link to the imagery consulted, extent returned by the provider, and pixels used to trace the boundary. The reference image is archived at [docs/references/ibarlucea-fields-2026-11-14.jpg](docs/references/ibarlucea-fields-2026-11-14.jpg). November 14, 2026 is the tracing date, not the image acquisition date. Visible land cover changes are used only to delineate the field; they cannot identify or validate the simulated crops and yields.

`backend/repositories/examples.py` clips a grid against each boundary and calculates the area of the resulting cells. It generates 71, 118, and 94 polygons per date for Oeste, Sur, and Este respectively; the simulation stays within the traced boundary. Geometry remains the same across dates while variables change. Yield colors use a fixed scale from 0 to 12 t/ha. Each date is an independent simulation: do not add hectares across dates or interpret this sequence as an agronomic estimate.

Examples are identified by `demo: true`, `geometry_origin: digitized_imagery`, and `boundary_provenance`. They are generated in memory, without being inserted into SQLite or replacing user uploads. Their measurements can be viewed in Summary; Fields uses their boundaries to generate simulated environmental layers.

## Predictions and reports

In **Predictions**, enter WGS84 longitude and latitude and choose the `habitual` or `neutro` scenario. Clicking **Simulate** (Simular) makes the backend send a JSON POST with `lat`, `lon`, and `escenario_clima` to `FIELDWORK_PREDICTION_URL`. The external service must run separately; it is not included in this repository. The timeout is 60 seconds.

The internal endpoint `POST /api/predictions` validates coordinates and the scenario, and returns `{ "result": ... }`. External API errors or invalid JSON produce 502; connection problems or timeouts produce 504. Errors appear in the form so the user can retry.

A successful response opens **Reports** and keeps the simulation in memory for the page session. It displays the coordinates and scenario used and enables downloading the point as GeoJSON. Currently, the API response is neither plotted in the charts nor saved to SQLite; reloading the page clears this state.

Reports displays three reference rotations, yields by stage, crop residue cover, water table and capillary contribution, along with a monthly climate chart and a water balance. These are fixed values transcribed and adjusted from reference material, independent of the field and external API; they do not update when a simulation runs. The dates shown correspond to that material, not to a current reading.

**Export to PDF** (Exportar a PDF) opens the browser's print dialog: choose “Save as PDF.” No PDF is generated on the server.

The floating chat lets you open the panel and add local messages. It has no automatic replies, assistant connection, or message persistence.
