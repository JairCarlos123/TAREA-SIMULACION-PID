# Publicar CELDA LAB en Render

La aplicación ya contiene su página en `web/index.html`. El servidor publica
ese archivo en la dirección principal `/`. No necesitas moverlo a la raíz ni
crear otra copia del HTML.

## Preparar el repositorio

Sube estos archivos y carpetas a un repositorio Git conectado con Render:

```text
app.py
servidor.py
modelo_celdas.py
requirements.txt
render.yaml
MODELO_MATEMATICO.md
web/
  index.html
  styles.css
  app.js
  favicon.svg
```

`app.py`, `requirements.txt` y `render.yaml` deben quedar en la raíz del
repositorio. Si extrajiste el ZIP, sube el contenido de la carpeta CELDA_LAB,
no el ZIP como un único archivo. Puedes incluir los documentos y el BAT,
aunque Render no utiliza el BAT.

## Configuración manual

1. En Render elige **New > Web Service** y conecta el repositorio.
2. En **Language**, selecciona **Python 3**. La captura con `go build` y `./app`
   corresponde a Go y debe cambiarse.
3. Configura los campos así:

| Campo | Valor |
|---|---|
| Root Directory | Vacío si app.py está en la raíz del repositorio |
| Build Command | `python -m pip install -r requirements.txt && python -m gunicorn --version` |
| Start Command | `python -m gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --threads 2 --timeout 120` |
| Health Check Path | `/api/health` |

Si mantuviste todos los archivos dentro de una subcarpeta del repositorio,
Root Directory debe indicar esa subcarpeta, por ejemplo `CELDA_LAB`.

4. Selecciona el plan que usarás y crea el servicio.
5. Cuando el despliegue esté activo, abre la URL que devuelve Render.

Si el servicio ya existía y configuraste estos campos manualmente, actualízalos
también en Settings de Render. Subir `render.yaml` no cambia automáticamente los
comandos de un servicio creado sin Blueprint.

Si aparece `gunicorn: command not found` después de una instalación correcta,
usa los comandos anteriores: ejecutan pip y Gunicorn mediante el intérprete
Python, sin depender de que el ejecutable `gunicorn` esté en PATH. La comprobación
`python -m gunicorn --version` hace que un problema de instalación se detecte en
la construcción. Después ejecuta **Manual Deploy > Clear build cache & deploy**.

También se incluye `render.yaml` para crear el servicio mediante **New >
Blueprint**, con el mismo comando de construcción e inicio. El archivo propone
el plan Free; revisa en Render su disponibilidad y condiciones al crearlo.

## Cómo funciona alojada

```text
Navegador del visitante
        |
        v
Render: Gunicorn -> app.py -> motor Python
        |
        +-> web/index.html, estilos y JavaScript
        +-> /api/simular: resultados de las ecuaciones
```

El navegador usa rutas relativas a la URL de Render. No se conecta al
localhost del visitante. El servidor acepta solicitudes de la misma dirección,
también cuando Render termina la conexión HTTPS en su proxy.

Los visitantes solo necesitan el navegador: no instalan Python ni ejecutan
el BAT. La modalidad local con el BAT sigue disponible.

## Verificación y límites

Se comprobó la entrada WSGI mediante solicitudes locales a la aplicación,
incluidos recursos HTML/CSS/JS, cálculo, dominio HTTPS, validación y errores.
Gunicorn se ejecuta en el entorno Linux de Render; esta entrega se preparó
desde Windows. No se ha desplegado en una cuenta de Render ni se ha obtenido
una URL pública como parte de esta preparación.

Referencias oficiales:

- https://render.com/docs/web-services
- https://render.com/docs/blueprint-spec
- https://pypi.org/project/gunicorn/
