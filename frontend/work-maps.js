/* Recopilación real separada de las observaciones de demostración. */
window.WorkMaps = (() => {
  const template = `
    <div class="collection-grid">
      <form id="workmap-form" class="view-card collection-form">
        <h2>Ingresar mapa de trabajo</h2>
        <p>Ingresá el contorno del campo para obtener su ubicación y visualizar los datos ambientales simulados.</p>
        <div class="collection-fields">
          <label>Lote<input name="field" required maxlength="250" placeholder="Ej. Lote Sur"></label>
          <label>Cultivo<input name="crop" required maxlength="250" placeholder="Ej. Maíz"></label>
          <label>Campaña<input name="campaign" required maxlength="250" placeholder="Ej. 2026/27"></label>
          <label>Fecha de trabajo<input name="date" required type="date"></label>
          <label>Labor<select name="operation"><option>Cosecha</option><option>Siembra</option><option>Pulverización</option><option>Otra</option></select></label>
          <label>Fuente / equipo<input name="source" required maxlength="250" placeholder="Monitor, máquina o proveedor"></label>
        </div>
        <label>Archivo CSV o GeoJSON (UTF-8)<input name="file" type="file" accept=".csv,.geojson,.json" required></label>
        <p>CSV con coma, punto y coma o tabulador. Usá los nombres de variables indicados debajo. Para consultar datos del campo, ingresá un GeoJSON FeatureCollection con Polygon o MultiPolygon en WGS84 (longitud, latitud). Puede contener properties vacío: no se requieren mediciones. Los puntos CSV no definen un contorno.</p>
        <details><summary>Variables y unidades admitidas</summary><p><code>yield_t_ha</code>: rendimiento en t/ha · <code>area_ha</code>: superficie de cada registro en ha · <code>moisture_pct</code>: humedad en % · <code>speed_kmh</code>: velocidad en km/h · <code>elevation_m</code>: elevación en m. CSV: <code>latitude</code> y <code>longitude</code> opcionales, siempre juntas.</p><p>Las celdas vacías se conservan como faltantes. Los ceros son mediciones válidas. Se guardan también las propiedades adicionales. No repitas el área total del lote en cada registro.</p></details>
        <div class="collection-actions"><button type="submit">Guardar mapa</button></div>
        <p id="workmap-status" role="status" aria-live="polite"></p>
      </form>
      <div class="view-card collection-guide"><h2>Datos para tu modelo</h2><p>1. Ingresá un GeoJSON con la delimitación del campo.</p><p>2. Asociá el archivo a su lote, cultivo, campaña, fecha y fuente.</p><p>3. Seleccioná el campo en Resumen para visualizar sus variables ambientales simuladas. El archivo aporta el contorno y la ubicación; los valores se generan localmente hasta integrar las APIs de ArcGIS.</p><p>Se guardan en el servidor local. No se ejecuta un modelo de IA. SHP, ISOXML y rásteres deben convertirse previamente a los formatos admitidos.</p></div>
    </div>
    <div class="view-card collection-list"><h2>Mapas disponibles</h2><p id="workmap-list-status" role="status"></p><div id="workmap-list"></div></div>`;
  let generation = 0;
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  async function request(url, options) {
    const response = await fetch(url, options);
    let result;
    try { result = await response.json(); }
    catch { throw Error('La carga de datos no está disponible. Reiniciá el servidor y recargá la página.'); }
    if (!response.ok) throw Error(result.error || 'No se pudo completar la operación');
    return result;
  }
  async function refresh(token) {
    const status = document.getElementById('workmap-list-status');
    const list = document.getElementById('workmap-list'); status.textContent = 'Cargando mapas…';
    try {
      const {maps} = await request('/api/work-maps');
      if (token !== generation || !list.isConnected) return;
      status.textContent = maps.length ? `${maps.length} mapas disponibles` : 'Todavía no hay mapas. Importá tu primer archivo.';
      list.replaceChildren();
      maps.forEach(data => {
        const item = element('div', undefined, 'collection-item');
        const text = element('div'); text.append(element('b', `${data.field} · ${data.campaign}`), element('p', `${data.date} · ${data.crop} · ${data.operation} · ${data.summary.record_count} registros · ${data.filename}`));
        item.append(text); list.append(item);
      });
    } catch (error) { if (token === generation && status.isConnected) status.textContent = `${error.message}. Volvé a esta sección para reintentar.`; }
  }
  function mount(container) {
    const token = ++generation;
    container.innerHTML = template;
    const form = document.getElementById('workmap-form');
    const context = window.getWorkMapContext?.();
    if (context) for (const key of ['field', 'crop', 'campaign', 'date', 'operation', 'source']) {
      form.elements[key].value = context[key] || '';
    }
    form.elements.file.addEventListener('change', () => {
      const file = form.elements.file.files[0];
      document.getElementById('workmap-status').textContent = file ? `Archivo seleccionado: ${file.name}. Completá los datos de la labor y presioná Guardar mapa.` : '';
    });
    form.onsubmit = async event => {
      event.preventDefault(); const status = document.getElementById('workmap-status'); const button = form.querySelector('[type=submit]');
      const file = form.elements.file.files[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) {status.textContent = 'El archivo supera el máximo de 8 MiB.'; return;}
      button.disabled = true; status.textContent = 'Validando y guardando…';
      try {
        const payload = Object.fromEntries(new FormData(form)); delete payload.file;
        payload.filename = file.name; payload.content = new TextDecoder('utf-8', {fatal:true}).decode(await file.arrayBuffer());
        if (new TextEncoder().encode(JSON.stringify(payload)).length > 10 * 1024 * 1024) throw Error('El archivo serializado supera los 10 MiB permitidos. Dividilo en archivos menores.');
        const data = await request('/api/work-maps', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
        window.dispatchEvent(new CustomEvent('workmapschange', {detail: {id: data.id}}));
        if (token !== generation || !form.isConnected) return;
        status.textContent = `Mapa guardado: ${data.summary.record_count} registros. Las celdas vacías se marcaron como faltantes.`;
        window.location.hash = '#resumen';
      } catch (error) {if (token === generation && form.isConnected) status.textContent = error.message;}
      finally {button.disabled = false;}
    };
    refresh(token);
  }
  function unmount() {generation++;}
  return {mount, unmount};
})();
