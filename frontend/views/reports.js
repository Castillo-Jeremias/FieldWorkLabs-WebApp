import {exampleRotations, climateExample, balance} from '../datasets/reports.js';
import {formatNumber as number} from '../shared/format.js';
import {simulationSession} from '../domain/predictions.js';

export const Reports = (() => {
  let cleanupDownload;
  function unmount() { cleanupDownload?.(); cleanupDownload = null; }
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
    if (!simulationSession.current) return;
    const {point, scenario} = simulationSession.current;
    container.querySelector('#prediction-field').textContent = `Longitud: ${point.lon}° · Latitud: ${point.lat}° · Escenario: ${scenario}`;
    const geojson = {type: 'Feature', properties: {}, geometry: {type: 'Point', coordinates: [point.lon, point.lat]}};
    const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(geojson, null, 2)], {type: 'application/geo+json'}));
    container.querySelector('#prediction-download-link').href = objectUrl;
    container.querySelector('#prediction-download').hidden = false;
    cleanupDownload = () => URL.revokeObjectURL(objectUrl);
  }
  return {mount: mountReports, unmount};
})();
