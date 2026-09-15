// v0.10.8: contexto interno oculto + validación geométrica por daños sin alterar el relato visible.
(() => {
  const relatoEl=document.getElementById('relato');
  const danosEl=document.getElementById('danos');
  const ayudaEl=document.getElementById('croquisAyuda');
  if(!relatoEl) return;

  const normalize=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

  function buildHiddenContext(){
    const aclaracion=(ayudaEl?.value||'').trim();
    return `[[CONTEXTO INTERNO PARA INTERPRETAR EL CROQUIS — NO COPIAR NI MENCIONAR EN EL RELATO CORREGIDO]]\n- Primero identificá todas las vías con nombre propio mencionadas en el relato. Cada nombre distinto representa una vía distinta salvo que el texto diga expresamente que son la misma.\n- Si el relato dice \"al llegar al cruce con X\", X debe aparecer como una vía del croquis.\n- Resolvé \"dicha avenida\", \"esa calle\" o \"la misma vía\" solo si el antecedente es inequívoco.\n- Representá únicamente las vías que intervienen en el siniestro y tramos cortos alrededor del impacto.\n- Si hay tres vías relevantes, usá un cruce múltiple simple y legible; no inventes ramales.\n- Si el asegurado declara \"hacia DESTINO\", mostrale la referencia como \"hacia DESTINO\" en el borde correspondiente, separada del nombre de la calle.\n\nVALIDACIÓN GEOMÉTRICA POR DAÑOS:\n- Antes de ubicar al tercero, fijá orientación y sentido del asegurado A.\n- Interpretá frente, trasera, izquierda y derecha SIEMPRE desde la perspectiva del conductor de A.\n- Las zonas de daño son una restricción geométrica fuerte para decidir desde qué lado puede aproximarse el tercero y dónde ubicar el punto de impacto.\n- Si A apunta hacia la derecha: frente=derecha, trasera=izquierda, lado izquierdo=arriba y lado derecho=abajo. Rotá mentalmente esa relación según el ángulo de A.\n- Si B circula por una vía transversal y existen dos sentidos posibles, elegí el que sea compatible con el sector dañado de A.\n- Ejemplo de control: A hacia la derecha + daño trasero derecho => en una transversal vertical, B debe aproximarse desde abajo hacia arriba; ubicarlo arriba bajando sería incoherente.\n- El punto de impacto debe quedar próximo al sector dañado (delantero/trasero + izquierdo/derecho), no automáticamente en el centro de la intersección.\n- Antes de responder, comprobá que trayectoria del tercero, punto de impacto y daño declarado sean espacialmente compatibles.\n${aclaracion?`- ACLARACIÓN MANUAL DEL USUARIO SOBRE LA FORMA DEL CRUCE: ${aclaracion}\n`:''}[[FIN CONTEXTO INTERNO]]\n\n`;
  }

  // Intercepta solamente el análisis: agrega el contexto al pedido enviado al servidor,
  // pero nunca modifica el textarea que ve el usuario.
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function(input,init={}){
    const url=typeof input==='string'?input:(input?.url||'');
    if(url==='/api/analizar' && init?.body){
      try{
        const payload=JSON.parse(init.body);
        payload.relato=buildHiddenContext()+String(payload.relato||'');
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
      B.x=clamp(A.x,8,92); B.y=clamp(desired.y,8,92);
      B.angulo=B.y>A.y?-90:90;
      updateReference(c,metaB.via,B.angulo);
    }else if(orient==='horizontal'){
      B.x=clamp(desired.x,8,92); B.y=clamp(A.y,8,92);
      B.angulo=B.x>A.x?180:0;
      updateReference(c,metaB.via,B.angulo);
    }
  }

  if(typeof window.generateSketch==='function'){
    const old=window.generateSketch;
    window.generateSketch=function(c){
      try{fixTwoVehicleCrossing(c);}catch(err){console.warn('Validación geométrica v0.10.8:',err)}
      return old(c);
    };
  }
})();
