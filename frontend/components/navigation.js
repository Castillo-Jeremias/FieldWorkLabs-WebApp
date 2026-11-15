import {WorkSummary} from '../views/summary.js';
import {WorkMaps} from '../views/work-maps.js';
import {Predictions} from '../views/predictions.js';
import {Reports} from '../views/reports.js';

(() => {
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('menu-toggle');
  const backdrop = document.getElementById('menu-backdrop');
  const mobile = window.matchMedia('(max-width: 700px)');
  const breadcrumb = document.getElementById('breadcrumb');
  const lotBreadcrumb = document.createElement('span');
  lotBreadcrumb.className = 'lot-breadcrumb';
  lotBreadcrumb.append(...breadcrumb.childNodes);
  const viewBreadcrumb = document.createElement('span');
  breadcrumb.append(lotBreadcrumb, viewBreadcrumb);
  const views = {
    predicciones: {title: 'Predicciones', description: '', content: ''},
    mapas: {title: 'Mapas de trabajo', description: 'Recopilá mediciones reales por lote y campaña para preparar los datos de tu modelo.', content: ''},
    resumen: {title: 'Resumen', description: 'Consultá los indicadores generales del mapa seleccionado.', content: ''},
    reportes: {title: 'Reportes', description: 'Consultá la comparación de rotaciones, el análisis climático y los resultados de simulación.', content: ''}
  };

  let collapsed = mobile.matches;
  try { if (!mobile.matches) collapsed = localStorage.getItem('sidebar-collapsed') === 'true'; } catch {}
  function setCollapsed(value, persist = true) {
    collapsed = value;
    document.body.classList.toggle('sidebar-collapsed', value);
    toggle.setAttribute('aria-expanded', String(!value));
    toggle.setAttribute('aria-label', value ? 'Mostrar menú lateral' : 'Ocultar menú lateral');
    toggle.title = toggle.getAttribute('aria-label');
    sidebar.inert = value;
    backdrop.hidden = value || !mobile.matches;
    if (persist && !mobile.matches) { try { localStorage.setItem('sidebar-collapsed', String(value)); } catch {} }
  }
  function navigate(focus = false) {
    WorkSummary.unmount();
    Reports.unmount();
    WorkMaps?.unmount();
    Predictions?.unmount();
    const key = window.location.hash.slice(1) || 'resumen';
    const view = views[key];
    const isLots = !view;
    document.querySelectorAll('.lot-view').forEach(el => el.hidden = !isLots);
    const panel = document.getElementById('secondary-view');
    panel.hidden = isLots;
    panel.dataset.view = key;
    lotBreadcrumb.hidden = !isLots;
    viewBreadcrumb.hidden = isLots;
    if (!isLots) {
      document.getElementById('view-title').textContent = view.title;
      document.getElementById('view-description').textContent = view.description;
      document.getElementById('view-content').innerHTML = view.content;
      viewBreadcrumb.textContent = view.title;
      if (key === 'reportes') Reports.mount(document.getElementById('view-content'));
      if (key === 'resumen') WorkSummary?.mount(document.getElementById('view-content'));
      if (key === 'predicciones') Predictions?.mount(document.getElementById('view-content'));
      if (key === 'mapas') {
        if (WorkMaps) WorkMaps.mount(document.getElementById('view-content'));
        else document.getElementById('view-content').textContent = 'No se pudo cargar el formulario. Recargá la página para reintentar.';
      }
    }
    document.querySelectorAll('[data-view]').forEach(link => {
      const active = link.dataset.view === (isLots ? 'lotes' : key);
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    document.title = `FieldWork Labs · ${isLots ? 'Lotes' : view.title}`;
    if (mobile.matches) setCollapsed(true, false);
    if (focus) {
      const target = isLots ? document.querySelector('.field-heading h1') : panel;
      target.setAttribute('tabindex', '-1'); target.focus({preventScroll:true});
    }
  }
  toggle.addEventListener('click', () => setCollapsed(!collapsed));
  backdrop.addEventListener('click', () => {setCollapsed(true); toggle.focus();});
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !collapsed) {setCollapsed(true); toggle.focus();}
    if (event.key === 'Tab' && mobile.matches && !collapsed) {
      const links = [...sidebar.querySelectorAll('a')];
      const first = links[0], last = links[links.length - 1];
      if (!sidebar.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {event.preventDefault(); (event.shiftKey ? last : first).focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first.focus();}
    }
  });
  sidebar.addEventListener('click', event => {
    const link = event.target.closest('[data-view]');
    if (link && link.hash === window.location.hash) navigate(true);
  });
  mobile.addEventListener('change', () => setCollapsed(mobile.matches, false));
  window.addEventListener('hashchange', () => navigate(true));
  setCollapsed(collapsed, false);
  navigate();
})();
