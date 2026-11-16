# Agua y riesgo hídrico: datos para mostrar

El código está incluido como referencia en la webapp; la API requiere un proceso y dependencias propios.

## Consultar la API

Para ejecutar solo la API, con las dependencias de `requirements.txt` instaladas,
desde la carpeta `models/`:

```bash
python3 -m uvicorn api:app --host 127.0.0.1 --port 8001
```

Contrato interactivo: `http://localhost:8001/docs`.

```bash
curl -X POST http://localhost:8001/api/v1/riesgo-hidrico \
  -H 'Content-Type: application/json' \
  --data '{"lat": -33.04, "lon": -61.16, "escenario_clima": "habitual"}'
```

Entrada mínima:

```json
{"lat": -33.04, "lon": -61.16, "escenario_clima": "habitual"}
```

- `POST /api/v1/riesgo-hidrico`: devuelve todos los indicadores de agua.
- `POST /api/v1/simular`: devuelve la simulación completa, incluyendo rindes,
  suelo, pronóstico separado y el bloque `riesgo_hidrico`.

Cada consulta ejecuta los modelos. El clasificador de anegamiento se entrena y
predice dentro de la misma ejecución. La API no sobrescribe el JSON compartido
de `outputs/`.

## Campos, unidades y valores de ejemplo

En la respuesta de `/riesgo-hidrico`, tomar:

```javascript
const r = respuesta.por_rotacion.rot_1_actual;
```

Estos valores documentan una ejecución de referencia de Casilda, escenario habitual.
La foto de napa/humedad corresponde al **14/03/2024**. Los balances y días de
estrés suman las campañas completas de **10/11/2022 a 15/04/2024**, excluyendo
barbechos. Son estimaciones históricas de demo, no mediciones actuales.

| Mostrar | Campo relativo a `r` | Valor de ejemplo |
| --- | --- | --- |
| Profundidad de napa | `napa.profundidad_m` | 1,067 m bajo superficie |
| Evolución de napa | `evolucion[].fecha`, `evolucion[].napa_m` | Serie para gráfico |
| Tendencia de napa | `napa.tendencia.direccion` | `subiendo_hacia_superficie` |
| Velocidad de cambio | `napa.tendencia.cambio_cm_semana` | −13,28 cm/semana |
| Humedad 0–20 cm | `humedad.capas.th1_0_20cm` | 0,462 m³/m³ |
| Humedad 20–50 cm | `humedad.capas.th2_20_50cm` | 0,339 m³/m³ |
| Humedad 50–100 cm | `humedad.capas.th3_50_100cm` | 0,332 m³/m³ |
| Humedad 100–200 cm | `humedad.capas.th4_100_200cm` | 0,422 m³/m³ |
| Humedad de raíz 0–100 cm | `humedad.raiz_0_100cm_m3m3` | 0,359 m³/m³ |
| Lluvia acumulada de campañas | `balance_campanas.lluvia_acumulada_mm` | 1181,3 mm |
| Demanda atmosférica ET₀ | `balance_campanas.demanda_atmosferica_et0_mm` | 1755,8 mm |
| Transpiración del cultivo | `balance_campanas.transpiracion_cultivo_mm` | 876,2 mm |
| Evaporación del suelo | `balance_campanas.evaporacion_suelo_mm` | 216,5 mm |
| Consumo total: transpiración + evaporación | `balance_campanas.consumo_total_et_mm` | 1092,7 mm |
| Aporte capilar de napa | `balance_campanas.aporte_napa_capilar_mm` | 222,6 mm |
| Percolación profunda | `balance_campanas.percolacion_profunda_mm` | 99,2 mm |
| Días con estrés por sequía | `estres_campanas.dias_sequia` | 137 días |
| Días con estrés por anegamiento | `estres_campanas.dias_anegamiento` | 0 días |
| Lluvia de los últimos 15 días hasta la foto | `lluvia_ultimos_15_dias_mm` | 152 mm |
| Probabilidad media de anegamiento | `anegamiento.resumen.probabilidad_media_anegamiento_pct` | 29,81 % |
| Superficie con categoría de riesgo alto | `anegamiento.resumen.superficie_riesgo_alto_pct` | 17,75 % del área evaluada |
| Probabilidad de cada zona | `anegamiento.geojson.features[].properties.probabilidad_anegamiento_pct` | Primera zona: 3,58 % |

