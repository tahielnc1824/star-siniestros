// v0.11.1: perfil opcional de uso + alertas de posible cobertura. Mantiene la validación geométrica sin alterar el relato.
(() => {
  const relatoEl=document.getElementById('relato');
  const danosEl=document.getElementById('danos');
  const ayudaEl=document.getElementById('croquisAyuda');
  const usoEl=document.getElementById('perfilUso');
    const otroUsoEl=document.getElementById('perfilUsoOtro');
  const alertasEl=document.getElementById('alertasCobertura');
  const limpiar=document.getElementById('limpiar');
  if(!relatoEl) return;

  const normalize=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // Agrega datos opcionales al pedido sin tocar el texto visible del relato.
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function(input,init={}){
    const url=typeof input==='string'?input:(input?.url||'');
    if(url==='/api/analizar' && init?.body){
      try{
        const payload=JSON.parse(init.body);
        payload.croquisAyuda=(ayudaEl?.value||'').trim();
        payload.perfilPoliza={
          uso: usoEl?.value||'sin_especificar',
          otro_uso:(otroUsoEl?.value||'').trim()
        };
        init={...init,body:JSON.stringify(payload)};
      }catch{}
    }
    const res=await nativeFetch(input,init);
    if(url==='/api/analizar'){
      const ct=(res.headers.get('content-type')||'').toLowerCase();
      if(!ct.includes('application/json')){
        const text=await res.clone().text().catch(()=> '');
        const msg=text.includes('<!DOCTYPE')||text.includes('<html')
          ? 'El servidor devolvió una página en lugar del análisis. Esperá unos segundos y volvé a intentar.'
          : 'El servidor devolvió una respuesta no válida. Volvé a intentar.';
        return new Response(JSON.stringify({error:msg}),{status:res.ok?502:res.status,headers:{'Content-Type':'application/json'}});
      }
    }
    return res;
  };

  function renderAlertas(items){
    if(!alertasEl) return;
    const arr=Array.isArray(items)?items:[];
    if(!arr.length){
      alertasEl.innerHTML='<p class="empty">No se detectaron datos del relato que requieran una revisión especial de cobertura.</p>';
      return;
    }
    const order={alta:0,revisar_poliza:1,informativa:2};
    arr.sort((a,b)=>(order[a.nivel]??9)-(order[b.nivel]??9));
    alertasEl.innerHTML=arr.map(a=>{
      const level=a.nivel||'revisar_poliza';
      const title=level==='alta'?'Revisar antes de denunciar':level==='informativa'?'Dato a tener en cuenta':'Revisar póliza';
      return '<div class="coverage-alert '+esc(level)+'">'
        +'<div class="coverage-alert-head"><strong>'+esc(title)+'</strong><span>'+esc(a.categoria||'Cobertura')+'</span></div>'
        +(a.frase_detectada?'<div class="coverage-quote">Detectado: “'+esc(a.frase_detectada)+'”</div>':'')
        +'<div class="coverage-reason">'+esc(a.motivo||'')+'</div>'
        +(a.verificar?'<div class="coverage-check"><b>Verificar:</b> '+esc(a.verificar)+'</div>':'')
        +'</div>';
    }).join('');
  }

  // Extiende el render normal sin modificar la lógica existente.
  if(typeof window.render==='function'){
    const oldRender=window.render;
    window.render=function(data){
      oldRender(data);
      renderAlertas(data?.alertas_cobertura||[]);
    };
  }

  if(usoEl&&otroUsoEl){
    const syncOtro=()=>{
      otroUsoEl.classList.toggle('hidden',usoEl.value!=='otro');
      if(usoEl.value!=='otro') otroUsoEl.value='';
    };
    usoEl.addEventListener('change',syncOtro); syncOtro();
  }

  // Validación geométrica conservada de v0.10.8.
  function damageZone(){
    const t=normalize(`${relatoEl.value||''} ${danosEl?.value||''}`);
    const side=t.includes('derech')?'derecho':t.includes('izquierd')?'izquierdo':'';
    const longitudinal=/traser|posterior|paragolpes trasero/.test(t)?'trasero':/delanter|frontal|paragolpes delantero/.test(t)?'delantero':'';
    if(!side&&!longitudinal)return null;
    return {side,longitudinal};
  }
  function vehLayout(c,id){return (c.layout?.vehiculos||[]).find(v=>String(v.id).toUpperCase()===id)}
  function vehicleMeta(c,id){return (c.vehiculos||[]).find(v=>String(v.id).toUpperCase()===id)}
  function streetForVehicle(c,v){
    const name=normalize(v?.via); if(!name)return null;
    return (c.calles||[]).find(s=>{const n=normalize(s.nombre);return n&&(name.includes(n)||n.includes(name));})||null;
  }
  function vectors(angleDeg){
    const a=(Number(angleDeg)||0)*Math.PI/180;
    return {f:{x:Math.cos(a),y:Math.sin(a)},r:{x:-Math.sin(a),y:Math.cos(a)}};
  }
  function updateReference(c,via,angle){
    const target=(c.referencias||[]).find(r=>r.tipo==='sentido'&&normalize(r.via)&&normalize(via)&&(normalize(r.via).includes(normalize(via))||normalize(via).includes(normalize(r.via))));
    if(!target)return;
    const a=((Number(angle)||0)%360+360)%360;
    if(a>=315||a<45){target.borde='derecho';target.x=94;target.y=50;}
    else if(a>=45&&a<135){target.borde='inferior';target.x=50;target.y=94;}
    else if(a>=135&&a<225){target.borde='izquierdo';target.x=6;target.y=50;}
    else {target.borde='superior';target.x=50;target.y=8;}
  }
  function fixTwoVehicleCrossing(c){
    const zone=damageZone(); if(!zone)return;
    const A=vehLayout(c,'A'),B=vehLayout(c,'B'),metaB=vehicleMeta(c,'B');
    if(!A||!B||!metaB)return;
    const {f,r}=vectors(A.angulo);
    const lateral=zone.side==='derecho'?1:zone.side==='izquierdo'?-1:0;
    const longitudinal=zone.longitudinal==='trasero'?-1:zone.longitudinal==='delantero'?1:0;
    if(!lateral&&!longitudinal)return;
    const imp=(c.layout?.impactos||[])[0];
    if(imp){
      imp.x=clamp(A.x+f.x*longitudinal*4.6+r.x*lateral*3.4,5,95);
      imp.y=clamp(A.y+f.y*longitudinal*4.6+r.y*lateral*3.4,5,95);
    }
    const street=streetForVehicle(c,metaB);
    const orient=street?.orientacion||'';
    const desired={x:A.x+r.x*lateral*18,y:A.y+r.y*lateral*18};
    if(orient==='vertical'){
      B.x=clamp(A.x,8,92); B.y=clamp(desired.y,8,92); B.angulo=B.y>A.y?-90:90; updateReference(c,metaB.via,B.angulo);
    }else if(orient==='horizontal'){
      B.x=clamp(desired.x,8,92); B.y=clamp(A.y,8,92); B.angulo=B.x>A.x?180:0; updateReference(c,metaB.via,B.angulo);
    }
  }
  if(typeof window.generateSketch==='function'){
    const old=window.generateSketch;
    window.generateSketch=function(c){
      try{fixTwoVehicleCrossing(c);}catch(err){console.warn('Validación geométrica v0.11:',err)}
      return old(c);
    };
  }

  limpiar?.addEventListener('click',()=>{
    if(ayudaEl) ayudaEl.value='';
    if(usoEl) usoEl.value='sin_especificar';
    if(otroUsoEl){otroUsoEl.value='';otroUsoEl.classList.add('hidden');}
    if(alertasEl) alertasEl.innerHTML='';
  });
})();