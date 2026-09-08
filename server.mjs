import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv();

const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';

const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    relato_corregido: { type: 'string' },
    observaciones: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          tipo: { type: 'string', enum: ['falta_dato', 'revisar', 'tener_en_cuenta'] },
          texto: { type: 'string' }
        }, required: ['tipo', 'texto']
      }
    },
    croquis: {
      type: 'object', additionalProperties: false,
      properties: {
        escenario: { type: 'string', enum: ['interseccion', 'calle_recta', 'ruta', 'rotonda', 'estacionamiento', 'otro', 'indeterminado'] },
        descripcion_breve: { type: 'string' },
        calles: {
          type: 'array', items: {
            type: 'object', additionalProperties: false,
            properties: {
              nombre: { type: 'string' },
              orientacion: { type: 'string', enum: ['horizontal', 'vertical', 'diagonal', 'desconocida'] },
              sentido: { type: 'string' },
              certeza: { type: 'string', enum: ['confirmado', 'inferido', 'desconocido'] }
            }, required: ['nombre','orientacion','sentido','certeza']
          }
        },
        vehiculos: {
          type: 'array', items: {
            type: 'object', additionalProperties: false,
            properties: {
              id: { type: 'string' },
              rol: { type: 'string', enum: ['asegurado','tercero','estacionado','otro'] },
              tipo_vehiculo: { type: 'string', enum: ['auto','moto','bicicleta','camion','colectivo','camioneta','utilitario','otro'] },
              via: { type: 'string' },
              sentido: { type: 'string' },
              maniobra: { type: 'string' },
              posicion_relativa: { type: 'string' },
              certeza_via: { type: 'string', enum: ['confirmado','inferido','desconocido'] },
              certeza_sentido: { type: 'string', enum: ['confirmado','inferido','desconocido'] }
            }, required: ['id','rol','tipo_vehiculo','via','sentido','maniobra','posicion_relativa','certeza_via','certeza_sentido']
          }
        },
        impactos: {
          type: 'array', items: {
            type: 'object', additionalProperties: false,
            properties: {
              orden: { type: 'integer' },
              entre: { type: 'array', items: { type: 'string' } },
              zona_a: { type: 'string' }, zona_b: { type: 'string' }, ubicacion: { type: 'string' }
            }, required: ['orden','entre','zona_a','zona_b','ubicacion']
          }
        },
        trayectorias: {
          type: 'array', items: {
            type: 'object', additionalProperties: false,
            properties: { vehiculo_id: { type: 'string' }, descripcion: { type: 'string' } },
            required: ['vehiculo_id','descripcion']
          }
        },
        elementos: { type: 'array', items: { type: 'string' } },
        semaforos: { type: 'array', items: {
          type: 'object', additionalProperties: false,
          properties: {
            id: { type: 'string' },
            estado: { type: 'string', enum: ['rojo','amarillo','verde','desconocido'] },
            ubicacion: { type: 'string' }
          }, required: ['id','estado','ubicacion']
        }},
        nivel_confianza: { type: 'string', enum: ['alto','medio','bajo'] },
        layout: {
          type: 'object', additionalProperties: false,
          properties: {
            vehiculos: { type: 'array', items: {
              type: 'object', additionalProperties: false,
              properties: {
                id: { type: 'string' },
                x: { type: 'number' },
                y: { type: 'number' },
                angulo: { type: 'number' }
              }, required: ['id','x','y','angulo']
            }},
            impactos: { type: 'array', items: {
              type: 'object', additionalProperties: false,
              properties: {
                orden: { type: 'integer' },
                x: { type: 'number' },
                y: { type: 'number' }
              }, required: ['orden','x','y']
            }},
            semaforos: { type: 'array', items: {
              type: 'object', additionalProperties: false,
              properties: {
                id: { type: 'string' },
                x: { type: 'number' },
                y: { type: 'number' }
              }, required: ['id','x','y']
            }}
          }, required: ['vehiculos','impactos','semaforos']
        }
      }, required: ['escenario','descripcion_breve','calles','vehiculos','impactos','trayectorias','elementos','semaforos','nivel_confianza','layout']
    }
  }, required: ['relato_corregido','observaciones','croquis']
};

