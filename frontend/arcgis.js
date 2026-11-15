/* Adaptador ArcGIS REST independiente de las variables de demostración. */
window.ArcGISSource = (() => {
  const layers = new Map();
  let map, control;
  const status = () => document.getElementById('arcgis-status');
  function message(text) { status().textContent = text; status().hidden = !text; }
  function addLayer(config) {
    if (!map || !L.esri) throw Error('Esri Leaflet no está disponible');
    if (!config.id || layers.has(config.id)) throw Error('Identificador de capa ausente o duplicado');
    const url = new URL(config.url);
    if (url.protocol !== 'https:') throw Error('El servicio ArcGIS debe usar HTTPS');
    const factories = {feature: L.esri.featureLayer, map: L.esri.dynamicMapLayer, image: L.esri.imageMapLayer};
    const factory = factories[config.type];
    if (!factory) throw Error('Tipo de servicio ArcGIS desconocido');
    const options = {url: url.href, opacity: config.opacity ?? 0.8};
    if (config.type === 'feature') options.where = config.where || '1=1';
    if (config.type === 'map' && config.layers) options.layers = config.layers;
    const layer = factory(options);
    layer.on('requesterror', () => message(`No se pudo consultar ${config.name || config.id}. Revisá el servicio, sus permisos y CORS.`));
    layer.on('authenticationrequired', () => message(`La capa ${config.name || config.id} requiere iniciar sesión en ArcGIS.`));
    if (config.type === 'feature') {
      layer.bindPopup(feature => {
        const element = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = config.name || config.id; element.append(title);
        for (const field of config.popupFields || []) {
          const row = document.createElement('p');
          row.textContent = `${field}: ${feature.properties?.[field] ?? 'Sin dato'}`;
          element.append(row);
        }
        return element;
      });
      if (config.fitBounds) layer.query().bounds((error, bounds) => {
        if (error) message(`No se pudo obtener la extensión de ${config.name || config.id}.`);
        else if (map.hasLayer(layer) && bounds?.isValid()) map.fitBounds(bounds, {padding: [35, 70]});
      });
    }
    layers.set(config.id, layer);
    const label = document.createElement('span');
    label.textContent = config.name || config.id;
    control.addOverlay(layer, label.outerHTML);
    if (config.visible !== false) layer.addTo(map);
    return layer;
  }
  return {
    init(target, config = {}) {
      map = target;
      if (!config.layers?.length) return;
      control = L.control.layers({}, {}, {position: 'bottomright', collapsed: false}).addTo(map);
      for (const item of config.layers) {
        try { addLayer(item); }
        catch (error) { message(`No se pudo configurar la capa ${item.id || ''}: ${error.message}`); }
      }
    },
    addLayer(config) {
      if (!control && map) control = L.control.layers({}, {}, {position: 'bottomright'}).addTo(map);
      return addLayer(config);
    },
    getLayer(id) { return layers.get(id); },
    removeLayer(id) {
      const layer = layers.get(id);
      if (layer) { map.removeLayer(layer); control.removeLayer(layer); layers.delete(id); }
    }
  };
})();
