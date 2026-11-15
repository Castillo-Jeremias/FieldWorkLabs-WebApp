/* Servicios publicados desde ArcGIS Online o Enterprise. Ver README.md. */
export const ARCGIS_CONFIG = {
  layers: []
  // {id: 'lotes', name: 'Lotes', type: 'feature',
  //  url: 'https://services.arcgis.com/ORG/arcgis/rest/services/Lotes/FeatureServer/0',
  //  where: '1=1', popupFields: ['nombre', 'superficie'], fitBounds: true}
};

// Mantener la configuración accesible para integraciones externas.
window.ARCGIS_CONFIG = ARCGIS_CONFIG;
