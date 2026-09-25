// v0.12.2: selector progresivo de tipo de siniestro + análisis opcional de póliza.
(() => {
  const $ = id => document.getElementById(id);
  const tipo=$('tipoSiniestro'), form=$('formSiniestro'), subtipoWrap=$('subtipoWrap'), subtipo=$('subtipoSiniestro');
  const relato=$('relato'), danos=$('danos'), choqueFields=$('camposChoque'), resultado=$('resultado');
  const croquisInterpretacion=$('croquisInterpretacionCard'), croquisEditor=$('croquisEditorCard');
  const estado=$('estado'), limpiar=$('limpiar');
  const polizaPdf=$('polizaPdf'), analizarPoliza=$('analizarPoliza'), estadoPoliza=$('estadoPoliza'), resultadoPoliza=$('resultadoPoliza');
  const alertasEl=$('alertasCobertura');

  if(!tipo||!form) return;
  let lastData=null;

  const defs={
    choque:{label:'Choque / accidente',placeholder:'Ej.: Circulaba por calle Belgrano y al llegar a la esquina...',danos:'Ej.: guardabarros delantero derecho, paragolpes delantero...'},
    robo:{label:'Robo',placeholder:'Contá dónde estaba el vehículo, qué ocurrió y qué fue sustraído.',danos:'Indicá qué fue robado o dañado, si corresponde.',subs:[['','Sin especificar'],['total','Robo total'],['parcial','Robo parcial']]},
    incendio:{label:'Incendio',placeholder:'Contá cómo se detectó el incendio y qué ocurrió.',danos:'Indicá las partes afectadas o si el daño fue general.',subs:[['','Sin especificar'],['total','Incendio total'],['parcial','Incendio parcial']]},
    climatico:{label:'Daños climáticos',placeholder:'Contá qué fenómeno ocurrió y cómo afectó al vehículo.',danos:'Indicá las partes dañadas.',subs:[['','Sin especificar'],['granizo','Granizo'],['inundacion','Inundación / agua'],['arbol_viento','Árbol / ramas / viento'],['otro_climatico','Otro fenómeno climático']]},
    cristales:{label:'Cristales / cerraduras',placeholder:'Contá qué ocurrió y cuándo se detectó el daño.',danos:'Indicá el cristal, cerradura o elemento afectado.',subs:[['','Sin especificar'],['parabrisas','Parabrisas'],['luneta','Luneta'],['lateral','Cristal lateral'],['cerradura','Cerradura'],['otro','Otro']]},
    vandalismo:{label:'Daños parciales / vandalismo',placeholder:'Contá cómo se produjeron o detectaron los daños.',danos:'Indicá las partes afectadas.'},
    otro:{label:'Otro',placeholder:'Contá brevemente qué ocurrió.',danos:'Indicá los daños o bienes afectados, si corresponde.'}
  };

  function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function autoGrow(el){if(!el)return;el.style.height='auto';el.style.height=Math.min(el.scrollHeight,330)+'px';}

  function syncType(){
    const cfg=defs[tipo.value];
    if(!cfg){
      form.classList.add('hidden');
      resultado?.classList.add('hidden');
      return;
    }
    form.classList.remove('hidden');
    choqueFields?.classList.toggle('hidden',tipo.value!=='choque');
    relato.placeholder=cfg.placeholder;
    danos.placeholder=cfg.danos;
    if(cfg.subs){
      subtipo.innerHTML=cfg.subs.map(([v,l])=>'<option value="'+esc(v)+'">'+esc(l)+'</option>').join('');
      subtipoWrap.classList.remove('hidden');
    } else {
      subtipo.innerHTML='';
      subtipoWrap.classList.add('hidden');
    }
    if(tipo.value!=='choque'){
      croquisInterpretacion?.classList.add('hidden');
      croquisEditor?.classList.add('hidden');
    }
    resultado?.classList.add('hidden');
    resultadoPoliza?.classList.add('hidden');
    estadoPoliza.textContent='';
    relato.focus();
  }
  tipo.addEventListener('change',syncType);

  // Reemplaza el botón para quitar el listener vial original sin tocar app.js.
  const oldBtn=$('analizar');
  const btn=oldBtn.cloneNode(true);
  oldBtn.replaceWith(btn);

  function renderAlertas(items){
    if(!alertasEl)return;
    const card=alertasEl.closest('.coverage-card');
    const arr=Array.isArray(items)?items:[];
    if(!arr.length){
      alertasEl.innerHTML='';
      card?.classList.add('hidden');
      return;
    }
    card?.classList.remove('hidden');
    const order={alta:0,revisar_poliza:1,informativa:2};
    arr.sort((a,b)=>(order[a.nivel]??9)-(order[b.nivel]??9));
    alertasEl.innerHTML=arr.map(a=>{
      const level=a.nivel||'revisar_poliza';
      const title=level==='alta'?'Revisar antes de denunciar':level==='informativa'?'Dato a tener en cuenta':'Revisar póliza';
      return '<div class="coverage-alert '+esc(level)+'">'
        +'<div class="coverage-alert-head"><strong>'+esc(title)+'</strong><span>'+esc(a.categoria||'Revisión')+'</span></div>'
        +(a.frase_detectada?'<div class="coverage-quote">Detectado: “'+esc(a.frase_detectada)+'”</div>':'')
        +'<div class="coverage-reason">'+esc(a.motivo||'')+'</div>'
        +(a.verificar?'<div class="coverage-check"><b>Verificar:</b> '+esc(a.verificar)+'</div>':'')
        +'</div>';
    }).join('');
  }

  function renderGeneral(data){
    resultado.classList.remove('hidden');
    $('relatoCorregido').value=data.relato_corregido||'';
    autoGrow($('relatoCorregido'));
    const groups=[['falta_dato','Faltan datos'],['revisar','Revisar'],['tener_en_cuenta','A tener en cuenta']];
    $('observaciones').innerHTML=groups.map(([t,title])=>{
      const arr=(data.observaciones||[]).filter(o=>o.tipo===t);
      return arr.length?'<div class="obs-group"><div class="obs-group-title">'+title+'</div>'+arr.map(o=>'<div class="obs '+t+'">'+esc(o.texto)+'</div>').join('')+'</div>':'';
    }).join('')||'<p class="empty">No hay nada importante para revisar.</p>';
    renderAlertas(data.alertas_cobertura||[]);
    croquisInterpretacion?.classList.add('hidden');
    croquisEditor?.classList.add('hidden');
    resultado.scrollIntoView({behavior:'smooth',block:'start'});
  }

  btn.addEventListener('click',async()=>{
    if(!tipo.value){tipo.focus();return}
    if(!relato.value.trim()){relato.focus();estado.textContent='Ingresá un relato.';return}
    btn.disabled=true;btn.textContent='Analizando…';estado.textContent='Interpretando el siniestro…';
    try{
      const res=await fetch('/api/analizar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        relato:relato.value,
        danos:danos.value,
        tipoSiniestro:tipo.value,
        subtipoSiniestro:subtipoWrap.classList.contains('hidden')?'':subtipo.value
      })});
      const data=await res.json();
      if(!res.ok) throw new Error(data.error||'No se pudo analizar.');
      lastData=data;
      if(tipo.value==='choque'){
        croquisInterpretacion?.classList.remove('hidden');
        croquisEditor?.classList.remove('hidden');
        if(typeof window.render==='function') window.render(data);
        renderAlertas(data.alertas_cobertura||[]);
      }else renderGeneral(data);
      estado.textContent='Análisis listo.';
    }catch(e){estado.textContent=e.message}
    finally{btn.disabled=false;btn.textContent='Analizar siniestro'}
  });

  $('generarCroquis')?.addEventListener('click',()=>{if(lastData?.croquis&&typeof window.generateSketch==='function')window.generateSketch(lastData.croquis)});

  function fileToBase64(file){
    return new Promise((resolve,reject)=>{
      const fr=new FileReader();
      fr.onload=()=>resolve(String(fr.result).split(',')[1]||'');
      fr.onerror=()=>reject(new Error('No se pudo leer el PDF.'));
      fr.readAsDataURL(file);
    });
  }

  analizarPoliza?.addEventListener('click',async()=>{
    const file=polizaPdf?.files?.[0];
    if(!file){estadoPoliza.textContent='Seleccioná una póliza en PDF.';return}
    if(file.type && file.type!=='application/pdf'){estadoPoliza.textContent='El archivo debe ser PDF.';return}
    if(file.size>10*1024*1024){estadoPoliza.textContent='El PDF es demasiado grande. Máximo 10 MB.';return}
    analizarPoliza.disabled=true;analizarPoliza.textContent='Analizando…';estadoPoliza.textContent='Leyendo la póliza y comparando la cobertura…';
    try{
      const base64=await fileToBase64(file);
      const res=await fetch('/api/analizar-poliza',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        tipoSiniestro:tipo.value,
        subtipoSiniestro:subtipoWrap.classList.contains('hidden')?'':subtipo.value,
        relato:relato.value,
        danos:danos.value,
        filename:file.name,
        fileData:base64
      })});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'No se pudo analizar la póliza.');
      const labels={cubierto:'CUBIERTO',no_cubierto:'NO CUBIERTO',revisar:'REVISAR'};
      const estadoResultado=data.estado||'revisar';
      const condiciones=Array.isArray(data.condiciones)?data.condiciones.filter(Boolean):[];
      resultadoPoliza.innerHTML='<div class="policy-simple-result">'
        +'<div class="policy-simple-head"><strong>'+esc(data.resumen||'Resultado del análisis')+'</strong><span class="policy-status '+esc(estadoResultado)+'">'+esc(labels[estadoResultado]||'REVISAR')+'</span></div>'
        +(data.motivo?'<p>'+esc(data.motivo)+'</p>':'')
        +(condiciones.length?'<div class="policy-conditions"><strong>A tener en cuenta:</strong><ul>'+condiciones.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div>':'')
        +(data.referencia?'<small>Referencia: '+esc(data.referencia)+'</small>':'')
        +'</div>';
      resultadoPoliza.classList.remove('hidden');
      estadoPoliza.textContent='';
    }catch(e){estadoPoliza.textContent=e.message}
    finally{analizarPoliza.disabled=false;analizarPoliza.textContent='Analizar póliza'}
  });

  limpiar?.addEventListener('click',()=>{
    tipo.value='';
    form.classList.add('hidden');
    subtipoWrap.classList.add('hidden');
    croquisInterpretacion?.classList.remove('hidden');
    croquisEditor?.classList.remove('hidden');
    if(polizaPdf)polizaPdf.value='';
    resultadoPoliza?.classList.add('hidden');
    estadoPoliza.textContent='';
    lastData=null;
  });
})();
