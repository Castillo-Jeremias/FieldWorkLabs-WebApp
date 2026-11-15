# Observaciones simuladas por trabajo

En Lotes, seleccionar un campo muestra por defecto las variables ambientales simuladas para la futura integración ArcGIS. El mapa ingresado aporta únicamente el contorno y la ubicación para esa vista; no se representan los registros del área trabajada. Las mediciones originales continúan disponibles en Recopilación y en la exportación. El contorno puede ingresarse como GeoJSON con Polygon o MultiPolygon, incluso sin mediciones. Los puntos CSV o GeoJSON no definen una superficie: se requiere un contorno explícito.

`GET /api/work-maps/{id}/observations?variable=NDVI` entrega geometría WGS84, bounds, centro, ubicación por coordenadas, superficie geométrica, grilla, máscara y estadísticas. Se admiten las variables del catálogo `/api/variables`. Se excluyen huecos y espacios entre polígonos. La superficie presupone polígonos sin solapamientos.

Los promedios son parámetros fijos del catálogo; las fechas de ejemplo usan sus parámetros respectivos y otras fechas usan el primer valor configurado. No son observaciones ni consultas a ArcGIS. La fecha corresponde al trabajo ingresado. Las simulaciones no alteran las mediciones ni su exportación. La comparación temporal permanece deshabilitada para trabajos cargados.

`work_map_metadata` construye el contexto geográfico que recibe el servicio de observaciones. Ese contexto permite incorporar un proveedor ArcGIS que consulte por geometría y fecha y entregue el mismo contrato de grilla y estadísticas al frontend. Todavía no se implementaron consultas ambientales a esas APIs. No se realiza geocodificación inversa: la ubicación se expresa mediante las coordenadas del trabajo.
