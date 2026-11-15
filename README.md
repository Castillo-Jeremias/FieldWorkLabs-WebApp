# FieldWork Labs

Aplicación local de monitoreo agrícola con importación de mapas de trabajo, visualización geográfica, resumen de mediciones e integración con una API externa de simulación. Frontend HTML, CSS y JavaScript; backend Python 3.10 o posterior, sin dependencias externas.

## Ejecutar

Desde la raíz del repositorio:

```bash
python3 backend/app.py
```

Abrir http://127.0.0.1:8000. Para otro puerto: `python3 backend/app.py --port 8080`.

## Configuración y módulos

| Variable | Predeterminado | Argumento CLI |
| --- | --- | --- |
| `FIELDWORK_HOST` | `127.0.0.1` | `--host` |
| `FIELDWORK_PORT` | `8000` | `--port` |
| `FIELDWORK_FRONTEND_DIR` | `frontend/` del repositorio | `--frontend-dir` |
| `FIELDWORK_DATA_DIR` | `storage/` del repositorio | `--data-dir` |
| `FIELDWORK_PREDICTION_URL` | `http://localhost:8001/api/v1/simular` | Sin argumento CLI |

Las rutas relativas externas se resuelven desde el directorio de ejecución. La ruta predeterminada es independiente de ese directorio. Las variables se leen del entorno del proceso; el backend no carga archivos `.env` automáticamente.

```bash
FIELDWORK_HOST=0.0.0.0 FIELDWORK_PORT=8080 python3 -m backend.app
```

## Estructura del backend

- `backend/datasets/`: contornos GeoJSON, catálogo ambiental, fechas y parámetros de demostración.
- `backend/repositories/`: acceso a observaciones de demostración, mapas de ejemplo y persistencia SQLite.
- `backend/services/`: consultas ambientales, importación/exportación de mapas y cliente de predicciones.
- `backend/domain/workmaps.py`: variables admitidas, validación, metadatos y resumen común de registros.
- `backend/geometry.py` y `backend/simulation.py`: cálculos geográficos y generación espacial sintética.
- `backend/server.py`, `backend/config.py` y `backend/app.py`: HTTP, configuración y composición del proceso.

Los mapas importados y los ejemplos comparten el cálculo de resúmenes y la representación del catálogo. Las áreas geométricas utilizan una única función en `geometry.py`. Los archivos del usuario permanecen en `storage/`; los datos estáticos de demostración se encuentran en `datasets/`.

Para verificar importación, persistencia y simulación: `python3 -m unittest discover -s tests -v`.

## Estructura del frontend

El navegador carga `frontend/app.js` como módulo nativo. No requiere compilación ni dependencias de desarrollo. Se sirve con el backend de Python.

- `views/`: Lotes, Resumen, Mapas de trabajo, Predicciones y Reportes, con sus ciclos de montaje y limpieza.
- `services/`: cliente HTTP JSON y acceso a observaciones, mapas y simulación.
- `datasets/`: catálogo de mediciones, paletas y valores de referencia de los reportes.
- `domain/`: estadísticas, nombres de mapas y estado compartido de selección y simulación.
- `maps/`: presentación Leaflet y adaptador ArcGIS.
- `components/`: navegación y chat.
- `shared/`: creación de elementos y formato de números y fechas.
- `config/arcgis.js`: configuración de servicios geográficos.
- `styles/main.css`: estilos, reglas adaptables e impresión, conservando el orden de la cascada.

Las vistas usan imports explícitos. Las consultas comparten validación de respuestas y respetan la cancelación al cambiar de vista. Las fechas ambientales se obtienen del catálogo del backend. `window.GeoMap` y `window.ARCGIS_CONFIG` conservan el acceso público para integraciones.

Para ejecutar las pruebas del frontend con Node.js: `node --test tests/frontend.test.mjs`.

## Funciones

- **Resumen** (vista inicial): selección de archivo, indicadores agregados, promedios y disponibilidad de mediciones, y vista esquemática de la geometría.
- **Lotes**: capas ambientales simuladas sobre Lote Norte o el contorno del archivo seleccionado, con promedio, mínimo, máximo, desvío y distribución por zonas.
- **Mapas de trabajo**: importación de CSV y GeoJSON, incluidos contornos sin mediciones.
- **Predicciones**: envío de coordenadas y escenario climático a una API externa.
- **Reportes**: comparación fija de rotaciones, climatología de referencia y exportación mediante el diálogo de impresión del navegador.
- Tres fechas de observación y siete variables priorizadas: precipitación acumulada, humedad antecedente, elevación y pendiente, evapotranspiración, temperatura del aire, NDVI y temperatura superficial. Mapa base adicional.
- Mapa con zoom, arrastre, centrado, pantalla completa y contorno activable.
- Cambio de fecha y variable con transición visual entre capas.
- Diseño adaptable a escritorio y móvil.
- Navegación lateral entre Resumen, Lotes, Predicciones, Mapas de trabajo y Reportes.
- Menú plegable con animación, preferencia guardada en escritorio y apertura superpuesta en móvil. El botón ☰ permite mostrarlo u ocultarlo; Escape lo cierra.

