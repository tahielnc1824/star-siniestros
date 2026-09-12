// v0.10.3: selección visual optimizada; consulta rápida, cancelable y con fallback.
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

  let map=null,marker=null,preview=null,active=null,currentLoadId=0,currentAbort=[];
  const geometryCache=new Map();
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

  function cancelCurrentLoads(){
    currentAbort.forEach(c=>{try{c.abort()}catch{}});
    currentAbort=[];
  }

  function cacheKey(lat,lon){return `${lat.toFixed(4)},${lon.toFixed(4)}`}

  async function fetchWithTimeout(url,ms=4500){
    const controller=new AbortController();
    currentAbort.push(controller);
    const timer=setTimeout(()=>controller.abort(),ms);
    try{
      const res=await fetch(url,{headers:{Accept:'application/json'},signal:controller.signal});
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      return await res.json();
    }finally{clearTimeout(timer)}
  }

  function normalizeWays(data){
    return (data.elements||[])
      .filter(w=>Array.isArray(w.geometry)&&w.geometry.length>1)
      .map(w=>({
        id:w.id,
        nombre:(w.tags?.name||w.tags?.ref||'').trim()||'Calle sin nombre',
        highway:w.tags?.highway||'road',
        oneway:w.tags?.oneway||'',
        geometry:w.geometry.map(p=>({lat:+p.lat,lon:+p.lon}))
      }));
  }

  async function overpass(lat,lon){
    const key=cacheKey(lat,lon);
    if(geometryCache.has(key))return geometryCache.get(key);

    // Radio más chico y sólo vías relevantes/nominadas cuando están disponibles.
    const q=`[out:json][timeout:5];(way(around:75,${lat},${lon})[highway][name];way(around:75,${lat},${lon})[highway][ref];);out tags geom;`;
    const enc=encodeURIComponent(q);
    const urls=[
      'https://overpass-api.de/api/interpreter?data='+enc,
      'https://overpass.kumi.systems/api/interpreter?data='+enc
    ];

    // Consultamos dos mirrors en paralelo y usamos el primero que responda bien.
    let data;
    try{
      data=await Promise.any(urls.map(u=>fetchWithTimeout(u,4500)));
    }catch{
      // Fallback más amplio, pero con límite corto. No dejamos la interfaz colgada.
      const q2=`[out:json][timeout:4];way(around:60,${lat},${lon})[highway];out tags geom;`;
      const enc2=encodeURIComponent(q2);
      const fallbacks=[
        'https://overpass-api.de/api/interpreter?data='+enc2,
        'https://overpass.kumi.systems/api/interpreter?data='+enc2
      ];
      data=await Promise.any(fallbacks.map(u=>fetchWithTimeout(u,3500)));
    }

    const ways=normalizeWays(data);
    geometryCache.set(key,ways);
    if(geometryCache.size>24){const first=geometryCache.keys().next().value;geometryCache.delete(first)}
    return ways;
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
    const loadId=++currentLoadId;
    cancelCurrentLoads();
    if(marker)marker.setLatLng([lat,lon]);else marker=L.marker([lat,lon]).addTo(map);
    if(preview?.layer)preview.layer.remove();

    // Permitimos usar el punto enseguida; la geometría se completa apenas responde.
    preview={lat,lon,ways:[],names:[],loading:true};
    usarBtn.disabled=false;
    usarBtn.textContent='Usar este punto';
    setStatus('Punto marcado. Leyendo las calles… (máximo unos segundos)');
    roadList.innerHTML='<span class="location-meta">Podés usar el punto ya mismo; si la geometría termina de cargar, se agregará automáticamente.</span>';

    try{
      const ways=await overpass(lat,lon);
      if(loadId!==currentLoadId)return;
      const names=uniqueNames(ways);
      const group=L.featureGroup();
      ways.forEach(w=>L.polyline(w.geometry.map(p=>[p.lat,p.lon]),{weight:Math.max(3,roadWidth(w.highway)/6),opacity:.65}).addTo(group));
      group.addTo(map);
      preview={lat,lon,ways,names,layer:group,loading:false};
      roadList.innerHTML=names.length?names.map(n=>`<span class="map-road-chip">${esc(n)}</span>`).join(''):'<span class="location-meta">No encontré nombres claros, pero el punto quedó listo.</span>';
      setStatus(ways.length?`Listo. Detecté ${ways.length} tramos viales${names.length?` y ${names.length} calles`:''}.`:'Punto listo. No encontré geometría suficiente, pero podés usarlo como referencia.');

      // Si el usuario ya había activado ese punto, actualizamos la geometría sin pedir otro clic.
      if(active&&Math.abs(active.lat-lat)<1e-7&&Math.abs(active.lon-lon)<1e-7){
        active={lat,lon,ways,names};
        window.STAR_MAP_GEOMETRY={active:true,...active};
        setEstado(ways.length?'La geometría del mapa terminó de cargar y ya quedó actualizada.':'El punto sigue activo como referencia.');
      }
    }catch(e){
      if(loadId!==currentLoadId)return;
      preview={lat,lon,ways:[],names:[],loading:false};
      setStatus('Punto listo. El servicio de calles no respondió rápido, así que seguimos sin esperar.');
      roadList.innerHTML='<span class="location-meta">Se usará la ubicación exacta. Podés volver a tocar el punto si querés reintentar la geometría.</span>';
      usarBtn.disabled=false;
    }
  }

  async function searchZone(){
    const q=zonaInput.value.trim();if(!q)return;
    buscarZona.disabled=true;const old=buscarZona.textContent;buscarZona.textContent='Buscando…';
    try{
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),5000);
      const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ar&accept-language=es&q='+encodeURIComponent(q);
      const res=await fetch(url,{headers:{Accept:'application/json'},signal:controller.signal});clearTimeout(timer);
      const arr=await res.json();
      if(!arr.length)throw new Error('No encontré esa zona.');
      map.setView([+arr[0].lat,+arr[0].lon],16);setStatus('Zona encontrada. Ahora hacé clic en el punto exacto del cruce.');
    }catch(e){setStatus(e.name==='AbortError'?'La búsqueda tardó demasiado. Probá con una zona más general.':(e.message||'No se pudo buscar la zona.'))}finally{buscarZona.disabled=false;buscarZona.textContent=old}
  }

  abrirBtn.addEventListener('click',()=>{
    panel.classList.toggle('hidden');
    abrirBtn.textContent=panel.classList.contains('hidden')?'Elegir punto en mapa':'Ocultar mapa';
    if(!panel.classList.contains('hidden'))initMap();
  });
  buscarZona.addEventListener('click',searchZone);
  zonaInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchZone()}});

  usarBtn.addEventListener('click',()=>{
    if(!preview)return;
    active={lat:preview.lat,lon:preview.lon,ways:preview.ways||[],names:preview.names||[]};
    window.STAR_MAP_GEOMETRY={active:true,...active};
    document.getElementById('quitarUbicacion')?.click();
    setStatus(active.ways.length?`Geometría activada${active.names.length?`: ${active.names.join(' · ')}`:''}.`:'Punto activado. Si termina de cargar la geometría, se incorporará sola.');
    setEstado(active.ways.length?'Punto del mapa listo. El próximo análisis usará la geometría real de esas calles.':'Punto del mapa listo. No vamos a esperar al servicio de geometría.');
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
    const compact=(active.ways||[]).slice(0,10).map(w=>{
      const pts=w.geometry.filter((_,i,a)=>i===0||i===a.length-1||i%Math.max(1,Math.floor(a.length/4))===0).slice(0,5);
      return `${w.nombre} [${w.highway}] trazado ${pts.map(p=>`${p.lat.toFixed(6)},${p.lon.toFixed(6)}`).join(' > ')}`;
    }).join('; ');
    const geoText=compact?` Vías detectadas: ${names||'sin nombres disponibles'}. Trazados reales cercanos: ${compact}. Usá esta geometría para decidir cuántas vías convergen y sus ángulos.`:' Usá este punto exacto como referencia espacial. Si el relato describe un cruce complejo, no fuerces una intersección en cruz si no está claro.';
    const ctx=`[[GEOMETRÍA REAL DEL MAPA PARA EL CROQUIS — NO REPETIR EN EL RELATO CORREGIDO]]\nPunto exacto elegido por el usuario: ${active.lat.toFixed(6)}, ${active.lon.toFixed(6)}.${geoText}\n[[FIN GEOMETRÍA REAL]]\n\n`;
    relatoInput.value=ctx+original;
    setTimeout(()=>{relatoInput.value=original},0);
  },true);

  if(typeof window.drawScenario==='function'){
    const oldDraw=window.drawScenario;
    window.drawScenario=function(c){
      const geo=window.STAR_MAP_GEOMETRY;
      if(!geo?.active||!geo.ways?.length)return oldDraw(c);
      drawMappedRoads(geo);
    };
  } else if(typeof drawScenario==='function'){
    const oldDraw=drawScenario;
    drawScenario=function(c){const geo=window.STAR_MAP_GEOMETRY;if(!geo?.active||!geo.ways?.length)return oldDraw(c);drawMappedRoads(geo)};
  }

  function drawMappedRoads(geo){
    const cx=430,cy=280;
    const lat0=geo.lat*Math.PI/180;
    const pts=[];
    geo.ways.forEach(w=>w.geometry.forEach(p=>{
      const x=(p.lon-geo.lon)*111320*Math.cos(lat0),y=(geo.lat-p.lat)*110540;pts.push({x,y});
    }));
    const max=Math.max(45,...pts.map(p=>Math.max(Math.abs(p.x),Math.abs(p.y))));
    const scale=Math.min(3.1,Math.max(1.35,310/max));
    const drawnNames=new Set();
    geo.ways.forEach(w=>{
      const mapped=w.geometry.map(p=>({x:cx+(p.lon-geo.lon)*111320*Math.cos(lat0)*scale,y:cy+(geo.lat-p.lat)*110540*scale})).filter(p=>p.x>-120&&p.x<DRAW_W+120&&p.y>-120&&p.y<SVG_H+120);
      if(mapped.length<2)return;
      const d=mapped.map((p,i)=>(i?'L':'M')+` ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
      const width=roadWidth(w.highway);
      const g=el('g',{class:'static-road mapped-road'});
      g.appendChild(el('path',{d,fill:'none',stroke:'#f6f3ed','stroke-width':width+28,'stroke-linecap':'round','stroke-linejoin':'round'}));
      g.appendChild(el('path',{d,fill:'none',stroke:'#dfe5ea','stroke-width':width,'stroke-linecap':'round','stroke-linejoin':'round'}));
      g.appendChild(el('path',{d,fill:'none',stroke:'#fff','stroke-width':2.5,'stroke-dasharray':'14 11','stroke-linecap':'round',opacity:.9}));
      svg.appendChild(g);
      const key=w.nombre.toLowerCase();
      if(w.nombre!=='Calle sin nombre'&&!drawnNames.has(key)){
        drawnNames.add(key);const m=mapped[Math.floor(mapped.length/2)];
        const a=mapped[Math.max(0,Math.floor(mapped.length/2)-1)],b=mapped[Math.min(mapped.length-1,Math.floor(mapped.length/2)+1)];
        const ang=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
        if(typeof addRoadLabelV10==='function')addRoadLabelV10(w.nombre,m.x+6,m.y-10,ang,'start');
        else addLabel(m.x+6,m.y-10,w.nombre);
      }
    });
    const ring=el('circle',{cx,cy,r:7,fill:'#fff',stroke:'#0b83c6','stroke-width':3});svg.appendChild(ring);
  }

  limpiarBtn?.addEventListener('click',()=>{
    currentLoadId++;cancelCurrentLoads();
    if(preview?.layer)preview.layer.remove();
    active=null;preview=null;window.STAR_MAP_GEOMETRY=null;usarBtn.textContent='Usar este punto';usarBtn.disabled=true;quitarBtn.classList.add('hidden');roadList.innerHTML='';if(marker){marker.remove();marker=null}
  });
})();
