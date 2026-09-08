ASISTENTE DE SINIESTROS v0.7

1) Copiá tu archivo .env de la versión anterior dentro de esta carpeta.
   Si no tenés uno, copiá .env.example como .env y pegá tu OPENAI_API_KEY.
2) Ejecutá iniciar.bat para usarlo localmente.
3) Abrí http://localhost:3000 (normalmente se abre automáticamente).

NOVEDADES v0.7
- Flechas y textos ahora pueden rotarse al seleccionarlos con botones de giro de 15°.
- Los vehículos pueden ser: auto, moto, bicicleta, camión, colectivo, camioneta, utilitario u otro.
- El tipo de vehículo puede venir interpretado por IA y también cambiarse manualmente.
- Se pueden agregar semáforos manualmente.
- Si el relato menciona semáforos, la IA puede incorporarlos automáticamente al croquis.
- “Corregir croquis con IA” ahora trabaja de forma más conservadora: corrige posiciones/ángulos, impactos y semáforos sin rehacer roles, colores o tipos de vehículo.
- Mantiene la estética STAR, el glosario, editor, PNG y el modo oculto.

IMPORTANTE
- No hay base de datos ni historial.
- Al cerrar/refrescar se pierde lo cargado.
- La IA no debe usarse para determinar responsabilidad del siniestro.
- El croquis automático es una base aproximada: revisalo antes de usarlo.
