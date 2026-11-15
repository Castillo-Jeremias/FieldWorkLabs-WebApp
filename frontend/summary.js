(() => {
  const typical = {
    yield_t_ha: ['Rendimiento', 't/ha'], area_ha: ['Superficie de medición', 'ha'],
    moisture_pct: ['Humedad', '%'], speed_kmh: ['Velocidad', 'km/h'], elevation_m: ['Elevación', 'm']
  };
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const format = value => finite(value) ? value.toLocaleString('es-AR', {maximumFractionDigits: 2}) : 'Sin dato';
  function stats(values) {
    if (!values.length) return null;
    let min = Infinity, max = -Infinity, mean = 0, variance = 0;
    values.forEach((value, i) => { min = Math.min(min, value); max = Math.max(max, value); const delta = value - mean; mean += delta / (i + 1); variance += delta * (value - mean); });
    const bins = Array(min === max ? 1 : 6).fill(0);
    values.forEach(value => bins[min === max ? 0 : Math.min(5, Math.floor((value - min) / (max - min) * 6))]++);
    const sorted = [...values].sort((a, b) => a - b);
    const quantile = fraction => { const index = (sorted.length - 1) * fraction, lower = Math.floor(index); return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower); };
    return {min, max, mean, std: Math.sqrt(variance / values.length), median: quantile(.5), q1: quantile(.25), q3: quantile(.75), bins};
  }
  function variables(records) {
    const result = Object.entries(typical).map(([key, [label, unit]]) => ({key, label, unit, read: row => row[key]}));
    const extra = new Set();
    for (const row of records) for (const [key, value] of Object.entries(row.raw_properties || {})) {
      if (!(key in typical) && !['latitude', 'longitude', 'row', 'column'].includes(key) && finite(value)) extra.add(key);
    }
    for (const key of extra) result.push({key: `raw:${key}`, label: key, unit: 'unidad no especificada', read: row => row.raw_properties?.[key]});
    return result.filter(variable => records.some(row => finite(variable.read(row))));
  }
  function mapNames(maps) {
    const counts = new Map(), used = new Set();
    return maps.map(map => {
      const name = map.filename || map.field || 'Mapa sin nombre';
      let number = (counts.get(name) || 0) + 1;
      let label = number === 1 ? name : `${name} (${number})`;
      while (used.has(label)) { number++; label = `${name} (${number})`; }
      counts.set(name, number); used.add(label);
      return label;
    });
  }
  function previewGeometry(records) {
    const geometries = records.map(row => row.geometry).filter(Boolean), points = [];
    const visit = coordinates => {
      if (!Array.isArray(coordinates)) return;
      if (finite(coordinates[0]) && finite(coordinates[1])) points.push(coordinates);
      else coordinates.forEach(visit);
    };
    geometries.forEach(geometry => visit(geometry.coordinates));
    if (!points.length) return null;
    let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
    points.forEach(([lon, lat]) => { west = Math.min(west, lon); east = Math.max(east, lon); south = Math.min(south, lat); north = Math.max(north, lat); });
    const cosine = Math.max(.01, Math.cos((south + north) / 2 * Math.PI / 180));
    const scale = Math.min(560 / ((east - west) * cosine || 1e-6), 300 / (north - south || 1e-6));
    const project = ([lon, lat]) => [300 + (lon - (west + east) / 2) * cosine * scale, 170 - (lat - (south + north) / 2) * scale];
    return {geometries, project};
  }
  function renderOverview(data, el) {
    const layout = el('div', undefined, 'summary-overview');
    const preview = el('section', undefined, 'view-card summary-preview');
    preview.append(el('h3', 'Vista preliminar del mapa'));
    const geometry = previewGeometry(data.records);
    if (geometry) {
      const svgNode = (tag, attributes) => { const node = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value); return node; };
      const svg = svgNode('svg', {viewBox: '0 0 600 340', role: 'img', 'aria-label': 'Vista general de la geometría del mapa cargado'});
      for (let x = 0; x <= 600; x += 50) svg.append(svgNode('path', {d: `M${x} 0V340`, class: 'preview-grid'}));
      for (let y = 0; y <= 340; y += 50) svg.append(svgNode('path', {d: `M0 ${y}H600`, class: 'preview-grid'}));
      // Batch points into one path to keep large uploads responsive.
      let dots = '';
      for (const item of geometry.geometries) {
        if (item.type === 'Point') { const [x, y] = geometry.project(item.coordinates); dots += `M${x},${y}h.1`; continue; }
        const polygons = item.type === 'Polygon' ? [item.coordinates] : item.type === 'MultiPolygon' ? item.coordinates : [];
        for (const rings of polygons) {
          const d = rings.map(ring => ring.map((point, index) => `${index ? 'L' : 'M'}${geometry.project(point).join(',')}`).join('') + 'Z').join('');
          svg.append(svgNode('path', {d, class: 'preview-polygon', 'fill-rule': 'evenodd'}));
        }
      }
      if (dots) svg.append(svgNode('path', {d: dots, class: 'preview-points'}));
      preview.append(svg, el('p', 'N ↑ · Geometría del archivo · Vista esquemática, sin imagen satelital', 'dashboard-note'));
      const link = el('a', 'Explorar el lote →', 'view-link'); link.href = '#lotes'; preview.append(link);
    } else preview.append(el('p', 'El archivo no contiene coordenadas para representar el mapa. Podés consultar sus indicadores agregados.', 'dashboard-note'));
    const panel = el('section', undefined, 'view-card summary-data'); panel.append(el('h3', 'Panorama de las mediciones'), el('p', 'Promedios y disponibilidad por variable.', 'dashboard-note'));
    const table = el('table', undefined, 'summary-table'), head = el('thead'), titles = el('tr');
    for (const title of ['Variable', 'Promedio', 'Datos disponibles']) titles.append(el('th', title));
    head.append(titles); table.append(head); const rows = el('tbody');
    for (const variable of variables(data.records)) {
      const values = data.records.map(variable.read).filter(finite), result = stats(values), coverage = values.length / data.records.length * 100;
      const row = el('tr'), name = el('td'); name.append(el('b', variable.label), el('small', variable.unit));
      const availability = el('td'), meter = el('meter'); meter.min = 0; meter.max = 100; meter.value = coverage; meter.setAttribute('aria-label', `Disponibilidad de ${variable.label}`);
      availability.append(el('span', `${format(coverage)}%`), meter); row.append(name, el('td', format(result.mean)), availability); rows.append(row);
    }
    if (rows.children.length) { table.append(rows); const scroll = el('div', undefined, 'summary-table-scroll'); scroll.append(table); panel.append(scroll); }
    else panel.append(el('p', 'No hay mediciones numéricas disponibles.'));
    panel.append(el('p', 'Promedios simples de las mediciones válidas. Cada variable conserva su unidad.', 'dashboard-note'));
    layout.append(preview, panel); return layout;
  }
  let controller;
  function unmount() { controller?.abort(); }
  async function mount(container, {report = false} = {}) {
    unmount(); controller = new AbortController(); const {signal} = controller;
    const el = (tag, text, cls) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node; };
    const status = el('p', 'Cargando mapas de trabajo…'); status.setAttribute('role', 'status');
    container.replaceChildren(status);
    try {
      const response = await fetch('/api/work-maps', {signal});
      if (!response.ok) throw Error();
      const {maps} = await response.json();
      if (signal.aborted) return;
      if (!maps.length) { status.textContent = 'Todavía no hay mapas de trabajo. Cargá un archivo para consultar sus mediciones.'; const link = el('a', 'Cargar mapa de trabajo'); link.href = '#mapas'; container.append(link); return; }
      const controls = el('div', undefined, 'dashboard-controls view-card');
      controls.append(el('span', 'TU MAPA ACTIVO', 'dashboard-eyebrow'));
      const upload = el('a', 'Cargar mapa', 'dashboard-upload'); upload.href = '#mapas';
      const label = el('label', 'Mapa de trabajo'), select = el('select'); label.append(select); controls.append(label, upload);
      const names = mapNames(maps);
      maps.forEach((map, index) => { const option = el('option', names[index]); option.value = map.id; select.append(option); });
      let preferred = window.getSelectedWorkMapId?.() || new URL(window.location.href).searchParams.get('map');
      try { preferred ||= localStorage.getItem('selected-work-map'); } catch {}
      if (maps.some(map => map.id === preferred)) select.value = preferred;
      status.className = 'dashboard-status';
      const body = el('div', undefined, 'dashboard-body'); container.replaceChildren(controls, status, body);
      let request = 0;
      async function load() {
        const current = ++request;
        if (window.getSelectedWorkMapId?.() !== select.value) window.selectWorkMap?.(select.value);
        body.replaceChildren(); status.textContent = 'Cargando mediciones…';
        try {
          const response = await fetch(`/api/work-maps/${encodeURIComponent(select.value)}`, {signal});
          if (!response.ok) throw Error();
          const data = await response.json();
          if (signal.aborted || current !== request) return;
          status.textContent = data.demo ? 'DATOS SIMULADOS · Mediciones del mapa de ejemplo.' : 'Mediciones del archivo cargado · Fuente: ' + data.source;
          const heading = el('div', undefined, 'dashboard-heading');
          heading.append(el('h2', names[maps.findIndex(map => map.id === select.value)] || data.filename));
          const metadata = el('div', undefined, 'dashboard-metadata');
          for (const text of [data.field, data.crop, `Campaña ${data.campaign}`, data.date, data.operation]) metadata.append(el('span', text));
          heading.append(metadata); body.append(heading);
          const metrics = el('div', undefined, 'dashboard-metrics');
          for (const [title, value] of [['Superficie declarada (ha)', data.summary.area_ha], ['Rendimiento ponderado (t/ha)', data.summary.yield_t_ha], ['Variables disponibles', variables(data.records).length], ['Cobertura geográfica (%)', data.records.length ? data.summary.georeferenced_count / data.records.length * 100 : null]]) {
            const card = el('div', undefined, 'view-card'); card.append(el('span', title), el('strong', format(value))); metrics.append(card);
          }
          body.append(metrics, el('p', 'Indicadores agregados del mapa. El rendimiento se pondera por superficie válida. La superficie declarada puede incluir solapamientos.', 'dashboard-note'));
          if (!report) {
            body.append(renderOverview(data, el));
            for (const warning of data.summary.warnings || []) body.append(el('p', warning, 'dashboard-note'));
            return;
          }
          const available = variables(data.records), filters = el('fieldset', undefined, 'dashboard-filters'), legend = el('legend', 'Variables de interés'); filters.append(legend);
          const charts = el('div', undefined, 'dashboard-charts');
          let saved; try { saved = JSON.parse(localStorage.getItem('summary-variables')); } catch {}
          const selected = new Set(Array.isArray(saved) ? saved : available.map(v => v.key));
          function render() {
            charts.replaceChildren();
            for (const variable of available.filter(v => selected.has(v.key))) {
              const values = data.records.map(variable.read).filter(finite), result = stats(values);
              const card = el('section', undefined, 'view-card'); card.append(el('h3', `${variable.label} · ${variable.unit}`));
              const metrics = el('dl', undefined, 'report-statistics');
              for (const [label, value] of [['Promedio', result.mean], ['Mediana', result.median], ['Mínimo', result.min], ['Máximo', result.max], ['Desvío estándar', result.std], ['Cuartil 25%', result.q1], ['Cuartil 75%', result.q3]]) {
                const item = el('div'); item.append(el('dt', label), el('dd', format(value))); metrics.append(item);
              }
              card.append(metrics);
              card.append(el('p', `Cobertura de datos: ${format(values.length / data.records.length * 100)}% · ${format((data.records.length - values.length) / data.records.length * 100)}% sin dato`));
              const histogram = el('div', undefined, 'dashboard-histogram'); histogram.setAttribute('aria-label', `Histograma de ${variable.label}: porcentaje de mediciones por intervalo`);
              result.bins.forEach((count, i) => {
                const start = result.min + (result.max - result.min) * i / result.bins.length;
                const end = result.min + (result.max - result.min) * (i + 1) / result.bins.length;
                const row = el('div', undefined, 'dashboard-bin'), bar = el('i'); bar.style.width = `${count / values.length * 100}%`;
                row.append(el('span', `${format(start)}–${format(end)}${i < result.bins.length - 1 ? ' *' : ''}`), bar, el('b', `${format(count / values.length * 100)}%`)); histogram.append(row);
              });
              card.append(el('h4', 'Histograma · frecuencia (%)'), histogram, el('p', '* El extremo superior se incluye en el siguiente intervalo; el último incluye el máximo. Frecuencia sobre mediciones válidas, sin ponderar por superficie.', 'dashboard-note'));  charts.append(card);
            }
            if (!charts.children.length) charts.append(el('p', available.length ? 'Seleccioná las variables que querés ver.' : 'El archivo no contiene mediciones numéricas disponibles.'));
          }
          for (const variable of available) {
            const label = el('label'), input = el('input'); input.type = 'checkbox'; input.checked = selected.has(variable.key);
            input.onchange = () => { if (input.checked) selected.add(variable.key); else selected.delete(variable.key); try { localStorage.setItem('summary-variables', JSON.stringify([...selected])); } catch {} render(); };
            label.append(input, document.createTextNode(variable.label)); filters.append(label);
          }
          body.append(filters, charts);
          for (const warning of data.summary.warnings || []) body.append(el('p', warning, 'dashboard-note'));
          render();
        } catch (error) { if (!signal.aborted && current === request) { body.replaceChildren(); status.textContent = 'No se pudo cargar el archivo.'; const retry = el('button', 'Reintentar'); retry.onclick = load; body.append(retry); } }
      }
      select.onchange = load;
      window.addEventListener('workmapselectionchange', () => {
        const id = window.getSelectedWorkMapId?.();
        if (id && id !== select.value && maps.some(map => map.id === id)) { select.value = id; load(); }
      }, {signal});
      await load();
    } catch (error) { if (!signal.aborted) { status.textContent = 'No se pudieron cargar los mapas de trabajo.'; const retry = el('button', 'Reintentar'); retry.onclick = () => mount(container, {report}); container.append(retry); } }
  }
  window.WorkSummary = {mount, unmount, stats, variables, mapNames, previewGeometry};
})();
