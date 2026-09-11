// v0.10.1: buscador opcional de ubicación y contexto geográfico para el croquis.
(() => {
  const q = document.getElementById('ubicacionQuery');
  const buscar = document.getElementById('buscarUbicacion');
  const resultados = document.getElementById('ubicacionResultados');
  const seleccion = document.getElementById('ubicacionSeleccionada');
  const analizarBtn = document.getElementById('analizar');
  const relatoInput = document.getElementById('relato');
  const estadoEl = document.getElementById('estado');
  if (!q || !buscar || !resultados || !seleccion || !analizarBtn || !relatoInput) return;

  let ubicacion = null;

  const escapeHtml = (s='') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function setEstado(txt){ if(estadoEl) estadoEl.textContent = txt; }

  function limpiarResultados(){
    resultados.innerHTML = '';
    resultados.classList.add('hidden');
  }

  function renderSeleccion(){
    if(!ubicacion){
      seleccion.innerHTML='';
      seleccion.classList.add('hidden');
      return;
    }
    seleccion.classList.remove('hidden');
    const vias = (ubicacion.vias || []).map(v => `${v.nombre} (${v.orientacion})`).join(' · ');
    seleccion.innerHTML = `<strong>Ubicación seleccionada</strong><div><span class="location-badge">Mapa</span>${escapeHtml(ubicacion.display_name || '')}</div>${vias ? `<div class="location-meta">Vías cercanas: ${escapeHtml(vias)}</div>` : '<div class="location-meta">No pude obtener geometría vial adicional; igual se usará la ubicación.</div>'}<div class="location-actions" style="margin-top:8px"><button id="quitarUbicacion" class="ghost small">Quitar</button></div>`;
    document.getElementById('quitarUbicacion')?.addEventListener('click',()=>{ubicacion=null;renderSeleccion();setEstado('Ubicación de referencia quitada.')});
  }

  function bearingDeg(a,b){
    const lat1=a.lat*Math.PI/180, lat2=b.lat*Math.PI/180;
    const dLon=(b.lon-a.lon)*Math.PI/180;
    const y=Math.sin(dLon)*Math.cos(lat2);
    const x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);
    let d=Math.atan2(y,x)*180/Math.PI;
    d=(d+360)%360;
    return d;
  }

  function orientationFromBearing(b){
    const a=((b%180)+180)%180;
    if(a < 22.5 || a >= 157.5) return 'norte-sur';
    if(a >= 67.5 && a < 112.5) return 'este-oeste';
    return a < 90 ? 'diagonal NE-SO' : 'diagonal NO-SE';
  }

  async function cargarGeometria(lat,lon){
    try{
      const query=`[out:json][timeout:10];way(around:90,${lat},${lon})[highway];out tags geom;`;
      const url='https://overpass-api.de/api/interpreter?data='+encodeURIComponent(query);
      const res=await fetch(url,{headers:{'Accept':'application/json'}});
      if(!res.ok) return [];
      const data=await res.json();
      const seen=new Set(), vias=[];
      for(const w of (data.elements||[])){
        const name=(w.tags?.name||w.tags?.ref||'').trim();
        if(!name || seen.has(name.toLowerCase()) || !Array.isArray(w.geometry) || w.geometry.length<2) continue;
        const a=w.geometry[0], b=w.geometry[w.geometry.length-1];
        const br=bearingDeg({lat:+a.lat,lon:+a.lon},{lat:+b.lat,lon:+b.lon});
        vias.push({nombre:name,orientacion:orientationFromBearing(br),angulo:Math.round(br)});
        seen.add(name.toLowerCase());
        if(vias.length>=6) break;
      }
      return vias;
    }catch{ return []; }
  }

  async function buscarUbicacion(){
    const text=q.value.trim();
    if(!text){q.focus();setEstado('Escribí una dirección, esquina o referencia para buscar.');return;}
    const old=buscar.textContent; buscar.disabled=true; buscar.textContent='Buscando…'; setEstado('Buscando ubicación en el mapa…');
    try{
      const url='https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=ar&accept-language=es&q='+encodeURIComponent(text);
      const res=await fetch(url,{headers:{'Accept':'application/json'}});
      if(!res.ok) throw new Error('No se pudo consultar el mapa.');
      const arr=await res.json();
      resultados.classList.remove('hidden');
      if(!arr.length){resultados.innerHTML='<div class="location-empty">No encontré coincidencias. Probá agregando localidad o partido.</div>';setEstado('No se encontraron coincidencias.');return;}
      resultados.innerHTML=arr.map((r,i)=>`<div class="location-option"><div class="location-copy"><div class="location-title">${escapeHtml(r.name || r.display_name?.split(',')[0] || 'Resultado')}</div><div class="location-meta">${escapeHtml(r.display_name || '')}</div></div><button class="primary small" data-map-result="${i}">Usar</button></div>`).join('');
      resultados.querySelectorAll('[data-map-result]').forEach(btn=>btn.addEventListener('click',async()=>{
        const r=arr[Number(btn.dataset.mapResult)];
        btn.disabled=true;btn.textContent='Cargando…';setEstado('Leyendo la geometría de las calles cercanas…');
        const vias=await cargarGeometria(+r.lat,+r.lon);
        ubicacion={query:text,display_name:r.display_name||'',lat:r.lat,lon:r.lon,type:r.type||r.category||'ubicación',address:r.address||{},vias};
        renderSeleccion();limpiarResultados();setEstado('Ubicación lista. Se usará como referencia al analizar el siniestro.');
      }));
      setEstado('Elegí la coincidencia correcta.');
    }catch(e){
      resultados.classList.remove('hidden');
      resultados.innerHTML=`<div class="location-empty">${escapeHtml(e.message||'No se pudo buscar la ubicación.')}</div>`;
      setEstado(e.message||'No se pudo buscar la ubicación.');
    }finally{buscar.disabled=false;buscar.textContent=old;}
  }

  buscar.addEventListener('click',buscarUbicacion);
  q.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();buscarUbicacion();}});

  // El app principal ya arma el request de análisis. En fase de captura agregamos
  // temporalmente contexto cartográfico al relato, y lo restauramos inmediatamente.
  document.addEventListener('click',e=>{
    if(e.target !== analizarBtn || !ubicacion) return;
    const original=relatoInput.value;
    const vias=(ubicacion.vias||[]).map(v=>`${v.nombre}: ${v.orientacion}, rumbo aprox. ${v.angulo}°`).join('; ');
    const contexto=`[[CONTEXTO DE MAPA PARA EL CROQUIS — NO REPETIR ESTA NOTA EN EL RELATO CORREGIDO]]\nUbicación seleccionada por el usuario: ${ubicacion.display_name}. Coordenadas: ${ubicacion.lat}, ${ubicacion.lon}.${vias ? ` Geometría vial cercana: ${vias}.` : ''}\n[[FIN CONTEXTO DE MAPA]]\n\n`;
    relatoInput.value=contexto+original;
    setTimeout(()=>{relatoInput.value=original;},0);
  },true);

  const limpiarBtn=document.getElementById('limpiar');
  limpiarBtn?.addEventListener('click',()=>{q.value='';ubicacion=null;renderSeleccion();limpiarResultados();});
})();
