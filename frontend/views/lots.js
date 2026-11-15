import {ARCGIS_CONFIG} from '../config/arcgis.js';
import {byId as $, element} from '../shared/dom.js';
import {formatNumber as fmt, dateText} from '../shared/format.js';
import {palettes} from '../datasets/palettes.js';
import {GeoMap} from '../maps/geo-map.js';
import {workMapSelection} from '../domain/selection.js';
import {getCatalog, getSummary} from '../services/observations.js';
import {listMaps, getMap, getObservations} from '../services/workmaps.js';

const simulatingWork = () => Boolean(activeMapId);
let activeMapId = '', workData = null, workMaps = [];
let data, selected = 'precipitation', request = 0;
const canvas = $('field-map'), ctx = canvas.getContext('2d');
let polygon = [], path = new Path2D(), geometryKey;
function configureDemoGeometry(summary){
  if(!summary.geometry || (!summary.normalized_polygon&&!summary.normalized_polygons))return;
  const key=JSON.stringify(summary.geometry);
  if(key!==geometryKey){
    const polygons=summary.normalized_polygons||[[summary.normalized_polygon]];
    polygon=polygons.flat(1).flat(1);path=new Path2D();
    for(const poly of polygons)for(const ring of poly){
      ring.forEach(([x,y],i)=>i?path.lineTo(x*900,y*1000):path.moveTo(x*900,y*1000));
      path.closePath();
    }featherMask=null;heatCache.clear();geometryKey=key;
    GeoMap?.setDemoField?.(summary);
  }
}
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
const heatCache = new Map();
let featherMask;
function getFeatherMask(){
  if(featherMask)return featherMask;
  // El color se desvanece hacia el límite sin desbordar fuera del lote.
  const mask=document.createElement('canvas');mask.width=180;mask.height=200;
  const g=mask.getContext('2d'), image=g.createImageData(mask.width,mask.height);
  for(let y=0;y<mask.height;y++)for(let x=0;x<mask.width;x++){
    const px=(x+.5)*5,py=(y+.5)*5;
    if(!ctx.isPointInPath(path,px,py))continue;
    let distance=Infinity;
    polygon.forEach(([ax,ay],i)=>{
      const [bx,by]=polygon[(i+1)%polygon.length];
      const dx=(bx-ax)*900,dy=(by-ay)*1000;
      const t=Math.max(0,Math.min(1,((px-ax*900)*dx+(py-ay*1000)*dy)/(dx*dx+dy*dy)));
      distance=Math.min(distance,Math.hypot(px-ax*900-t*dx,py-ay*1000-t*dy));
    });
    const fade=Math.min(1,distance/45);
    image.data[(y*mask.width+x)*4+3]=Math.round(255*fade*fade*(3-2*fade));
  }
  g.putImageData(image,0,0);featherMask=mask;return mask;
}
let variables = [], controller, frame = 0;
let displayed = null, activeLayer = null;
function palette(id){return palettes[id==='NDVI'?'NDVI':id==='elevation'?'elevation':['air_temperature','surface_temperature','evapotranspiration'].includes(id)?'thermal':'water']}
async function heat(summary, signal){
  const {variable, date, grid}=summary;
  const key = variable.id + (variable.id === 'elevation' ? '' : date);
  if(heatCache.has(key)) return heatCache.get(key);
  await pause();
  if(signal.aborted)throw new DOMException('Cancelled','AbortError');
  const c=document.createElement('canvas'); c.width=900;c.height=1000;
  const g=c.getContext('2d');
  const raster=document.createElement('canvas');raster.width=grid.width;raster.height=grid.height;
  const r=raster.getContext('2d'), pixels=r.createImageData(grid.width,grid.height);
  const [low,high]=variable.limits;
  const colors=palette(variable.id).map(hex=>[1,3,5].map(start=>parseInt(hex.slice(start,start+2),16)));
  // La misma escala continua de la leyenda, con colores intermedios.
  grid.values.forEach((value,i)=>{
    const level=Math.max(0,Math.min(1,(value-low)/(high-low)));
    const scaled=level*3, band=Math.min(2,Math.floor(scaled)), mix=scaled-band;
    for(let channel=0;channel<3;channel++)pixels.data[i*4+channel]=Math.round(colors[band][channel]*(1-mix)+colors[band+1][channel]*mix);
    pixels.data[i*4+3]=grid.mask&&!grid.mask[i]?0:255;
  });
  r.putImageData(pixels,0,0);
  g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
  g.drawImage(raster,0,0,900,1000);
  g.globalCompositeOperation='destination-in';
  if(!summary.normalized_polygons)g.drawImage(getFeatherMask(),0,0,900,1000);
  else {g.globalCompositeOperation='source-over';}
  g.globalCompositeOperation='source-over';
  if(heatCache.size>=12)heatCache.delete(heatCache.keys().next().value);
  heatCache.set(key,c);return c;
}
function draw(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;paint()})}
let lastLayer;
function paint(){
  if(activeMapId&&!simulatingWork())return;
  if(!GeoMap?.ready)return;
  GeoMap.setBoundary($('boundary').checked);
  if(lastLayer===activeLayer)return;
  lastLayer=activeLayer;
  canvas.width=900;canvas.height=1000;
  if(activeLayer)ctx.drawImage(activeLayer,0,0);
  GeoMap.setOverlay(activeLayer?canvas.toDataURL():null);
  GeoMap.setSummary(data,displayed);
}
function render(){
  const v=data.variable;
  if(data.area!==undefined)setField(data.field,`${fmt(data.area,2)} ha aprox. · ${data.crop} (simulado) · ${data.location||'Ubicación del contorno'}`);
  data.zones.forEach((zone,i)=>zone.color=palette(v.id)[3-i]);
  ['average','min','max','std'].forEach(key=>$(key).textContent=fmt(data[key],v.digits));
  document.querySelectorAll('.index-label').forEach(el=>el.textContent=v.name);
  $('crumb-index').textContent=v.name;$('value-unit').textContent=v.unit;
  $('observation').textContent=dateText(data.date);
  $('caption').textContent=`${displayed==='Base'?'Mapa base':v.name} · ${dateText(data.date)}`;
  $('map-index').textContent=displayed==='Base'?'Mapa base':v.name;
  $('variable-context').textContent=`${simulatingWork()?'Simulación local de datos para ArcGIS · ':''}${v.reason}. ${v.period}.${v.slope!==undefined?' Pendiente media: '+fmt(v.slope,1)+' %.':''}`;
  $('health').innerHTML=data.zones.map(z=>`<div class="health-row"><span>${z.name} (${z.range})</span><b>${fmt(z.percent,1)}%</b></div>`).join('');
  $('zones').innerHTML=data.zones.map(z=>`<tr><td>${z.name}</td><td>${z.range}</td><td>${fmt(z.area,1)}</td><td>${fmt(z.percent,1)}%</td></tr>`).join('');
  $('distribution').innerHTML=data.zones.map(z=>`<span style="width:${z.percent}%;background:${z.color}"></span>`).join('');
  $('legend-low').textContent=fmt(v.limits[0],v.digits)+' '+v.unit;
  $('legend-high').textContent=fmt(v.limits[1],v.digits)+' '+v.unit;
  $('legend-gradient').style.background=`linear-gradient(90deg,${palette(v.id).join(',')})`;
  $('map').classList.toggle('base-map',displayed==='Base');
  renderLayers();draw();renderHistory();
}
function renderLayers(){
  $('layers').innerHTML=[...variables,{id:'Base',name:'Mapa base',priority:'',unit:'Esri / OpenStreetMap'}].map(v=>`<button class="layer ${displayed===v.id?'selected':''}" data-index="${v.id}" aria-pressed="${displayed===v.id}"><span class="eye">${v.priority||'◎'}</span><span class="layer-text"><b>${v.name}</b><small>${v.unit||'Índice sin unidad'}</small></span>${displayed===v.id?'<span class="badge">Activa</span>':''}</button>`).join('');
}
function loading(busy, message='Cargando variable…'){
  $('map').setAttribute('aria-busy',String(busy));$('map-loading').hidden=!busy;
  $('loading-message').textContent=message;$('retry-load').hidden=true;
  $('map-loading').classList.remove('load-error');
}
async function load(){
  const map=workMaps.find(item=>item.id===activeMapId);
  const available=map?fieldHistory(map).some(item=>item.date===selectedDate):demoDates.includes(selectedDate);
  document.body.classList.toggle('observation-empty',!available);
  if(!available){
    ++request;controller?.abort();data=null;activeLayer=null;lastLayer=undefined;
    GeoMap?.setOverlay(null);GeoMap?.setSummary(null,selected);
    loading(false);
    $('caption').textContent=`Sin datos disponibles · ${dateText(selectedDate)}`;
    $('map-index').textContent='Sin observación';
    renderHistory();return;
  }
  if(activeMapId&&!simulatingWork())return loadWorkMap();
  if(simulatingWork()){
    const metadata=workMaps.find(map=>map.id===activeMapId);
    if(metadata)renderHistory();
    setWorkMode(false);GeoMap?.setWorkMap?.(null);lastLayer=undefined;
    document.querySelector('.map-watermark').textContent='SIMULACIÓN DE DATOS ARCGIS · CONTORNO INGRESADO';}
  const current=++request;
  controller?.abort();controller=new AbortController();const signal=controller.signal;
  const target=selected,date=selectedDate;
  loading(true);await pause();
  try{
    if(!GeoMap?.ready)throw Error('Mapa no disponible');
    if(!variables.length){variables=(await getCatalog({signal})).variables;renderLayers();}
    const variable=target==='Base'?'NDVI':target;
    const options={signal,cache:'no-store'};
    const result=simulatingWork()?await getObservations(activeMapId,variable,options):await getSummary(date,variable,options);
    if(current!==request)return;
    configureDemoGeometry(result);
    if(target!=='Base'&&(!result.grid||!result.geometry))throw Error('Reiniciá el backend para cargar la nueva representación simulada.');
    const layer=target==='Base'?null:await heat(result,signal);
    if(current!==request)return;
    data=result;displayed=target;activeLayer=layer;render();
    // Keep the loading indicator through the frame that paints the new layer.
    requestAnimationFrame(()=>{if(current===request)loading(false)});
  }catch(error){
    if(current!==request||error.name==='AbortError')return;
    loading(true,simulatingWork()||error.message.startsWith('Reiniciá')?error.message:GeoMap?.ready?'No se pudo cargar la variable. Reintentá.':'No se pudo iniciar el mapa. Revisá tu conexión y recargá la página.');
    $('map-loading').classList.add('load-error');$('retry-load').hidden=false;
  }
}
function toast(message){$('toast').textContent=message;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',4000)}
$('retry-load').onclick=()=>{if(!GeoMap?.ready)window.location.reload();else load()};
$('layers').onclick=e=>{const button=e.target.closest('[data-index]');if(button){selected=button.dataset.index;load()}};
$('boundary').onchange=draw;
$('zoom-in').onclick=()=>GeoMap?.zoomIn();
$('zoom-out').onclick=()=>GeoMap?.zoomOut();
$('reset').onclick=()=>GeoMap?.center();
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('map').requestFullscreen()}catch{toast('El navegador no permite abrir pantalla completa.')}};
new ResizeObserver(()=>GeoMap?.resize()).observe($('map'));

