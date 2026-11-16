"""Aplicación local, sin dependencias externas: python servidor.py"""
import argparse
from dataclasses import asdict
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import math
from pathlib import Path
import threading
from urllib.parse import urlsplit
from urllib.request import urlopen
import webbrowser

from modelo_celdas import Config, simular

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / 'web'


def numero(datos, clave, defecto, minimo, maximo):
    valor = datos.get(clave, defecto)
    if isinstance(valor, bool) or not isinstance(valor, (float, int)):
        raise ValueError(f'{clave}: se requiere un número.')
    if not math.isfinite(valor) or not minimo <= valor <= maximo:
        raise ValueError(f'{clave}: debe estar entre {minimo} y {maximo}.')
    return float(valor)


def ejecutar_ensayo(datos):
    if not isinstance(datos, dict):
        raise ValueError('Se requiere un objeto JSON de configuración.')
    duracion = numero(datos, 'duracion', 900, 180, 1800)
    if not duracion.is_integer():
        raise ValueError('La duración debe expresarse en segundos enteros.')
    tau_c = numero(datos, 'tau_c', 8, 7, 60)
    base = numero(datos, 'caudal_base', 45, 20, 65)
    amplitud = numero(datos, 'amplitud', 10, -20, 20)
    inicio = numero(datos, 'inicio', 120, 0, duracion - 1)
    ancho = numero(datos, 'ancho', 300, 1, 1800)
    cambio_sp = numero(datos, 'cambio_sp', 60, 0, duracion - 1)
    sp = datos.get('consignas', [30, 30, 30])
    if not isinstance(sp, list) or len(sp) != 3:
        raise ValueError('Se requieren tres consignas.')
    sp = [numero({'sp': x}, 'sp', 30, 15, 38) for x in sp]
    kff = datos.get('kff', [1, 1, 1])
    if not isinstance(kff, list) or len(kff) != 3:
        raise ValueError('Se requieren tres ganancias feedforward.')
    kff = tuple(numero({'kff': x}, 'kff', 1, 0, 1) for x in kff)
    tipo = datos.get('perturbacion', 'pulso')
    if tipo not in ('pulso', 'escalon', 'ninguna'):
        raise ValueError('Perturbación desconocida.')
    c = Config(tau_c_s=tau_c, caudal_nominal_lpm=base, kff=kff)

    def alimentacion(t):
        activo = t >= inicio and (tipo == 'escalon' or t < inicio + ancho)
        return base + amplitud if tipo != 'ninguna' and activo else base

    def consigna(t):
        return sp if t >= cambio_sp else (30, 30, 30)

    estrategias = []
    for ff in (False, True):
        r = simular(feedforward=ff, duracion_s=duracion, config=c,
                    alimentacion=alimentacion, consigna=consigna)
        completos = r.pop('datos')
        inicial = dict(t_s=0, niveles_cm=[30]*3,
                       consignas_cm=list(consigna(0)), mandos_lpm=[base]*3,
                       salidas_lpm=[base]*3, alimentacion_lpm=base,
                       deposito_l=100, iae_cm_s=[0]*3)
        # El motor integra a 0.1 s; la interfaz recibe muestras a 1 s.
        r['datos'] = [inicial] + [d for i, d in enumerate(completos) if (i+1) % 10 == 0]
        r['max_desviacion_cm'] = [max(abs(d['niveles_cm'][i] - d['consignas_cm'][i])
                                         for d in completos) for i in range(3)]
        r['tiempo_limite_bomba_s'] = [sum(c.dt_s for d in completos
                                         if d['mandos_lpm'][i] <= 1e-9 or
                                         d['mandos_lpm'][i] >= c.caudal_max_lpm-1e-9)
                                      for i in range(3)]
        estrategias.append(r)
    eventos = []
    if sp != [30, 30, 30]:
        eventos.append(dict(t=cambio_sp, nombre='Cambio de consignas'))
    if tipo != 'ninguna' and amplitud:
        eventos.append(dict(t=inicio, nombre='Cambio de alimentación'))
        if tipo == 'pulso' and inicio + ancho < duracion:
            eventos.append(dict(t=inicio+ancho, nombre='Retorno de alimentación'))
    return dict(configuracion=asdict(c), escenario=dict(
        duracion=duracion, consignas=sp, cambio_sp=cambio_sp, caudal_base=base,
        amplitud=amplitud, inicio=inicio, ancho=ancho, perturbacion=tipo, tau_c=tau_c,
        kff=list(kff)), eventos=sorted(eventos, key=lambda x: x['t']),
        estrategias=estrategias, version_modelo='hidraulico-1.0')


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC), **kwargs)

    def json_response(self, contenido, status=200):
        raw = json.dumps(contenido, ensure_ascii=False, allow_nan=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        ruta = urlsplit(self.path).path
        if ruta == '/api/health':
            return self.json_response(dict(ok=True, app='celda-lab', motor='Python', version='1.0'))
        if ruta == '/api/modelo':
            return self.json_response(dict(configuracion=asdict(Config()),
                                           parametros_pi=Config().parametros_pi()))
        if ruta == '/modelo.md':
            raw = (ROOT / 'MODELO_MATEMATICO.md').read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Content-Length', str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            return
        if ruta not in ('/', '/index.html', '/app.js', '/styles.css', '/favicon.svg'):
            return self.send_error(404)
        super().do_GET()

    def do_POST(self):
        if self.path != '/api/simular':
            return self.json_response(dict(error='Ruta no encontrada.'), 404)
        # Solo atiende la interfaz del mismo equipo/origen.
        origin = self.headers.get('Origin')
        if origin and origin not in (f'http://127.0.0.1:{self.server.server_port}',
                                     f'http://localhost:{self.server.server_port}'):
            return self.json_response(dict(error='Origen no permitido.'), 403)
        try:
            longitud = int(self.headers.get('Content-Length', '0'))
            if not 0 < longitud <= 16384:
                raise ValueError('Tamaño de solicitud inválido.')
            datos = json.loads(self.rfile.read(longitud))
            resultado = ejecutar_ensayo(datos)
        except (ValueError, TypeError, OverflowError) as exc:
            return self.json_response(dict(error=str(exc)), 400)
        except RuntimeError as exc:
            return self.json_response(dict(error=str(exc),
                ayuda='Reduce la perturbación o acerca las consignas a 30 cm.'), 422)
        self.json_response(resultado)


def main():
    parser = argparse.ArgumentParser(description='Laboratorio local de control de nivel')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--abrir', action='store_true', help='Abrir la interfaz en el navegador')
    args = parser.parse_args()
    url = f'http://127.0.0.1:{args.port}'
    if args.abrir:
        try:
            with urlopen(url + '/api/health', timeout=1) as response:
                if json.load(response).get('app') == 'celda-lab':
                    webbrowser.open(url)
                    print('La simulación ya estaba abierta. Se reutiliza el servidor.')
                    return
        except (OSError, ValueError):
            pass
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    except OSError as exc:
        raise SystemExit(f'No se pudo usar el puerto {args.port}. Prueba --port 8766.\n{exc}')
    print(f'CELDA LAB disponible en http://127.0.0.1:{args.port}', flush=True)
    print('Mantén esta ventana abierta. Ctrl+C para detener.', flush=True)
    if args.abrir:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
