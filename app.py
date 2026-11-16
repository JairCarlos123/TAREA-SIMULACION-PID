"""Entrada WSGI para Render/Gunicorn. Reutiliza el mismo motor que el BAT."""
from dataclasses import asdict
import json

from servidor import ROOT, STATIC, Config, ejecutar_ensayo


def app(environ, start_response):
    method = environ.get('REQUEST_METHOD', 'GET')
    path = environ.get('PATH_INFO', '/')

    def respond(body, status='200 OK', content_type='application/json; charset=utf-8'):
        if not isinstance(body, bytes):
            body = json.dumps(body, ensure_ascii=False, allow_nan=False).encode('utf-8')
        start_response(status, [('Content-Type', content_type),
                                ('Content-Length', str(len(body))),
                                ('Cache-Control', 'no-store'),
                                ('X-Content-Type-Options', 'nosniff')])
        return [b'' if method == 'HEAD' else body]

    if path == '/api/simular':
        if method != 'POST':
            return respond({'error': 'Usa POST para calcular un ensayo.'}, '405 Method Not Allowed')
        # El HTML y la API se alojan en el mismo dominio. Compatible con HTTPS
        # detrás del proxy de Render, sin habilitar llamadas de otros sitios.
        origin = environ.get('HTTP_ORIGIN')
        host = environ.get('HTTP_HOST', '')
        if origin:
            if origin not in (
                'http://' + host, 'https://' + host
            ):
                return respond({'error': 'Origen no permitido.'}, '403 Forbidden')
        try:
            length = int(environ.get('CONTENT_LENGTH') or 0)
            if not 0 < length <= 16384:
                raise ValueError('Tamaño de solicitud inválido.')
            data = json.loads(environ['wsgi.input'].read(length))
            return respond(ejecutar_ensayo(data))
        except (ValueError, TypeError, OverflowError) as exc:
            return respond({'error': str(exc)}, '400 Bad Request')
        except RuntimeError as exc:
            return respond({'error': str(exc),
                            'ayuda': 'Reduce la perturbación o acerca las consignas a 30 cm.'},
                           '422 Unprocessable Entity')

    if method not in ('GET', 'HEAD'):
        return respond({'error': 'Método no permitido.'}, '405 Method Not Allowed')
    if path == '/api/health':
        return respond({'ok': True, 'app': 'celda-lab', 'motor': 'Python', 'version': '1.0'})
    if path == '/api/modelo':
        return respond({'configuracion': asdict(Config()),
                        'parametros_pi': Config().parametros_pi()})

    resources = {
        '/': (STATIC / 'index.html', 'text/html; charset=utf-8'),
        '/index.html': (STATIC / 'index.html', 'text/html; charset=utf-8'),
        '/app.js': (STATIC / 'app.js', 'text/javascript; charset=utf-8'),
        '/styles.css': (STATIC / 'styles.css', 'text/css; charset=utf-8'),
        '/favicon.svg': (STATIC / 'favicon.svg', 'image/svg+xml'),
        '/modelo.md': (ROOT / 'MODELO_MATEMATICO.md', 'text/plain; charset=utf-8'),
    }
    if path not in resources:
        return respond({'error': 'Recurso no encontrado.'}, '404 Not Found')
    file, content_type = resources[path]
    return respond(file.read_bytes(), content_type=content_type)
