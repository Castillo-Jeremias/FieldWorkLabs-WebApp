# Modelos FieldWork Labs

Componentes esenciales copiados de `FieldworkLabs-Models`, con los cambios locales
presentes al momento de la copia. Están incluidos en la webapp como código y
referencia; no se ejecutan ni se conectan automáticamente a su backend.

| Archivo | Función |
| --- | --- |
| `train_pastas.py` | Calibración de napa con Pastas, estimación satelital y acoplamiento cultivo-napa. |
| `run_aquacrop.py` | Simulación de cultivos y rotaciones con AquaCrop, balance hídrico y ajuste de rendimientos. |
| `train_xgboost_anegamiento.py` | Clasificador espacial de riesgo de anegamiento. |
| `train_surrogate_montecarlo.py` | Emulador neuronal y simulación probabilística de rendimientos. |
| `riesgo_hidrico.py` | Indicadores de agua, humedad, estrés y evolución de napa por rotación. |
| `geospatial.py` | Validación de polígonos, grillas, recortes y superficies. |
| `fetch_nasa_data.py` | Obtención y generación de datos climáticos y de referencia. |
| `api.py` | API FastAPI para simulación y riesgo hídrico. |
| `requirements.txt` | Dependencias propias de los modelos. |

`data/` conserva los datasets base, el corpus del emulador, la grilla de
anegamiento, la configuración del lote y el catálogo de fuentes. Parte de estos
datos corresponde a la demo de Casilda; no debe interpretarse como mediciones
actuales ni validación en otros campos.

`outputs/napa_prediccion_pastas.json` se conserva porque AquaCrop lo utiliza como
entrada para la napa calibrada de Casilda. Los demás resultados de ejecución y
las cachés de coordenadas se generan cuando se usan los scripts y quedan
ignorados por Git.

El contrato, los campos y las limitaciones de los resultados están documentados
en [docs/API_AGUA.md](docs/API_AGUA.md). Las pruebas relevantes de API, geometría
y riesgo hídrico están en `tests/test_riesgo_hidrico.py`. El [documento teórico](../docs/FieldworkLabs_NASA_AI_Theoretical_Summary.pdf)
se conserva una sola vez, en la documentación de la webapp.

Si se ejecutan los scripts o la API por separado, usar `models/` como directorio
de trabajo: varias rutas de datos son relativas. Sus dependencias deben instalarse
en un entorno propio; no son necesarias para iniciar la webapp.