let demoDates = [];
let selectedDate = demoDates[0];
const demoWatermark = document.querySelector('.map-watermark').textContent;
function setField(name, metadata){
  $('field-name').textContent=name;$('map-field-name').textContent=name;
  $('field-metadata').textContent=metadata;
  window.currentField={name,metadata};
  const label=$('selected-field-label');if(label)label.textContent=name;
  window.dispatchEvent(new Event('fieldchange'));
}
function setWorkMode(enabled){
  document.querySelectorAll('.demo-content').forEach(element=>element.hidden=enabled);
  $('work-map-summary').hidden=!enabled;$('work-map-details').hidden=!enabled;
  document.querySelector('.map-legend').hidden=enabled;
  $('overlay-opacity').closest('label').hidden=enabled||Boolean(ARCGIS_CONFIG?.layers?.length);
  document.querySelector('.map-watermark').textContent=enabled?'ARCHIVO CARGADO · MEDICIONES DECLARADAS':demoWatermark;
}
function detailRow(parent,label,value){
  const row=document.createElement('p'), title=document.createElement('b');
  title.textContent=label+': ';row.append(title,document.createTextNode(value));parent.append(row);
}
function fieldHistory(map){
  if(!map)return [];
  return workMaps.filter(item=>item.field===map.field&&item.campaign===map.campaign)
    .sort((a,b)=>b.date.localeCompare(a.date)||(b.created_at||'').localeCompare(a.created_at||'')||a.id.localeCompare(b.id));
}
function renderLotOptions(){
  const groups=new Map();
  for(const map of workMaps){
    const key=JSON.stringify([map.field,map.campaign]);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(map);
  }
  const options=[new Option('Lote Norte · Demostración','')];
  for(const group of groups.values()){
    const map=group.find(item=>item.id===activeMapId)||fieldHistory(group[0])[0];
    const area=map.summary?.area_ha;
    const option=new Option(`${map.field}${area!=null?' · '+fmt(area)+' ha':''} · ${map.campaign}`,map.id);
    option.dataset.field=map.field;options.push(option);
  }
  $('lot-select').replaceChildren(...options);
  $('lot-select').value=activeMapId;
}
workMapSelection.select = id => selectLot(id);
workMapSelection.getId = () => activeMapId;
// El formulario usa el contexto seleccionado, incluso mientras se carga el archivo.
workMapSelection.getContext=()=>{
  const map=workMaps.find(item=>item.id===activeMapId);
  return {field:map?.field||'',crop:map?.crop||'',campaign:map?.campaign||'',
    operation:map?.operation||'Cosecha',source:map?.source||'',date:selectedDate};
};
async function loadWorkMap(){
  const current=++request;
  controller?.abort();controller=new AbortController();const signal=controller.signal;
  workData=null;data=null;activeLayer=null;
  $('map').classList.remove('base-map');
  setWorkMode(true);GeoMap?.setWorkMap?.(null);
  const metadata=workMaps.find(map=>map.id===activeMapId);
  if(metadata)renderHistory();
  $('work-map-summary').replaceChildren();$('work-map-details').replaceChildren();
  $('caption').textContent='Cargando archivo…';$('map-index').textContent='Archivo cargado';$('crumb-index').textContent='Archivo cargado';
  loading(true,'Cargando lote…');
  try{
    const dataset=await getMap(activeMapId,{signal});
    if(current!==request)return;
    workData=dataset;
    document.querySelector('.map-watermark').textContent=dataset.demo?'CONTORNO REAL APROXIMADO · VARIABLES SIMULADAS':'ARCHIVO CARGADO · MEDICIONES DECLARADAS';
    if(dataset.demo){
      document.querySelector('.map-legend').hidden=false;
      $('legend-low').textContent='0 t/ha';$('legend-high').textContent='12 t/ha';
      $('legend-gradient').style.background='linear-gradient(90deg,#d4584c,#ed9c53,#c9c779,#519e53)';
    }
    const summary=dataset.summary;
    const value=(number,unit)=>number==null?'Sin dato':`${fmt(number)} ${unit}`;
    setField(dataset.field,`${value(summary.area_ha,'ha')} · ${dataset.crop} · Campaña ${dataset.campaign}`);
    renderHistory();
    const panel=$('work-map-summary');
    const title=document.createElement('h2');title.textContent=dataset.demo?'SIMULACIÓN SOBRE CAMPO REAL':'MEDICIONES DEL ARCHIVO';panel.append(title);
    detailRow(panel,dataset.geometry_origin==='digitized_imagery'?'Superficie del contorno':'Superficie declarada',value(summary.area_ha,'ha'));
    detailRow(panel,'Rendimiento ponderado',value(summary.yield_t_ha,'t/ha'));
    detailRow(panel,'Rendimiento medio',value(summary.yield_mean_t_ha,'t/ha'));
    detailRow(panel,'Registros',String(summary.record_count));
    detailRow(panel,'Con geometría',String(summary.georeferenced_count));
    const details=$('work-map-details'), heading=document.createElement('h2');
    heading.textContent='ARCHIVO CARGADO';details.append(heading);
    for(const [label,key] of [['Archivo','filename'],['Operación','operation'],['Fuente','source']])detailRow(details,label,dataset[key]);
    detailRow(details,'Fecha',dateText(dataset.date));
    if(dataset.boundary_provenance){
      detailRow(details,'Ubicación',dataset.location);
      detailRow(details,'Contorno',dataset.boundary_provenance.boundary_method);
      detailRow(details,'Trazado',dataset.boundary_provenance.digitized_on);
    }
    for(const warning of summary.warnings){const text=document.createElement('p');text.textContent=warning;details.append(text);}
    if(!summary.georeferenced_count)detailRow(details,'Mapa','El archivo no contiene geometría. Solo se muestra el mapa base.');
    GeoMap?.setWorkMap?.(dataset);
    $('caption').textContent=`${dataset.filename} · ${dateText(dataset.date)}`;
    $('map-index').textContent=dataset.operation;$('crumb-index').textContent=dataset.filename;
    loading(false);
  }catch(error){
    if(current!==request||error.name==='AbortError')return;
    loading(true,'No se pudo cargar el archivo. Reintentá o seleccioná otro lote.');
    $('map-loading').classList.add('load-error');$('retry-load').hidden=false;
  }
}
function selectLot(id){
  activeMapId=id;workData=null;
  const selectedMap=workMaps.find(map=>map.id===id);
  if(selectedMap)selectedDate=selectedMap.date;
  geometryKey=null;heatCache.clear();lastLayer=undefined;
  renderLotOptions();
  const option=$('lot-select').selectedOptions[0];
  if(id){setField(option?.dataset.field||'Lote','Cargando archivo…');}
  else{
    setWorkMode(false);GeoMap?.setWorkMap?.(null);
    selectedDate=demoDates[0];
    setField('Lote Norte','19,58 ha aprox. · Maíz (simulado) · Rosario, Santa Fe');
    lastLayer=undefined;
  }
  const url=new URL(window.location.href);
  if(id)url.searchParams.set('map',id);else url.searchParams.delete('map');
  history.replaceState(null,'',url);
  try{localStorage.setItem('selected-work-map',id);}catch{}
  renderHistory();
  load();
  window.dispatchEvent(new Event('workmapselectionchange'));
}
async function refreshLots(){
  try{
    const {maps}=await listMaps();
    workMaps=maps;
    if(activeMapId&&!maps.some(map=>map.id===activeMapId)){
      toast('El archivo seleccionado ya no está disponible.');selectLot('');
    }
    renderLotOptions();
    const selectedMap=maps.find(map=>map.id===activeMapId);
    if(selectedMap)renderHistory();
  }catch{toast('No se pudo actualizar la lista de archivos. Recargá la página para reintentar.');}
}
async function initLots(){
  activeMapId=new URL(window.location.href).searchParams.get('map')||'';
  if(!new URL(window.location.href).searchParams.has('map')){try{activeMapId=localStorage.getItem('selected-work-map')||'';}catch{}}
  $('lot-select').onchange=()=>selectLot($('lot-select').value);
  demoDates=(await getCatalog()).dates;
  selectedDate=demoDates[0];
  await refreshLots();selectLot(activeMapId);
  window.addEventListener('focus',refreshLots);
  window.addEventListener('workmapschange',async event=>{
    await refreshLots();
    const id=event?.detail?.id;
    if(id&&workMaps.some(map=>map.id===id))selectLot(id);
  });
}

