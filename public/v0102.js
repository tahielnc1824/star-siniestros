// v0.10.3: selección visual optimizada + geometría local recortada alrededor del punto.
(() => {
  const abrirBtn=document.getElementById('abrirMapaPicker');
  const panel=document.getElementById('mapaPickerPanel');
  const mapEl=document.getElementById('mapaPicker');
  const buscarZona=document.getElementById('buscarZonaMapa');
  const zonaInput=document.getElementById('zonaMapaQuery');
  const usarBtn=document.getElementById('usarPuntoMapa');
  const quitarBtn=document.getElementById('quitarPuntoMapa');
  const status=document.getElementById('mapaPickerStatus');
  const roadList=document.getElementById('mapaCallesDetectadas');
  const relatoInput=document.getElementById('relato');
  const analizarBtn=document.getElementById('analizar');
  const limpiarBtn=document.getElementById('limpiar');
  const estado=document.getElementById('estado');
  if(!abrirBtn||!panel||!mapEl||!window.L) return;

  const QUERY_RADIUS_M=60;
  const DRAW_RADIUS_M=48;
  const KEEP_DISTANCE_M=28;
  const REQUEST_TIMEOUT_MS=4500;

  let map=null,marker=null,preview=null,active=null,requestSeq=0;
  window.STAR_MAP_GEOMETRY=null;

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const setStatus=t=>{status.textContent=t};
  const setEstado=t=>{if(estado)estado.textContent=t};

  function initMap(){
    if(map){setTimeout(()=>map.invalidateSize(),50);return;}
    map=L.map(mapEl,{zoomControl:true}).setView([-34.485,-58.726],14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:20,attribution:'© OpenStreetMap contributors'}).addTo(map);
    map.on('click',e=>selectPoint(e.latlng.lat,e.latlng.lng));
    setStatus('Mové el mapa y hacé clic exactamente sobre el cruce o lugar del siniestro.');
  }

  function roadWidth(kind){
    if(['motorway','trunk','primary'].includes(kind))return 30;
    if(['secondary','tertiary'].includes(kind))return 24;
    return 18;
  }

  function metersXY(lat,lon,lat0,lon0){
    const rlat=lat0*Math.PI/180;
    return {x:(lon-lon0)*111320*Math.cos(rlat),y:(lat-lat0)*110540};
  }

  function pointSegDist(px,py,ax,ay,bx,by){
    const dx=bx-ax,dy=by-ay;
    if(!dx&&!dy)return Math.hypot(px-ax,py-ay);
    const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy)));
    return Math.hypot(px-(ax+t*dx),py-(ay+t*dy));
  }

  function wayDistanceToPoint(geometry,lat,lon){
    let best=Infinity;
    for(let i=1;i<geometry.length;i++){
      const a=metersXY(geometry[i-1].lat,geometry[i-1].lon,lat,lon);
      const b=metersXY(geometry[i].lat,geometry[i].lon,lat,lon);
      best=Math.min(best,pointSegDist(0,0,a.x,a.y,b.x,b.y));
    }
    return best;
  }

  function clipGeometry(geometry,lat,lon,radius){
    const pts=geometry.map(p=>({...p,m:metersXY(p.lat,p.lon,lat,lon)}));
    const kept=[];
    for(let i=0;i<pts.length;i++){
      const d=Math.hypot(pts[i].m.x,pts[i].m.y);
      const near=d<=radius;
      const prev=i>0&&Math.hypot(pts[i-1].m.x,pts[i-1].m.y)<=radius;
      const next=i<pts.length-1&&Math.hypot(pts[i+1].m.x,pts[i+1].m.y)<=radius;
      if(near||prev||next)kept.push({lat:pts[i].lat,lon:pts[i].lon});
    }
    return kept.length>=2?kept:[];
  }

  async function fetchWithTimeout(url,ms){
    const c=new AbortController();
    const timer=setTimeout(()=>c.abort(),ms);
    try{return await fetch(url,{headers:{Accept:'application/json'},signal:c.signal})}
    finally{clearTimeout(timer)}
  }

  async function overpass(lat,lon){
    const q=`[out:json][timeout:4];way(around:${QUERY_RADIUS_M},${lat},${lon})[highway];out tags geom qt;`;
    const urls=[
      'https://overpass.kumi.systems/api/interpreter?data='+encodeURIComponent(q),
      'https://overpass-api.de/api/interpreter?data='+encodeURIComponent(q)
    ];
    let lastErr=null;
    for(const url of urls){
      try{
        const res=await fetchWithTimeout(url,REQUEST_TIMEOUT_MS);
        if(!res.ok)throw new Error('Servicio de geometría no disponible');
        const data=await res.json();
        const ways=(data.elements||[])
          .filter(w=>Array.isArray(w.geometry)&&w.geometry.length>1)
          .map(w=>({
            id:w.id,
            nombre:(w.tags?.name||w.tags?.ref||'').trim()||'Calle sin nombre',
            highway:w.tags?.highway||'road',
            oneway:w.tags?.oneway||'',
            distance:wayDistanceToPoint(w.geometry,lat,lon),
            geometry:clipGeometry(w.geometry,lat,lon,DRAW_RADIUS_M)
          }))
          .filter(w=>w.geometry.length>=2&&w.distance<=KEEP_DISTANCE_M)
          .sort((a,b)=>a.distance-b.distance);

        const dedup=[],seen=new Set();
        for(const w of ways){
          const key=`${w.nombre.toLowerCase()}|${w.highway}`;
          if(seen.has(key))continue;
          seen.add(key);dedup.push(w);
          if(dedup.length>=8)break;
        }
        return dedup;
      }catch(e){lastErr=e}
    }
    throw lastErr||new Error('No se pudo leer la geometría vial.');
  }

  function uniqueNames(ways){
    const seen=new Set(),names=[];
    for(const w of ways){
      if(!w.nombre||w.nombre==='Calle sin nombre')continue;
      const k=w.nombre.toLowerCase();if(seen.has(k))continue;seen.add(k);names.push(w.nombre);
    }
    return names;
  }

  async function selectPoint(lat,lon){
    const seq=++requestSeq;
    if(marker)marker.setLatLng([lat,lon]);else marker=L.marker([lat,lon]).addTo(map);
    if(preview?.layer)preview.layer.remove();
    usarBtn.disabled=true;
    setStatus('Leyendo solo las calles inmediatas al punto…');roadList.innerHTML='';
    try{
      const ways=await overpass(lat,lon);
      if(seq!==requestSeq)return;
      const names=uniqueNames(ways);
      preview={lat,lon,ways,names};
      const group=L.featureGroup();
      ways.forEach(w=>L.polyline(w.geometry.map(p=>[p.lat,p.lon]),{weight:Math.max(3,roadWidth(w.highway)/6),opacity:.72}).addTo(group));
      group.addTo(map);preview.layer=group;
      roadList.innerHTML=names.length?names.map(n=>`<span class="map-road-chip">${esc(n)}</span>`).join(''):'<span class="location-meta">No encontré nombres, pero sí geometría vial local.</span>';
      setStatus(`Listo. Detecté ${ways.length} tramos útiles${names.length?` y ${names.length} nombres de calle`:''} alrededor del punto.`);
      usarBtn.disabled=ways.length===0;
    }catch(e){
      if(seq!==requestSeq)return;
      preview={lat,lon,ways:[],names:[]};
      setStatus('No pude leer las calles en unos segundos. Probá otra vez o mové apenas el punto.');
      usarBtn.disabled=true;
    }
  }

  async function searchZone(){
    const q=zonaInput.value.trim();if(!q)return;
    buscarZona.disabled=true;const old=buscarZona.textContent;buscarZona.textContent='Buscando…';
    try{
      const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ar&accept-language=es&q='+encodeURIComponent(q);
      const res=await fetchWithTimeout(url,3500);const arr=await res.json();
      if(!arr.length)throw new Error('No encontré esa zona.');
      map.setView([+arr[0].lat,+arr[0].lon],17);setStatus('Zona encontrada. Ahora hacé clic en el punto exacto del cruce.');
    }catch(e){setStatus(e.message||'No se pudo buscar la zona.')}finally{buscarZona.disabled=false;buscarZona.textContent=old}
  }

  abrirBtn.addEventListener('click',()=>{
    panel.classList.toggle('hidden');
    abrirBtn.textContent=panel.classList.contains('hidden')?'Elegir punto en mapa':'Ocultar mapa';
    if(!panel.classList.contains('hidden'))initMap();
  });
  buscarZona.addEventListener('click',searchZone);
  zonaInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchZone()}});

  usarBtn.addEventListener('click',()=>{
    if(!preview||!preview.ways.length)return;
    active={lat:preview.lat,lon:preview.lon,ways:preview.ways,names:preview.names};
    window.STAR_MAP_GEOMETRY={active:true,...active};
    document.getElementById('quitarUbicacion')?.click();
    setStatus(`Geometría local activada${active.names.length?`: ${active.names.join(' · ')}`:''}.`);
    setEstado('Punto del mapa listo. El próximo análisis usará solo las calles inmediatas a ese cruce.');
    usarBtn.textContent='Punto en uso';
    quitarBtn.classList.remove('hidden');
  });

  quitarBtn.addEventListener('click',()=>{
    active=null;window.STAR_MAP_GEOMETRY=null;usarBtn.textContent='Usar este punto';quitarBtn.classList.add('hidden');setStatus('Geometría del mapa desactivada.');
  });

  document.addEventListener('click',e=>{
    if(e.target!==analizarBtn||!active)return;
    const original=relatoInput.value;
    const names=active.names.join(', ');
    const compact=active.ways.slice(0,8).map(w=>{
      const pts=w.geometry.filter((_,i,a)=>i===0||i===a.length-1||i%Math.max(1,Math.floor(a.length/3))===0).slice(0,5);
      return `${w.nombre} [${w.highway}] ${pts.map(p=>`${p.lat.toFixed(6)},${p.lon.toFixed(6)}`).join(' > ')}`;
    }).join('; ');
    const ctx=`[[GEOMETRÍA LOCAL DEL MAPA PARA EL CROQUIS — NO REPETIR EN EL RELATO CORREGIDO]]\nPunto exacto: ${active.lat.toFixed(6)}, ${active.lon.toFixed(6)}. Vías inmediatas: ${names||'sin nombres disponibles'}. Trazados locales: ${compact}. Usá solo esta geometría cercana para decidir cuántas vías convergen y sus ángulos.\n[[FIN GEOMETRÍA LOCAL]]\n\n`;
    relatoInput.value=ctx+original;
    setTimeout(()=>{relatoInput.value=original},0);
  },true);

  if(typeof window.drawScenario==='function'){
    const oldDraw=window.drawScenario;
    window.drawScenario=function(c){const geo=window.STAR_MAP_GEOMETRY;if(!geo?.active||!geo.ways?.length)return oldDraw(c);drawMappedRoads(geo)};
  } else if(typeof drawScenario==='function'){
    const oldDraw=drawScenario;
    drawScenario=function(c){const geo=window.STAR_MAP_GEOMETRY;if(!geo?.active||!geo.ways?.length)return oldDraw(c);drawMappedRoads(geo)};
  }

  function drawMappedRoads(geo){
    const cx=430,cy=280,lat0=geo.lat*Math.PI/180;
    const local=[];
    geo.ways.forEach(w=>w.geometry.forEach(p=>local.push({x:(p.lon-geo.lon)*111320*Math.cos(lat0),y:(geo.lat-p.lat)*110540})));
    const max=Math.max(18,...local.map(p=>Math.max(Math.abs(p.x),Math.abs(p.y))));
    const scale=Math.min(5.4,Math.max(3.2,245/max));
    const drawnNames=new Set();

    geo.ways.forEach(w=>{
      const mapped=w.geometry.map(p=>({x:cx+(p.lon-geo.lon)*111320*Math.cos(lat0)*scale,y:cy+(geo.lat-p.lat)*110540*scale}));
      if(mapped.length<2)return;
      const d=mapped.map((p,i)=>(i?'L':'M')+` ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
      const width=roadWidth(w.highway);
      const g=el('g',{class:'static-road mapped-road'});
      g.appendChild(el('path',{d,fill:'none',stroke:'#f6f3ed','stroke-width':width+24,'stroke-linecap':'round','stroke-linejoin':'round'}));
      g.appendChild(el('path',{d,fill:'none',stroke:'#dfe5ea','stroke-width':width,'stroke-linecap':'round','stroke-linejoin':'round'}));
      g.appendChild(el('path',{d,fill:'none',stroke:'#fff','stroke-width':2.4,'stroke-dasharray':'12 10','stroke-linecap':'round',opacity:.9}));
      svg.appendChild(g);

      const key=w.nombre.toLowerCase();
      if(w.nombre!=='Calle sin nombre'&&!drawnNames.has(key)){
        drawnNames.add(key);
        const mid=Math.floor(mapped.length/2),m=mapped[mid];
        const a=mapped[Math.max(0,mid-1)],b=mapped[Math.min(mapped.length-1,mid+1)];
        const ang=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
        if(typeof addRoadLabelV10==='function')addRoadLabelV10(w.nombre,m.x+5,m.y-8,ang,'start');
        else addLabel(m.x+5,m.y-8,w.nombre);
      }
    });
    svg.appendChild(el('circle',{cx,cy,r:6,fill:'#fff',stroke:'#0b83c6','stroke-width':2.5}));
  }

  limpiarBtn?.addEventListener('click',()=>{
    requestSeq++;
    if(preview?.layer)preview.layer.remove();
    active=null;preview=null;window.STAR_MAP_GEOMETRY=null;usarBtn.textContent='Usar este punto';usarBtn.disabled=true;quitarBtn.classList.add('hidden');roadList.innerHTML='';if(marker){marker.remove();marker=null}
  });
})();