const instructions = `
Sos un asistente interno para una oficina de seguros de Argentina. Ayudás a preparar relatos de denuncias de siniestros viales y la información necesaria para un croquis.

REDACTÁ EL RELATO:
- Breve, claro, cronológico, objetivo y listo para pegar en una denuncia.
- Conservá todos los hechos relevantes.
- Corregí redacción, pero no inventes ni completes datos.
- No atribuyas culpabilidad, responsabilidad jurídica ni prioridad de paso.

OBSERVACIONES:
- Escribilas para personal administrativo, con lenguaje cotidiano, simple y corto. Evitá términos técnicos.
- Sé austero: no agregues observaciones innecesarias. Si algo ya se entiende razonablemente del relato, no lo marques como duda.
- Máximo 3 observaciones en total salvo que haya un problema claro.
- Cada observación debe poder entenderse de una sola lectura.
- 'falta_dato': solo para datos realmente necesarios que no puedan inferirse razonablemente y que ayuden a entender o dibujar el choque.
- 'revisar': solo si hay una contradicción real, una ambigüedad importante o un punto que cambia la mecánica del hecho.
- 'tener_en_cuenta': usalo solo si aporta algo concreto y útil. Si no aporta valor real, no lo uses.
- No repitas la misma idea en dos observaciones.
- Si el relato ya identifica la esquina o cruce entre dos vías, no digas que falta la intersección.
- Si del relato se entiende que un vehículo seguía por su vía y el otro ingresaba o cruzaba, no lo marques como maniobra dudosa.

DAÑOS:
- Usalos como evidencia auxiliar para interpretar y contrastar la mecánica.
- Nunca cambies el relato solo para hacerlo coincidir con los daños.
- Si relato y daños parecen incompatibles, marcá 'revisar'.

ESTRUCTURA DEL CROQUIS:
- No inventes calles, sentidos, posiciones ni maniobras.
- Diferenciá certeza: 'confirmado' si lo dice el relato; 'inferido' si se desprende razonablemente de otros datos; 'desconocido' si no se sabe.
- Una inferencia debe ser prudente, pero aprovechá lo que el relato sí deja claro.
- Si el relato dice que un vehículo iba por una calle para ingresar, cruzar o salir a otra, tratá ese cruce como intersección entre ambas vías.
- Si un vehículo circulaba por una ruta/calle y el otro ingresaba o la cruzaba, podés interpretar que el primero seguía por su vía salvo que el relato indique otra cosa.
- Para vehículos: A = asegurado cuando pueda identificarse; B = primer tercero; C = siguiente, etc.
- Si hay un vehículo estacionado, incluilo como vehículo.
- El croquis inicial puede ser aproximado: luego el usuario lo editará manualmente.
- En 'layout', ubicá vehículos e impactos de forma aproximada según la mecánica. x e y van de 0 a 100 dentro del área de dibujo: 0,0 es arriba a la izquierda y 100,100 abajo a la derecha.
- Para el dibujo, la primera vía de 'calles' se muestra horizontal y la segunda vertical. Usá eso para calcular las posiciones del layout.
- El ángulo representa hacia dónde apunta el frente del vehículo: 0 = derecha, 90 = abajo, -90 = arriba, 180/-180 = izquierda.
- El primer punto de impacto NO debe ir automáticamente al centro: ubicalo donde razonablemente ocurrió según el relato. Si no puede saberse, usá el centro de la zona probable.

- Identificá también el tipo de cada vehículo cuando el relato lo indique: auto, moto, bicicleta, camión, colectivo, camioneta, utilitario u otro. Si no lo indica, usá 'auto' solo cuando el texto hable genéricamente de auto/vehículo de manera compatible; si realmente no puede saberse, usá 'otro'.
- Si el relato menciona uno o más semáforos, incluilos en 'semaforos'. Si además dice el color, guardalo; si no, usá 'desconocido'. No agregues semáforos si no aparecen en el relato.
- En 'layout.semaforos', ubicá cada semáforo aproximadamente donde corresponda dentro de la intersección.
`;

const correctionSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    layout: schema.properties.croquis.properties.layout,
    semaforos: schema.properties.croquis.properties.semaforos,
    nota: { type: 'string' }
  },
  required: ['layout','semaforos','nota']
};

const correctionInstructions = `
Vas a revisar SOLO la disposición visual de un croquis de siniestro vial ya editado por una persona.
- El relato original y los daños son la fuente principal para la mecánica.
- La escena manual es una corrección deliberada del usuario y tiene prioridad como punto de partida.
- NO cambies roles, colores ni tipos de vehículo.
- NO elimines vehículos que el usuario dejó en escena.
- NO reescribas calles ni reconstruyas todo el croquis.
- Ajustá únicamente posiciones x/y y ángulos de los vehículos cuando haya una mejora clara, y posiciones de impactos y semáforos.
- Si la escena manual ya es compatible con el relato, mantenela casi igual.
- No atribuyas responsabilidad.
- x/y van de 0 a 100. Ángulo: 0 derecha, 90 abajo, -90 arriba, 180 izquierda.
- Si el relato menciona semáforo, podés incorporarlo o corregir su ubicación. Si no lo menciona y no hay uno manual, no agregues uno.
- En 'nota', explicá en una sola frase qué cambiaste. Si no hacía falta cambiar casi nada, decilo.
`;

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(body);
}
function serveStatic(req,res){
  let reqPath=decodeURIComponent(new URL(req.url,`http://${req.headers.host}`).pathname); if(reqPath==='/')reqPath='/index.html';
  const safePath=path.normalize(reqPath).replace(/^([.][.][/\\])+/,''); const filePath=path.join(publicDir,safePath);
  if(!filePath.startsWith(publicDir)||!fs.existsSync(filePath)||fs.statSync(filePath).isDirectory()){res.writeHead(404);res.end('Not found');return;}
  const ext=path.extname(filePath).toLowerCase(); const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
  res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-store'}); fs.createReadStream(filePath).pipe(res);
}

