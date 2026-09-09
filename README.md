# STAR · Asistente de Siniestros

Herramienta web interna de STAR Gestiones y Servicios para ayudar a redactar relatos de siniestros y generar un croquis editable.

## Producción

URL: https://star-siniestros.onrender.com/

El servicio se despliega automáticamente desde la rama `main` de este repositorio mediante Render.

## Variables de entorno

- `OPENAI_API_KEY`: clave de OpenAI API.
- `OPENAI_MODEL`: modelo utilizado por la herramienta.
- `PORT`: provisto automáticamente por Render.

No subir archivos `.env` al repositorio.

## Desarrollo

La aplicación usa Node.js y no requiere base de datos. Para ejecutarla localmente:

```bash
npm install
npm start
```

Luego abrir `http://localhost:3000`.