let historyMonth = '';
function renderHistory(navigate = false){
  const panel=$('selection-history');
  if(!panel)return;
  const map=workMaps.find(item=>item.id===activeMapId);
  const entries=map?fieldHistory(map):demoDates.map(date=>({date}));
  const date=selectedDate;
  if(!navigate||!historyMonth)historyMonth=date.slice(0,7);
  panel.replaceChildren();
  const node=element;
  panel.append(node('h2','HISTÓRICO DE SELECCIÓN'));
  const toolbar=node('div',undefined,'history-toolbar');
  const month=new Date(historyMonth+'-01T12:00:00');
  for(const [label,offset] of [['‹',-1],['›',1]]){
    const button=node('button',label);button.type='button';button.setAttribute('aria-label',offset<0?'Mes anterior':'Mes siguiente');
    button.onclick=()=>{const next=new Date(month);next.setMonth(next.getMonth()+offset);historyMonth=`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}`;renderHistory(true);};toolbar.append(button);
  }
  toolbar.insertBefore(node('b',month.toLocaleDateString('es-AR',{month:'long',year:'numeric'})),toolbar.lastChild);panel.append(toolbar);
  const calendar=node('div',undefined,'history-calendar');
  ['L','M','M','J','V','S','D'].forEach(day=>calendar.append(node('span',day,'history-weekday')));
  for(let i=0;i<(month.getDay()+6)%7;i++)calendar.append(node('span',''));
  const days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  for(let day=1;day<=days;day++){
    const key=historyMonth+'-'+String(day).padStart(2,'0'), available=entries.filter(entry=>entry.date===key);
    const button=node('button',String(day));button.type='button';button.classList.toggle('has-data',Boolean(available.length));
    button.setAttribute('aria-label',`${dateText(key)} · ${available.length} observaciones o archivos`);
    button.setAttribute('aria-pressed',String(key===date));button.onclick=()=>chooseHistory(available[0]||{date:key});calendar.append(button);
  }
  panel.append(calendar);
}
function chooseHistory(entry){
  if(activeMapId&&entry.id)selectLot(entry.id);
  else{selectedDate=entry.date;renderHistory();load();}
}

initLots().catch(() => toast('No se pudo iniciar el catálogo. Recargá la página para reintentar.'));