La tendencia compara los extremos de hasta 30 días disponibles del mismo cultivo.
El signo negativo indica que disminuye la profundidad y la napa sube. Las capas de
humedad son salidas de AquaCrop; el promedio de raíz puede incorporar asimilación.
Para mostrar una campaña individual usar `r.campanas[]`, que incluye fechas,
`balance_hidrico_mm` y `estres_dias` propios.

## Mostrar el riesgo por zona en el mapa

```javascript
const response = await fetch('/api/v1/riesgo-hidrico', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({lat: -33.04, lon: -61.16, escenario_clima: 'habitual'})
});
if (!response.ok) throw new Error(await response.text());
const datos = await response.json();
const capa = datos.por_rotacion.rot_1_actual.anegamiento;
if (capa.estado !== 'sin_datos') {
  L.geoJSON(capa.geojson, {
    style: f => ({fillOpacity: 0.65, weight: 0.5,
      fillColor: f.properties.categoria_riesgo === 'Alto' ? '#ef4444'
        : f.properties.categoria_riesgo === 'Medio' ? '#f59e0b' : '#22c55e'}),
    onEachFeature: (f, layer) => layer.bindPopup(
      `${f.properties.probabilidad_anegamiento_pct}% · ${f.properties.fecha}`)
  }).addTo(map);
}
```

Umbrales de visualización: bajo ≤30 %, medio >30–65 %, alto >65 %. Son categorías
de la demo, no umbrales agronómicos validados. La probabilidad media se pondera por
superficie. El porcentaje de área de riesgo alto es otro indicador: no equivale a
la probabilidad de que todo el lote se anegue.

El cálculo usa la lluvia acumulada de los 15 días que terminan en la fecha de la
foto, la napa y la humedad calculadas para esa fecha. La napa por celda se aproxima
con la diferencia de elevación respecto de la grilla. La lluvia y humedad del
escenario se aplican uniformemente. La respuesta explicita el método y las fuentes.

La salida es una estimación retrospectiva del clasificador sin calibración de campo.
Las métricas internas reservan un evento completo del CSV; no acreditan capacidad
de pronóstico ni validación en otras ubicaciones.

## Lotes, fechas y datos faltantes

- Opcionalmente enviar `poligono_lote` como geometría GeoJSON Polygon/MultiPolygon,
  en `[longitud, latitud]`. `lat` y `lon` deben estar dentro del lote. Se recortan
  las celdas y se informa `cobertura_lote_pct`.
- Sin polígono, en Casilda se muestra la huella de las 400 celdas de demo. Su área
  inferida es aproximadamente 114,78 ha; no constituye el límite real de un lote.
- Fuera de esa cobertura los demás indicadores continúan disponibles, pero
  `anegamiento.estado` será `sin_datos` y `resumen` será `null`.
- Para calcular por zonas en otro lote se puede enviar `grilla_anegamiento`, una
  FeatureCollection de polígonos sin solapamientos, con propiedades numéricas
  `elev_srtm_m`, `slope_pct`, `twi` y `clay_pct`. Se aplica el clasificador demo de
  referencia y se identifica el origen aportado por usuario, sin afirmar validación
  geográfica. Máximo 2500 celdas; extensión máxima del conjunto: 2 grados por eje.
- `fecha_evaluacion`, opcional en formato `YYYY-MM-DD`, selecciona la última muestra
  disponible de cada rotación hasta esa fecha. Se devuelve la fecha efectiva; por
  defecto se usa la última de cada rotación, que puede diferir entre rotaciones.
  Fechas fuera del período simulado producen HTTP 422.
- Los balances siguen siendo de campañas completas, incluso al seleccionar una
  foto anterior. La respuesta identifica ambos períodos por separado.
- Si falta algún día de lluvia en la ventana, el anegamiento queda sin datos;
  no se interpreta como lluvia cero. No hay intervalos de confianza calibrados.
- Parámetros admitidos adicionales: `napa_m`, `asimilacion_tiempo_real`,
  `usar_historial_lote`, `historial_rinde_soja_tn_ha` y
  `mapa_rinde_ambientes_tn_ha`. El ajuste de rindes conserva su comportamiento
  anterior; el entrenamiento contextual con rendimientos reales sigue en el plan.

Los endpoints calculan una respuesta nueva en cada consulta. Las respuestas de
ejemplo completas se conservan en el repositorio original `FieldworkLabs-Models`.

Pruebas desde `models/`, con las dependencias instaladas:
`python3 -m unittest discover -s tests -v`.
