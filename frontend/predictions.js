/* Simulación externa a partir del punto medio del mapa seleccionado. */
window.Predictions = (() => {
  // Datos transcritos del reporte; independientes de la API externa.
  const exampleRotations = [
  {
    "id": 1,
    "acronym": "S1–S1",
    "crops": [
      "Soja 1ra",
      "Soja 1ra"
    ],
    "waterTable": 1.55,
    "consumption": 361.7,
    "percolation": 365.8,
    "coverage": 52,
    "rmseBefore": 0.0734,
    "rmseAfter": 0.0279,
    "stages": [
      {
        "crop": "Soja 1ra",
        "season": "2022/23",
        "yield": 5.3, "fao": 5.22, "ml": 0.08,
        "waterTable": 1.79,
        "anoxia": 0,
        "drought": 66,
        "capillary": 210.3
      },
      {
        "crop": "Soja 1ra",
        "season": "2023/24",
        "yield": 6.43, "fao": 6.12, "ml": 0.32,
        "waterTable": 1.42,
        "anoxia": 0,
        "drought": 0,
        "capillary": 151.4
      }
    ],
    "fallows": [
      {
        "days": 208,
        "evaporation": 117.1,
        "recharge": 205.3
      }
    ],
    "yield": 5.87
  },
  {
    "id": 2,
    "acronym": "T/S2–MT",
    "crops": [
      "Trigo / Soja 2da",
      "Maíz temprano"
    ],
    "waterTable": 1.23,
    "consumption": 378.3,
    "percolation": 466.2,
    "coverage": 88,
    "rmseBefore": 0.0655,
    "rmseAfter": 0.0249,
    "stages": [
      {
        "crop": "Trigo invernal",
        "season": "2022",
        "yield": 4.78, "fao": 4.5, "ml": 0.28,
        "waterTable": 1.21,
        "anoxia": 3,
        "drought": 0,
        "capillary": 168
      },
      {
        "crop": "Soja 2da",
        "season": "2022/23",
        "yield": 5.27, "fao": 5.05, "ml": 0.22,
        "waterTable": 1.96,
        "anoxia": 0,
        "drought": 74,
        "capillary": 107.6
      },
      {
        "crop": "Maíz temprano",
        "season": "2023/24",
        "yield": 16.25, "fao": 17.99, "ml": 0.43,
        "waterTable": 1.61,
        "anoxia": 0,
        "drought": 0,
        "capillary": 102.7
      }
    ],
    "fallows": [
      {
        "days": 2,
        "evaporation": 2.1,
        "recharge": 0
      },
      {
        "days": 139,
        "evaporation": 43.3,
        "recharge": 102.5
      }
    ],
    // Ajuste proporcional al cambio del maíz temprano de 18.42 a 16.25 tn/ha.
    "yield": 8.37 * (16.25 / 18.42)
  },
  {
    "id": 3,
    "acronym": "Mt–S1",
    "crops": [
      "Maíz tardío",
      "Soja 1ra"
    ],
    "waterTable": 0.87,
    "consumption": 294.3,
    "percolation": 473.4,
    "coverage": 82,
    "rmseBefore": 0.0594,
    "rmseAfter": 0.0226,
    "stages": [
      {
        "crop": "Maíz tardío",
        "season": "2022/23",
        "yield": 15.26, "fao": 15.03, "ml": 0.23,
        "waterTable": 1.88,
        "anoxia": 6,
        "drought": 84,
        "capillary": 172.4
      },
      {
        "crop": "Soja 1ra",
        "season": "2023/24",
        "yield": 4.46, "fao": 4.27, "ml": 0.19,
        "waterTable": 0.93,
        "anoxia": 10,
        "drought": 0,
        "capillary": 121.9
      }
    ],
    "fallows": [
      {
        "days": 166,
        "evaporation": 70.3,
        "recharge": 281.7
      }
    ],
    "yield": 5.89
  }
];
  const number = (value, digits = 2) => value.toLocaleString('es-AR', {minimumFractionDigits: digits, maximumFractionDigits: digits});
  // Valores aproximados transcritos de la imagen, en mm/mes.
  const climateExample = [
    {month: '2026-11', rain: 67, et0: 81}, {month: '2026-12', rain: 94, et0: 175},
    {month: '2027-01', rain: 181, et0: 132}, {month: '2027-02', rain: 127, et0: 107},
    {month: '2027-03', rain: 212.5, et0: 85}, {month: '2027-04', rain: 136.5, et0: 72}
  ];
  function climateChart() {
    const axisStep = 50;
    const axisMax = Math.ceil(Math.max(...climateExample.flatMap(item => [item.rain, item.et0])) / axisStep) * axisStep;
    const series = [{key: 'rain', label: 'Lluvia pronosticada'}, {key: 'et0', label: 'Demanda ET0 pronosticada'}];
    return `<section class="climate-chart" aria-labelledby="climate-title">
      <h3 id="climate-title">Clima · próximos 6 meses</h3>
      <p class="climate-source">Modelo indicado en el recorte: ECMWF_SEAS5_OPEN_METEO_SEASONAL_API</p>
      <ul class="climate-legend">${series.map(item => `<li><span class="climate-swatch climate-${item.key}" aria-hidden="true"></span>${item.label} (mm/mes)</li>`).join('')}</ul>
      <div class="climate-scroll" tabindex="0" role="region" aria-label="Pronóstico climático mensual; desplazamiento horizontal disponible">
        <div class="climate-plot">
          <div class="climate-axis" aria-hidden="true">${Array.from({length: axisMax / axisStep + 1}, (_, index) => `<span style="bottom:${index * axisStep / axisMax * 100}%">${index * axisStep}</span>`).join('')}</div>
          <div class="climate-months">${climateExample.map(item => `<div class="climate-month"><div class="climate-bars">${series.map(seriesItem => `<div class="climate-bar climate-${seriesItem.key}" style="height:${item[seriesItem.key] / axisMax * 100}%" role="img" aria-label="${item.month}: ${seriesItem.label}, aproximadamente ${item[seriesItem.key]} milímetros por mes"><strong>${number(item[seriesItem.key], Number.isInteger(item[seriesItem.key]) ? 0 : 1)}</strong></div>`).join('')}</div><span class="climate-month-label">${item.month}</span></div>`).join('')}</div>
        </div>
      </div>
      <p class="rotation-footnote">Valores aproximados transcritos de la imagen (mm/mes), con la lluvia de marzo y abril reducida a la mitad. No se actualizan al ejecutar la simulación. Se muestran lluvia y demanda atmosférica.</p>
    </section>`;
  }
  function climatologySection() {
    const winner = exampleRotations.reduce((best, item) => item.yield > best.yield ? item : best);
    const balance = [
      ['Lluvia acumulada en campañas', '2.157,3 mm', 'Demanda atmosférica ET₀', '2.206,7 mm'],
      ['Transpiración del cultivo', '1.227,3 mm', 'Evaporación del suelo', '191,9 mm'],
      ['Consumo total (transpiración + evaporación)', '1.419,2 mm', 'Aporte capilar de napa', '347,3 mm'],
      ['Percolación profunda', '273,7 mm', 'Días con estrés: sequía / anegamiento', '138 / 0']
    ];
    return `<section class="climatology-section" aria-labelledby="climatology-title">
      <div class="rotation-heading"><div><span class="rotation-eyebrow">CLIMATOLOGÍA · ESTRATEGIA GANADORA</span><h2 id="climatology-title">Clima, agua y riesgo hídrico</h2><p>Rotación ${winner.id}: ${winner.crops.join(' → ')} · mejor rendimiento del reporte de referencia.</p></div><span class="rotation-example">Reporte de referencia</span></div>
      ${climateChart()}
      <section class="water-report" aria-labelledby="water-report-title">
        <h3 id="water-report-title">Agua y riesgo hídrico · Rotación 2: Trigo / Soja 2da → Maíz temprano</h3>
        <p class="water-report-source">Foto del <time datetime="2027-01-23">23/01/2027</time> · Simulación histórica, no lectura actual</p>
        <dl class="water-metrics">
          <div><dt>Profundidad de napa</dt><dd>1,29 <small>m</small></dd></div>
          <div><dt>Tendencia de napa</dt><dd class="water-trend">Subiendo hacia superficie</dd><p>−8,24 cm/semana · 24/12/2026 a 23/01/2027</p></div>
          <div><dt>Humedad 0–100 cm</dt><dd>0,422 <small>m³/m³</small></dd></div>
          <div><dt>Probabilidad media de anegamiento</dt><dd>23,7 <small>%</small></dd></div>
        </dl>
        <p class="water-layers">Humedad por capa, modelo AquaCrop (m³/m³): <span>0–20 cm: 0,454</span> · <span>20–50 cm: 0,395</span> · <span>50–100 cm: 0,372</span> · <span>100–200 cm: 0,401</span></p>
        <div class="water-table-scroll" tabindex="0" role="region" aria-label="Balance hídrico de campañas completas; desplazamiento horizontal disponible">
          <table class="water-balance"><caption>Balance de campañas completas: 10/06/2025 a 15/03/2027. Excluye barbechos; el acumulado no corresponde solamente a la fecha de la foto.</caption>
            <thead><tr><th scope="col">Indicador</th><th scope="col">Valor</th><th scope="col">Indicador</th><th scope="col">Valor</th></tr></thead>
            <tbody>${balance.map(row => `<tr><th scope="row">${row[0]}</th><td>${row[1]}</td><th scope="row">${row[2]}</th><td>${row[3]}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </section>
    </section>`;
  }
  function rotationComparison() {
    const legend = `<ul class="rotation-legend" aria-label="Referencias de rotaciones">${exampleRotations.map(item => `<li><b>${item.acronym}</b><span>${item.crops.join(' → ')}</span></li>`).join('')}</ul>`;
    const winner = exampleRotations.reduce((best, item) => item.yield > best.yield ? item : best);
    const second = Math.max(...exampleRotations.filter(item => item !== winner).map(item => item.yield));
    const metrics = [
      {key: 'coverage', title: 'Cobertura de rastrojo poscosecha', unit: '% de superficie cubierta', digits: 0, suffix: ' %'},
      {key: 'waterTable', title: 'Napa final esperada', unit: 'm de profundidad', digits: 2, suffix: ' m'},
      {key: 'consumption', title: 'Aporte capilar (Cr)', unit: 'mm · aporte capilar', digits: 1, suffix: ' mm'}
    ];
    return `<section class="rotation-comparison" aria-labelledby="rotation-title">
      <div class="rotation-heading"><div><span class="rotation-eyebrow">COMPARACIÓN DE ROTACIONES</span><h2 id="rotation-title">Tres caminos para tu próxima siembra</h2><p>Rendimiento, cobertura poscosecha y comportamiento de la napa en un mismo vistazo.</p></div><span class="rotation-example">Reporte de referencia</span></div>
      <div class="rotation-recommendation"><span class="rotation-trophy" aria-hidden="true">★</span><div><span class="rotation-eyebrow">GANADORA POR RENDIMIENTO</span><h3>Trigo / Soja 2da → Maíz temprano</h3><p>Rotación ${winner.id} · ${number(winner.yield - second)} tn/ha de soja equivalente por año más que la segunda alternativa.</p></div><div class="rotation-gain">+${number((winner.yield / second - 1) * 100, 1)} %<span>de rendimiento</span></div></div>
      <div class="rotation-cards">${exampleRotations.map(item => `<article class="rotation-card ${item === winner ? 'is-winner' : ''}" aria-labelledby="rotation-${item.id}">
        <div class="rotation-card-top"><span>ROTACIÓN ${item.id}</span>${item === winner ? '<b>★ Mayor rendimiento</b>' : '<span>Alternativa</span>'}</div>
        <h3 id="rotation-${item.id}">${item.crops.join(' <span aria-hidden="true">→</span> ')}</h3>
        <div class="rotation-yield">${number(item.yield)}<span>tn/Ha · Soja equivalente / Año</span></div>
        <p class="rotation-yield-basis">Promedio anual</p>
        <section class="rotation-stages" aria-label="Rendimiento por etapa de la rotación ${item.id}">
          <h4>Rendimiento por etapa</h4>
          <ol>${item.stages.map((stage, index) => `<li><span class="rotation-stage-number" aria-hidden="true">${index + 1}</span><div><b>${stage.crop}</b></div><strong>${number(stage.yield)} <small>Tn/Ha</small></strong></li>`).join('')}</ol>
          <p>Rendimiento de cada cultivo, sin conversión a soja equivalente.</p>
        </section>
        <dl><div><dt>Napa final esperada</dt><dd>${number(item.waterTable)} <small>m</small></dd></div><div><dt>Aporte capilar (Cr)</dt><dd>${number(item.consumption, 1)} <small>mm</small></dd></div><div><dt>Cobertura de rastrojo poscosecha</dt><dd>${number(item.coverage, 0)} <small>%</small></dd></div><div><dt>Napa inicial</dt><dd>1,57 <small>m</small></dd></div></dl>
      </article>`).join('')}</div>
      <div class="rotation-charts">${metrics.map(metric => {
        const maximum = Math.max(...exampleRotations.map(item => item[metric.key]));
        const isCoverage = metric.key === 'coverage';
        const max = isCoverage ? 100 : maximum;
        const scale = isCoverage ? `<div class="rotation-coverage-axis" aria-hidden="true">${Array.from({length: 6}, (_, index) => { const tick = index * 20; return `<div class="rotation-coverage-tick" style="top:${(1 - tick / max) * 100}%"><span>${tick}</span></div>`; }).join('')}</div>` : '';
        return `<section class="rotation-chart ${isCoverage ? 'rotation-chart-coverage' : ''}" aria-label="Comparación de ${metric.title}${isCoverage ? `, escala de 0 a ${max} ${metric.unit}` : ''}"><h3>${metric.title}</h3><p>${metric.unit}</p><div class="rotation-plot">${scale}${exampleRotations.map(item => `<div class="rotation-bar-row ${item === winner ? 'is-winner' : ''}"><div class="rotation-bar-track"><div class="rotation-bar" style="height:${item[metric.key] / max * 100}%"><strong>${number(item[metric.key], metric.digits)}${metric.suffix}</strong></div></div><abbr title="${item.crops.join(' → ')}">${item.acronym}</abbr></div>`).join('')}</div>${legend}</section>`;
      }).join('')}
      <p class="rotation-footnote rotation-charts-footnote">Datos transcritos del reporte proporcionado. No se actualizan al ejecutar la simulación externa. Rendimientos expresados en soja equivalente por año. El consumo de napa se representa mediante el aporte capilar (Cr). La napa se mide desde la superficie: un valor mayor indica mayor profundidad. La ganadora se define únicamente por el mayor rendimiento; la rotación 2 presenta riesgo de recarga excesiva según el reporte.</p>
      </div>
    </section>`;
  }
  let generation = 0, cleanupDownload;
  let savedSimulation = null;
  const draft = {longitude: '', latitude: '', scenario: 'habitual'};
  function unmount() { generation++; cleanupDownload?.(); cleanupDownload = null; }
  async function mount(container) {
    unmount();
    const current = generation;
    container.innerHTML = `
      <div class="prediction-workspace">
        <div class="prediction-banner"><span class="demo-tag">SIMULACIÓN EXTERNA</span><p>Consultá la API de simulación con el punto geográfico cargado y el escenario climático.</p></div>
        <div class="collection-grid prediction-grid">
          <form class="view-card collection-form" id="prediction-form">
            <div class="prediction-configuration">
              <div class="prediction-section-heading"><span>01</span><div><h2>Ubicación para el análisis</h2><p>Cargá el punto geográfico que se utilizará en el reporte.</p></div></div>
              <p class="prediction-help">La determinación del punto de referencia a partir del mapa de trabajo queda pendiente para una etapa futura.</p>
              <div class="prediction-coordinates">
                <label>Longitud (WGS84)<input name="longitude" type="number" min="-180" max="180" step="any" placeholder="-61.160000" required></label>
                <label>Latitud (WGS84)<input name="latitude" type="number" min="-90" max="90" step="any" placeholder="-33.040000" required></label>
              </div>
              <label>Escenario climático<select name="scenario" required><option value="habitual">Habitual</option><option value="neutro">Neutro</option></select></label>
            </div>
            <div class="prediction-form-footer">
              <div class="collection-actions"><button type="submit">Simular</button></div>
              <p id="prediction-status" role="status" aria-live="polite"></p>
            </div>
          </form>

        </div>
      </div>`;
    const form = container.querySelector('form');
    const longitude = form.elements.longitude;
    const latitude = form.elements.latitude;
    const scenario = form.elements.scenario;
    const controller = new AbortController();
    const status = container.querySelector('#prediction-status');
    const button = form.querySelector('[type=submit]');
    Object.entries(draft).forEach(([name, value]) => { form.elements[name].value = value; });
    cleanupDownload = () => controller.abort();
    form.addEventListener('input', () => {
      Object.keys(draft).forEach(name => { draft[name] = form.elements[name].value; });
      status.textContent = '';
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (button.disabled || !form.reportValidity()) return;
      const point = {lon: Number(longitude.value), lat: Number(latitude.value)};
      button.disabled = true; button.textContent = 'Simulando…'; scenario.disabled = true; longitude.disabled = true; latitude.disabled = true;
      status.textContent = 'Consultando la API de simulación…';
      try {
        const response = await fetch('/api/predictions', {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({...point, escenario_clima: scenario.value.trim()}),
          signal: controller.signal
        });
        const payload = await response.json();
        if (current !== generation) return;
        if (!response.ok) throw Error(payload.error || 'No se pudo ejecutar la simulación.');
        savedSimulation = {point, scenario: scenario.value, result: payload.result};
        window.location.hash = 'reportes';
      } catch (error) {
        if (current !== generation || error.name === 'AbortError') return;
        status.textContent = error.message || 'No se pudo ejecutar la simulación.';
      } finally {
        if (current === generation) {
          button.disabled = false; button.textContent = 'Simular'; scenario.disabled = false; longitude.disabled = false; latitude.disabled = false;
        }
      }
    });

  }
  window.addEventListener('beforeprint', () => {
    const panel = document.getElementById('secondary-view');
    document.body.classList.toggle('printing-report', Boolean(panel && !panel.hidden && panel.dataset.view === 'reportes'));
  });
  window.addEventListener('afterprint', () => document.body.classList.remove('printing-report'));
  function mountReports(container) {
    unmount();
    container.innerHTML = `<div class="prediction-workspace">${rotationComparison()}${climatologySection()}          <div class="prediction-sidebar">
            <section class="view-card prediction-inputs" aria-labelledby="prediction-input-title">
              <h2 id="prediction-input-title">Contenido para compartir</h2>
              <h3>Punto de análisis</h3><p id="prediction-field">Todavía no se ejecutó una simulación.</p><a class="view-link" href="#predicciones">Ingresar datos en Predicciones →</a>
            </section>
            <div id="prediction-download" hidden><a class="view-link" id="prediction-download-link" download="punto-analisis.geojson">Descargar punto de análisis · GeoJSON →</a></div>
          </div></div><div class="report-actions"><button type="button" id="report-export-pdf">Exportar a PDF</button><p>Elegí «Guardar como PDF» en el diálogo de impresión.</p></div>`;
    container.querySelector('#report-export-pdf').addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      // Esperar las fuentes evita que cambien las medidas durante la paginación.
      try {
        await document.fonts?.ready;
        if (!container.isConnected) return;
        document.body.classList.add('printing-report');
        window.print();
      } catch (error) {
        document.body.classList.remove('printing-report');
        throw error;
      } finally {
        button.disabled = false;
      }
    });
    if (!savedSimulation) return;
    const {point, scenario} = savedSimulation;
    container.querySelector('#prediction-field').textContent = `Longitud: ${point.lon}° · Latitud: ${point.lat}° · Escenario: ${scenario}`;
    const geojson = {type: 'Feature', properties: {}, geometry: {type: 'Point', coordinates: [point.lon, point.lat]}};
    const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(geojson, null, 2)], {type: 'application/geo+json'}));
    container.querySelector('#prediction-download-link').href = objectUrl;
    container.querySelector('#prediction-download').hidden = false;
    cleanupDownload = () => URL.revokeObjectURL(objectUrl);
  }
  return {mount, mountReports, unmount};
})();