**El mapa base es real y los contornos pueden proceder de archivos del usuario; las capas ambientales y sus estadísticas se generan localmente y son simuladas.** La vista satelital usa Esri World Imagery y la vista de calles usa OpenStreetMap mediante Leaflet 1.9.4. Requiere internet para cargar Leaflet y las imágenes. No utiliza Google Maps ni una clave de Google. La vista de monitoreo no tiene autenticación ni cálculo de índices a partir de bandas. Los mapas de trabajo importados tienen persistencia local en SQLite. Las fuentes de Google son opcionales y tienen alternativas locales.

## Conexión directa con ArcGIS

El mapa incorpora **Esri Leaflet 3.0.19** sobre Leaflet. Consulta directamente servicios REST publicados en ArcGIS Online o ArcGIS Enterprise, sin pasar sus datos por los endpoints de demostración de Python. No hace falta instalar paquetes.

Configurar `frontend/config/arcgis.js` con las URLs REST de tus servicios (no la URL de la aplicación de ArcGIS):

```javascript
window.ARCGIS_CONFIG = {
  layers: [
    {
      id: 'lotes', name: 'Lotes', type: 'feature',
      url: 'https://services.arcgis.com/ORG/arcgis/rest/services/Lotes/FeatureServer/0',
      where: '1=1', popupFields: ['nombre', 'superficie'], fitBounds: true
    },
    {
      id: 'ndvi', name: 'NDVI publicado', type: 'image',
      url: 'https://SERVIDOR/arcgis/rest/services/NDVI/ImageServer',
      opacity: 0.7
    }
  ]
};
```

Reemplazar los dominios, nombres de servicio y campos por los reales y recargar la página. Tipos admitidos:

- `feature`: subcapa `FeatureServer/0` o `MapServer/0`; permite filtros `where`, atributos en el popup y centrado inicial con `fitBounds: true` (usar en una sola capa).
- `map`: servicio `MapServer`; permite seleccionar subcapas con `layers: [0, 1]` y conserva el renderizado del servidor.
- `image`: servicio `ImageServer`, para imágenes e índices publicados.

Cada capa admite `id` único, `name`, `opacity` entre 0 y 1 y `visible: false` para empezar apagada. El control del mapa permite mostrar u ocultar cada servicio. Las entidades se consultan según la extensión visible; las imágenes se solicitan al navegar. Los popups muestran únicamente los campos configurados, como texto. La simbología de FeatureLayer es la de Leaflet; para reproducir simbología compleja del servidor, usar un MapServer.

Con servicios configurados se ocultan el polígono y el raster ilustrativos para que no se superpongan con los datos reales. Los paneles y fechas **siguen usando las variables de demostración**; no filtran las capas ArcGIS ni calculan estadísticas sobre ellas. Si un servicio falla, se muestra el error sin sustituirlo por geometría ficticia. Sin servicios configurados se mantiene la demo original.