const server=http.createServer(async(req,res)=>{
  if(req.method==='POST'&&req.url==='/api/corregir-croquis'){
    try{
      let body=''; for await(const chunk of req){body+=chunk;if(body.length>150_000)throw new Error('Solicitud demasiado grande');}
      const data=JSON.parse(body||'{}');
      const relato=String(data.relato||'').trim(); const danos=String(data.danos||'').trim(); const escena=data.escena||{};
      if(!relato)return sendJson(res,400,{error:'Falta el relato original para corregir el croquis.'});
      if(!process.env.OPENAI_API_KEY)return sendJson(res,500,{error:'Falta configurar OPENAI_API_KEY en el archivo .env.'});
      const input=`RELATO ORIGINAL:
${relato}

DAÑOS DECLARADOS:
${danos||'No informados.'}

CROQUIS ACOMODADO POR EL USUARIO:
${JSON.stringify(escena,null,2)}`;
      const apiRes=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,store:false,reasoning:{effort:'low'},instructions:correctionInstructions,input,text:{format:{type:'json_schema',name:'correccion_croquis_v07',strict:true,schema:correctionSchema}}})});
      const apiJson=await apiRes.json(); if(!apiRes.ok){console.error(apiJson);return sendJson(res,apiRes.status,{error:apiJson?.error?.message||'Error al consultar la IA.'});}
      let outputText=apiJson.output_text; if(!outputText&&Array.isArray(apiJson.output)){for(const item of apiJson.output){if(item.type==='message'&&Array.isArray(item.content)){const tx=item.content.find(c=>c.type==='output_text');if(tx?.text){outputText=tx.text;break;}}}}
      if(!outputText)return sendJson(res,502,{error:'La IA no devolvió una corrección interpretable.'});
      return sendJson(res,200,JSON.parse(outputText));
    }catch(err){console.error(err);return sendJson(res,500,{error:err.message||'Error interno.'});}
  }
  if(req.method==='POST'&&req.url==='/api/analizar'){
    try{
      let body=''; for await(const chunk of req){body+=chunk;if(body.length>100_000)throw new Error('Solicitud demasiado grande');}
      const data=JSON.parse(body||'{}'); const relato=String(data.relato||'').trim(); const danos=String(data.danos||'').trim();
      if(!relato)return sendJson(res,400,{error:'Ingresá un relato del siniestro.'});
      if(!process.env.OPENAI_API_KEY)return sendJson(res,500,{error:'Falta configurar OPENAI_API_KEY en el archivo .env.'});
      const input=`RELATO ORIGINAL:\n${relato}\n\nDAÑOS DECLARADOS:\n${danos||'No informados.'}`;
      const apiRes=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,store:false,reasoning:{effort:'low'},instructions,input,text:{format:{type:'json_schema',name:'analisis_siniestro_v07',strict:true,schema}}})});
      const apiJson=await apiRes.json(); if(!apiRes.ok){console.error(apiJson);return sendJson(res,apiRes.status,{error:apiJson?.error?.message||'Error al consultar la IA.'});}
      let outputText=apiJson.output_text; if(!outputText&&Array.isArray(apiJson.output)){for(const item of apiJson.output){if(item.type==='message'&&Array.isArray(item.content)){const t=item.content.find(c=>c.type==='output_text');if(t?.text){outputText=t.text;break;}}}}
      if(!outputText)return sendJson(res,502,{error:'La IA no devolvió un resultado interpretable.'});
      return sendJson(res,200,JSON.parse(outputText));
    }catch(err){console.error(err);return sendJson(res,500,{error:err.message||'Error interno.'});}
  }
  if(req.method==='GET')return serveStatic(req,res); res.writeHead(405);res.end('Method not allowed');
});
server.listen(PORT,'0.0.0.0',()=>{console.log(`Asistente de siniestros v0.7: http://localhost:${PORT}`);console.log(`Modelo: ${MODEL}`);});
