/* Campo real digitalizado visualmente; las variables son simuladas. */
window.GeoMap = (() => {
  if (!window.L) return {ready:false};
  const external = Boolean(window.ARCGIS_CONFIG?.layers?.length);
  // La API entrega el contorno, los límites y la máscara desde un único GeoJSON.
  let bounds = L.latLngBounds([[-32.878861, -60.863129], [-32.870879, -60.857331]]);
  let coordinates = [];
  const map = L.map('geo-map', {zoomControl:false, maxZoom:19, minZoom:3});
  const status = document.getElementById('tile-status');
  const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom:19, attribution:'Imagery &copy; Esri, Vantor, Earthstar Geographics, GIS User Community'
  });
  const streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  });
  let base = satellite, overlay, summary, currentVariable, failed=false, tileTimer;
  let outgoing, fadeFrame, workLayer, workBounds, workMode = false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const opacity = () => Number(document.getElementById('overlay-opacity').value)/100;
  function finishFade(){
    cancelAnimationFrame(fadeFrame);
    if(outgoing){map.removeLayer(outgoing);outgoing=null;}
    if(overlay)overlay.setOpacity(opacity());
  }
  function tileState(message, error=false){
    status.textContent=message; status.hidden=!message;
    status.classList.toggle('tile-error',error);
  }
  for(const layer of [satellite,streets]){
    layer.on('loading',()=>{
      if(base!==layer)return;
      failed=false;tileState('Cargando mapa base…');
      clearTimeout(tileTimer);
      tileTimer=setTimeout(()=>{if(base===layer)tileState('El mapa tarda en responder. Probá cambiar la vista o revisá la conexión.',true)},15000);
    });
    layer.on('tileerror',()=>{if(base===layer){failed=true;tileState('No se pudo cargar parte del mapa. Probá otra vista o revisá tu conexión.',true)}});
    layer.on('load',()=>{if(base===layer){clearTimeout(tileTimer);if(!failed)tileState('')}});
  }
  L.DomEvent.disableClickPropagation(document.querySelector('.base-controls'));
  L.DomEvent.disableScrollPropagation(document.querySelector('.base-controls'));
  base.addTo(map);
  const boundary=L.polygon(coordinates,{color:'#f5ed83',weight:4,opacity:1,dashArray:'1 9',lineCap:'round',fill:false,interactive:false,className:'field-boundary'});
  if (!external && document.getElementById('boundary').checked) boundary.addTo(map);
  L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
  map.fitBounds(bounds,{padding:[35,70]});
  const baseButtons=document.querySelectorAll('#base-provider [data-base]');
  for(const button of baseButtons){
    button.addEventListener('click',()=>{
      const next=button.dataset.base==='streets'?streets:satellite;
      if(next===base)return;
      clearTimeout(tileTimer);map.removeLayer(base);base=next;
      for(const option of baseButtons)option.setAttribute('aria-pressed',String(option===button));
      tileState('Cargando mapa base…');base.addTo(map);
    });
  }
  document.getElementById('overlay-opacity').oninput=event=>{
    const value=Number(event.target.value);document.getElementById('opacity-value').value=value+'%';
    finishFade();
  };
  function contains(point){
    const x=point.lng,y=point.lat;let inside=false;
    for(let i=0,j=coordinates.length-1;i<coordinates.length;j=i++){
      const [yi,xi]=coordinates[i],[yj,xj]=coordinates[j];
      if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
    }
    return inside;
  }
  map.on('click',event=>{
    const el=document.createElement('div');
    const location=`Latitud ${event.latlng.lat.toFixed(6)} · Longitud ${event.latlng.lng.toFixed(6)}`;
    el.textContent=location;
    if(!workMode&&!external&&summary&&currentVariable!=='Base'&&(summary.normalized_polygons||contains(event.latlng))){
      if(summary.normalized_polygons){
        const [[s,w],[n,e]]=summary.bounds;
        const merc=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
        const col=Math.floor((event.latlng.lng-w)/(e-w)*summary.grid.width);
        const row=Math.floor((merc(n)-merc(event.latlng.lat))/(merc(n)-merc(s))*summary.grid.height);
        if(col<0||col>=summary.grid.width||row<0||row>=summary.grid.height||!summary.grid.mask[row*summary.grid.width+col]){
          L.popup().setLatLng(event.latlng).setContent(el).openOn(map);return;
        }
      }
      const detail=document.createElement('p');
      detail.textContent=`${summary.variable.name}: promedio del lote ${summary.average.toLocaleString('es-AR')} ${summary.variable.unit}. Dato simulado, no es una medición del punto.`;
      el.append(detail);
    }
    L.popup().setLatLng(event.latlng).setContent(el).openOn(map);
  });
  if (external) {
    document.querySelector('.map-watermark').textContent='CAPAS ARCGIS · RESUMEN LATERAL DE DEMOSTRACIÓN';
    document.getElementById('overlay-opacity').closest('label').hidden=true;
    document.getElementById('boundary').closest('label').hidden=true;
  }
  window.ArcGISSource?.init(map, window.ARCGIS_CONFIG);
  let resizeFrame;
  return {
    ready:true,
    getMap(){return map},
    arcgis:window.ArcGISSource,
    setDemoField(field){
      bounds=L.latLngBounds(field.bounds);
      const polys=field.geometry.type==='MultiPolygon'?field.geometry.coordinates:[field.geometry.coordinates];
      coordinates=polys[0][0].slice(0,-1).map(([lon,lat])=>[lat,lon]);
      boundary.setLatLngs(polys.map(poly=>poly.map(ring=>ring.map(([lon,lat])=>[lat,lon]))));
      if(!workMode&&!external)map.fitBounds(bounds,{padding:[35,70]});
    },
    setWorkMap(dataset){
      finishFade();
      if(overlay){map.removeLayer(overlay);overlay=null;}
      if(workLayer){map.removeLayer(workLayer);workLayer=null;}
      workBounds=null;workMode=Boolean(dataset);summary=null;map.closePopup();
      if(dataset){
        if(map.hasLayer(boundary))map.removeLayer(boundary);
        const features=dataset.records.filter(record=>record.geometry).map(record=>({
          type:'Feature',geometry:record.geometry,properties:record
        }));
        const exampleColor=value=>{
          if(value==null)return '#8c9ca7';
          const colors=[[212,88,76],[237,156,83],[201,199,121],[81,158,83]];
          const scaled=Math.max(0,Math.min(1,value/12))*3;
          const band=Math.min(2,Math.floor(scaled)), mix=scaled-band;
          return `rgb(${colors[band].map((v,i)=>Math.round(v*(1-mix)+colors[band+1][i]*mix)).join(',')})`;
        };
        workLayer=L.geoJSON({type:'FeatureCollection',features},{
          style:feature=>dataset.demo?{color:'#ffffff55',weight:.5,fillColor:exampleColor(feature.properties.yield_t_ha),fillOpacity:.7}:{color:'#a4d67b',weight:2,fillOpacity:0.25},
          pointToLayer:(_feature,latlng)=>L.circleMarker(latlng,{radius:5,color:'#a4d67b',fillOpacity:0.8}),
          onEachFeature:(feature,layer)=>{
            const content=document.createElement('div');
            content.textContent=`${dataset.field} · Registro ${feature.properties.record_id}${dataset.demo?' · Mediciones simuladas':''}`;
            for(const [key,label,unit] of [['yield_t_ha','Rendimiento','t/ha'],['area_ha','Superficie','ha'],['moisture_pct','Humedad','%'],['speed_kmh','Velocidad','km/h'],['elevation_m','Elevación','m']]){
              const value=feature.properties[key];
              if(value!=null){const row=document.createElement('p');row.textContent=`${label}: ${value.toLocaleString('es-AR')} ${unit}`;content.append(row);}
            }
            layer.bindPopup(content);
          }
        }).addTo(map);
        if(workLayer.getBounds().isValid())workBounds=workLayer.getBounds();
      }
      map.fitBounds(workBounds || bounds,{padding:[35,70],maxZoom:17});
    },
    setOverlay(url){
      finishFade();
      outgoing=overlay;overlay=null;
      const next=url&&!external?L.imageOverlay(url,bounds,{opacity:0,interactive:false}):null;
      overlay=next;
      const startFade=()=>{
        if(overlay!==next)return;
        if(reducedMotion.matches){finishFade();return;}
        const start=performance.now();
        function tick(now){
          const progress=Math.min(1,(now-start)/550);
          const eased=progress*progress*(3-2*progress);
          if(next)next.setOpacity(opacity()*eased);
          if(outgoing)outgoing.setOpacity(opacity()*(1-eased));
          if(progress<1)fadeFrame=requestAnimationFrame(tick);else finishFade();
        }
        fadeFrame=requestAnimationFrame(tick);
      };
      if(next){next.once('load',startFade);next.once('error',finishFade);next.addTo(map);}
      else startFade();
      boundary.bringToFront();
    },
    setBoundary(visible){visible=visible&&!external&&!workMode;if(visible&&!map.hasLayer(boundary))boundary.addTo(map);else if(!visible&&map.hasLayer(boundary))map.removeLayer(boundary)},
    setSummary(value,variable){summary=value;currentVariable=variable;map.closePopup()},
    zoomIn(){map.zoomIn()},zoomOut(){map.zoomOut()},
    center(){map.fitBounds(workBounds || bounds,{padding:[35,70]})},
    resize(){if(!resizeFrame)resizeFrame=requestAnimationFrame(()=>{resizeFrame=null;map.invalidateSize({pan:false})})}
  };
})();
