// v0.10.6: sin mapa. Mejora la interpretación vial usando el relato y una aclaración opcional del cruce.
(() => {
  const relato=document.getElementById('relato');
  const ayuda=document.getElementById('croquisAyuda');
  const analizar=document.getElementById('analizar');
  const limpiar=document.getElementById('limpiar');
  if(!relato||!analizar) return;

  function buildRoadContext(){
    const aclaracion=(ayuda?.value||'').trim();
    return `[[INSTRUCCIONES INTERNAS PARA INTERPRETAR LAS CALLES DEL CROQUIS — NO COPIAR ESTE BLOQUE AL RELATO CORREGIDO]]
- Primero identificá todas las vías con nombre propio mencionadas en el relato. Cada nombre distinto representa una vía distinta salvo que el texto diga expresamente que son la misma.
- Si el relato dice "al llegar al cruce con X", X debe aparecer como una vía del croquis aunque luego se use "dicha calle" o "dicha avenida".
- Si después aparece otra vía con nombre distinto, incorporala como una tercera vía cuando intervenga en el hecho. Con tres vías relevantes, priorizá un cruce múltiple simple y legible.
- No conviertas palabras como "diagonal", "avenida", "ruta" o "calle" en parte obligatoria del nombre si funcionan como tipo de vía. Ejemplo: "Diagonal Callao" puede representarse como vía Callao con orientación diagonal.
- Resolvé expresiones como "dicha avenida", "esa calle", "la misma vía" solo cuando el antecedente sea realmente claro. Si hay ambigüedad, no inventes: mantené la vía como desconocida o marcá para revisar.
- Usá los laterales de impacto como ayuda espacial. Un impacto al lateral izquierdo y otro al lateral derecho del asegurado pueden indicar aproximaciones desde lados opuestos o diferentes, siempre sin inventar sentidos no declarados.
- El croquis debe ser esquemático: representá solo las vías que intervienen en el hecho y tramos cortos alrededor del punto de impacto. No agregues ramales decorativos.
- Si el asegurado declara "en dirección a DESTINO", mantené esa referencia como "hacia DESTINO" cerca del borde correspondiente.
${aclaracion ? `- ACLARACIÓN MANUAL DEL USUARIO SOBRE LA FORMA DEL CRUCE: ${aclaracion}` : ''}
[[FIN INSTRUCCIONES INTERNAS]]\n\n`;
  }

  document.addEventListener('click',e=>{
    if(e.target!==analizar) return;
    const original=relato.value;
    relato.value=buildRoadContext()+original;
    setTimeout(()=>{relato.value=original;},0);
  },true);

  limpiar?.addEventListener('click',()=>{if(ayuda) ayuda.value='';});
})();
