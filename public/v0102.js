// v0.10.2: selección visual del punto exacto y uso de geometría real de calles.
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

  let map=null,marker=null,preview=null,active=null;
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

  async function overpass(lat,lon){
    const q=`[out:json][timeout:15];way(around:125,${lat},${lon})[highway];out tags geom;`;
    const urls=[
      'https://overpass-api.de/api/interpreter?data='+encodeURIComponent(q),
      'https://overpass.kumi.systems/api/interpreter?data='+encodeURIComponent(q)
    ];
    let lastErr=null;
    for(const url of urls){
      try{
        const res=await fetch(url,{headers:{Accept:'application/json'}});
        if(!res.ok)throw new Error('Servicio de geometría no disponible');
        const data=await res.json();
        return (data.elements||[]).filter(w=>Array.isArray(w.geometry)&&w.geometry.length>1).map(w=>({
          id:w.id,
          nombre:(w.tags?.name||w.tags?.ref||'').trim()||'Calle sin nombre',
          highway:w.tags?.highway||'road',
          oneway:w.tags?.oneway||'',
          geometry:w.geometry.map(p=>({lat:+p.lat,lon:+p.lon}))
        }));
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
    if(marker)marker.setLatLng([lat,lon]);else marker=L.marker([lat,lon]).addTo(map);
    if(preview)preview.remove();
    usarBtn.disabled=true;
    setStatus('Leyendo las calles alrededor del punto…');roadList.innerHTML='';
    try{
      const ways=await overpass(lat,lon);
      const names=uniqueNames(ways);
      preview={lat,lon,ways,names};
      const group=L.featureGroup();
      ways.forEach(w=>L.polyline(w.geometry.map(p=>[p.lat,p.lon]),{weight:Math.max(3,roadWidth(w.highway)/6),opacity:.65}).addTo(group));
      group.addTo(map);preview.layer=group;
      if(group.getLayers().length) map.fitBounds(group.getBounds().pad(.2),{maxZoom:18});
      roadList.innerHTML=names.length?names.map(n=>`<span class="map-road-chip">${esc(n)}</span>`).join(''):'<span class="location-meta">No encontré nombres, pero sí se guardará la geometría.</span>';
      setStatus(`Punto marcado. Detecté ${ways.length} tramos viales${names.length?` y ${names.length} nombres de calle`:''}.`);
      usarBtn.disabled=ways.length===0;
    }catch(e){
      preview={lat,lon,ways:[],names:[]};
      setStatus('Marqué el punto, pero no pude leer las calles. Probá de nuevo o mové apenas el marcador.');
      usarBtn.disabled=true;
    }
  }

  async function searchZone(){
    const q=zonaInput.value.trim();if(!q)return;
    buscarZona.disabled=true;const old=buscarZona.textContent;buscarZona.textContent='Buscando…';
    try{
      const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ar&accept-language=es&q='+encodeURIComponent(q);
      const res=await fetch(url,{headers:{Accept:'application/json'}});const arr=await res.json();
      if(!arr.length)throw new Error('No encontré esa zona.');
      map.setView([+arr[0].lat,+arr[0].lon],16);setStatus('Zona encontrada. Ahora hacé clic en el punto exacto del cruce.');
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
    setStatus(`Geometría activada para el croquis${active.names.length?`: ${active.names.join(' · ')}`:''}.`);
    setEstado('Punto del mapa listo. El próximo análisis usará la geometría real de esas calles.');
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
    const compact=active.ways.slice(0,12).map(w=>{
      const pts=w.geometry.filter((_,i,a)=>i===0||i===a.length-1||i%Math.max(1,Math.floor(a.length/4))===0).slice(0,6);
      return `${w.nombre} [${w.highway}] trazado ${pts.map(p=>`${p.lat.toFixed(6)},${p.lon.toFixed(6)}`).join(' > ')}`;
    }).join('; ');
    const ctx=`[[GEOMETRÍA REAL DEL MAPA PARA EL CROQUIS — NO REPETIR EN EL RELATO CORREGIDO]]\nPunto exacto elegido por el usuario: ${active.lat.toFixed(6)}, ${active.lon.toFixed(6)}. Vías detectadas: ${names||'sin nombres disponibles'}. Trazados reales cercanos: ${compact}. Usá esta geometría para decidir cuántas vías convergen y sus ángulos.\n[[FIN GEOMETRÍA REAL]]\n\n`;
    relatoInput.value=ctx+original;
    setTimeout(()=>{relatoInput.value=original},0);
  },true);

  // Sobrescribe únicamente la base vial: si hay un punto de mapa activo, dibuja sus trazados reales.
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
    geo.ways.forEach((w,idx)=>{
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
    active=null;preview=null;window.STAR_MAP_GEOMETRY=null;usarBtn.textContent='Usar este punto';usarBtn.disabled=true;quitarBtn.classList.add('hidden');roadList.innerHTML='';if(marker){marker.remove();marker=null}if(preview?.layer)preview.layer.remove();
  });
})();
