// v0.10.7: validación geométrica por zonas de daño y lado de impacto.
(() => {
  const relatoEl=document.getElementById('relato');
  const danosEl=document.getElementById('danos');

  const normalize=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

  function damageZone(){
    const t=normalize(`${relatoEl?.value||''} ${danosEl?.value||''}`);
    const side=t.includes('derech')?'derecho':t.includes('izquierd')?'izquierdo':'';
    const longitudinal=/traser|posterior|paragolpes trasero/.test(t)?'trasero':/delanter|frontal|paragolpes delantero/.test(t)?'delantero':'';
    if(!side&&!longitudinal)return null;
    return {side,longitudinal};
  }

  function vehLayout(c,id){return (c.layout?.vehiculos||[]).find(v=>String(v.id).toUpperCase()===id)}
  function vehicleMeta(c,id){return (c.vehiculos||[]).find(v=>String(v.id).toUpperCase()===id)}
  function streetForVehicle(c,v){
    const name=normalize(v?.via);
    if(!name)return null;
    return (c.calles||[]).find(s=>{
      const n=normalize(s.nombre);
      return n&&(name.includes(n)||n.includes(name));
    })||null;
  }

  function vectors(angleDeg){
    const a=(Number(angleDeg)||0)*Math.PI/180;
    const f={x:Math.cos(a),y:Math.sin(a)};
    const r={x:-Math.sin(a),y:Math.cos(a)};
    return {f,r};
  }

  function updateReference(c,via,angle){
    const refs=c.referencias||[];
    const target=refs.find(r=>r.tipo==='sentido'&&normalize(r.via)&&normalize(via)&&(normalize(r.via).includes(normalize(via))||normalize(via).includes(normalize(r.via))));
    if(!target)return;
    const a=((Number(angle)||0)%360+360)%360;
    if(a>=315||a<45){target.borde='derecho';target.x=94;target.y=50;}
    else if(a>=45&&a<135){target.borde='inferior';target.x=50;target.y=94;}
    else if(a>=135&&a<225){target.borde='izquierdo';target.x=6;target.y=50;}
    else {target.borde='superior';target.x=50;target.y=8;}
  }

  function fixTwoVehicleCrossing(c){
    const zone=damageZone();
    if(!zone)return;
    const A=vehLayout(c,'A'),B=vehLayout(c,'B');
    const metaB=vehicleMeta(c,'B');
    if(!A||!B||!metaB)return;

    const {f,r}=vectors(A.angulo);
    // La zona de contacto sobre A funciona como restricción espacial.
    const lateral=zone.side==='derecho'?1:zone.side==='izquierdo'?-1:0;
    const long=zone.longitudinal==='trasero'?-1:zone.longitudinal==='delantero'?1:0;
    if(!lateral&&!long)return;

    // Punto de impacto: cerca del sector declarado del vehículo A, no en el centro genérico del cruce.
    const imp=(c.layout?.impactos||[])[0];
    if(imp){
      imp.x=clamp(A.x + f.x*long*4.4 + r.x*lateral*3.2,5,95);
      imp.y=clamp(A.y + f.y*long*4.4 + r.y*lateral*3.2,5,95);
    }

    // Para el tercero, el lado (izq./der.) pesa más que delantero/trasero al elegir desde qué lado se aproxima.
    // Solo corrige cruces donde su vía es claramente horizontal o vertical; evita forzar diagonales o escenas complejas.
    const street=streetForVehicle(c,metaB);
    const orient=street?.orientacion||'';
    const desired={x:A.x+r.x*lateral*18,y:A.y+r.y*lateral*18};

    if(orient==='vertical'){
      B.x=clamp(A.x,8,92);
      B.y=clamp(desired.y,8,92);
      B.angulo=B.y>A.y?-90:90; // desde su posición, apunta hacia el cruce/A
      updateReference(c,metaB.via,B.angulo);
    }else if(orient==='horizontal'){
      B.x=clamp(desired.x,8,92);
      B.y=clamp(A.y,8,92);
      B.angulo=B.x>A.x?180:0;
      updateReference(c,metaB.via,B.angulo);
    }
  }

  function enrichInternalPrompt(){
    return `[[VALIDACIÓN GEOMÉTRICA OBLIGATORIA — NO COPIAR AL RELATO CORREGIDO]]\n- Antes de cerrar el layout, fijá la orientación y el sentido del asegurado A.\n- Interpretá frente/trasera/izquierda/derecha SIEMPRE desde la perspectiva del conductor del vehículo, no desde la hoja.\n- Las zonas de daño declaradas son una restricción geométrica fuerte para el croquis. Si A va hacia la derecha: su lado derecho queda abajo, su lado izquierdo arriba, su parte trasera a la izquierda y su frente a la derecha. Rotá esta relación según el ángulo real de A.\n- Si el tercero B circula por una vía transversal y hay dos sentidos geométricamente posibles, elegí el que permita llegar al lado dañado de A. No elijas el sentido al azar.\n- Ejemplo de control: A circula hacia la derecha y recibe daño trasero derecho. En una calle vertical, B debe aproximarse desde abajo hacia arriba para resultar compatible con ese sector; colocarlo arriba y bajando sería incoherente.\n- El punto de impacto debe quedar próximo a la zona dañada declarada (delantero/trasero + izquierdo/derecho), no automáticamente en el centro del cruce.\n- Después de ubicar todos los vehículos, hacé una comprobación final: trayectoria de cada tercero + punto de impacto + daños de A deben ser espacialmente compatibles. Si no lo son, corregí posición/ángulo antes de responder.\n- Una referencia \"hacia DESTINO\" debe quedar en el borde hacia el que apunta el vehículo asociado; nunca en el borde opuesto.\n[[FIN VALIDACIÓN GEOMÉTRICA]]\n\n`;
  }

  // Refuerza el análisis enviado a la IA sin contaminar el relato corregido.
  const analizar=document.getElementById('analizar');
  document.addEventListener('click',e=>{
    if(e.target!==analizar||!relatoEl)return;
    const original=relatoEl.value;
    relatoEl.value=enrichInternalPrompt()+original;
    setTimeout(()=>{relatoEl.value=original;},0);
  },true);

  // Segunda barrera: corrige layouts simples de dos vehículos si la IA dejó un tercero del lado incompatible con el daño.
  if(typeof window.generateSketch==='function'){
    const old=window.generateSketch;
    window.generateSketch=function(c){
      try{fixTwoVehicleCrossing(c);}catch(err){console.warn('Validación geométrica v0.10.7:',err)}
      return old(c);
    };
  }
})();