La integración utiliza [Esri Leaflet](https://developers.arcgis.com/esri-leaflet/api-reference/). Las URLs deben usar HTTPS y los servicios deben permitir acceso desde el origen de la web (CORS). Los servicios privados requieren integrar OAuth/Identity y permisos de ArcGIS; esta versión informa la necesidad de autenticación, sin almacenar credenciales. No colocar secretos o tokens permanentes en archivos públicos.

Para futuras integraciones, `GeoMap.arcgis.addLayer(config)`, `getLayer(id)` y `removeLayer(id)` permiten administrar servicios en ejecución; `getLayer` expone la capa Esri para consultas y filtros. `GeoMap.getMap()` expone la instancia Leaflet para plugins. Esto no carga el SDK ArcGIS Maps SDK for JavaScript ni importa WebMaps por ID: para esas funciones habrá que incorporar el SDK y su autenticación, manteniendo la interfaz `GeoMap` que usa el panel.

## Simulación sobre otros campos reales

Los nueve archivos de ejemplo ahora usan **contornos agrícolas visibles en imágenes satelitales**, trazados visualmente como se hizo con Lote Norte. Ya no usan rectángulos inventados. Son tres parcelas próximas a Ibarlucea, Rosario, Santa Fe, con nombres internos para facilitar la navegación; no se identifica al productor ni al establecimiento. Los límites son aproximados, sin validación catastral. **Cultivo, campaña, labores y valores de rendimiento, humedad, velocidad y elevación siguen siendo simulados.**

| Campo | Superficie aproximada | Cultivo supuesto | Rendimiento simulado 29/10/2026 | 05/11/2026 | 12/11/2026 |
| --- | --- | --- | --- | --- | --- |
| Campo Oeste · Ibarlucea | 50,96 ha | Trigo | 3,2 t/ha | 3,8 t/ha | 4,4 t/ha |
| Campo Sur · Ibarlucea | 38,17 ha | Cebada | 3,6 t/ha | 4,2 t/ha | 4,8 t/ha |
| Campo Este · Ibarlucea | 58,77 ha | Maíz | 7,4 t/ha | 8,6 t/ha | 9,8 t/ha |

Los tres son mayores que las 19,58 ha aproximadas del Lote Norte. Se usa la superficie del contorno, calculada a partir de sus coordenadas; no se fuerzan las superficies de los antiguos ejemplos rectangulares.

La fuente es [Esri World Imagery](https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer). `backend/datasets/example_fields.geojson` conserva los vértices WGS84 y, para cada parcela, el método, fecha de digitalización, enlace a la imagen consultada, extensión devuelta por el proveedor y píxeles usados para trazar el contorno. Se archivó la imagen de referencia en [docs/references/ibarlucea-fields-2026-11-14.jpg](docs/references/ibarlucea-fields-2026-11-14.jpg). La fecha 14/11/2026 corresponde al trazado y no a la adquisición de la imagen. Los cambios de cobertura visibles se usan únicamente para delimitar el campo; no permiten identificar o validar los cultivos y rendimientos simulados.

`backend/repositories/examples.py` recorta una grilla contra cada contorno y calcula el área de las celdas resultantes. Se generan 71, 118 y 94 polígonos por fecha para Oeste, Sur y Este respectivamente; la simulación queda dentro del límite trazado. Se mantiene la geometría entre fechas y cambian las variables. Los colores de rendimiento usan una escala fija de 0 a 12 t/ha. Cada fecha es una simulación independiente: no sumar las hectáreas entre fechas ni interpretar esta secuencia como una estimación agronómica.

Los ejemplos se identifican con `demo: true`, `geometry_origin: digitized_imagery` y `boundary_provenance`. Se generan en memoria, sin insertarse en SQLite ni reemplazar las cargas del usuario. Sus mediciones se pueden consultar en Resumen; Lotes utiliza sus contornos para generar las capas ambientales simuladas.

## Predicciones y reportes

En **Predicciones**, ingresar longitud y latitud WGS84 y elegir el escenario `habitual` o `neutro`. Al pulsar **Simular**, el backend envía un POST JSON con `lat`, `lon` y `escenario_clima` a `FIELDWORK_PREDICTION_URL`. El servicio externo debe ejecutarse por separado; no está incluido en este repositorio. El tiempo de espera es de 60 segundos.

El endpoint interno `POST /api/predictions` valida coordenadas y escenario, y devuelve `{ "result": ... }`. Los errores de la API externa o un JSON inválido producen 502; los problemas de conexión o tiempo de espera producen 504. Los errores se muestran en el formulario para permitir reintentar.

Una respuesta exitosa abre **Reportes** y conserva la simulación en memoria durante la sesión de la página. Allí se muestran las coordenadas y el escenario utilizados, y se habilita la descarga del punto como GeoJSON. Actualmente la respuesta de la API no se representa en los gráficos ni se guarda en SQLite; al recargar la página se pierde este estado.

Reportes muestra tres rotaciones de referencia, rendimientos por etapa, cobertura de rastrojo, napa y aporte capilar, junto con un gráfico climático mensual y un balance hídrico. Son valores fijos transcritos y ajustados del material de referencia, independientes del lote y de la API externa; no se actualizan al ejecutar una simulación. Las fechas que aparecen corresponden a ese material y no a una lectura actual.

**Exportar a PDF** abre el diálogo de impresión del navegador: elegir «Guardar como PDF». No se genera un PDF en el servidor.

El chat flotante permite abrir el panel y agregar mensajes locales. No tiene respuestas automáticas, conexión con un asistente ni persistencia de mensajes.
