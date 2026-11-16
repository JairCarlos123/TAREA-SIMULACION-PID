"""Banco de tres celdas: balance conservativo y control PI, unidades explícitas.

Ejecutar: python modelo_celdas.py
Solo usa la biblioteca estándar. Ver MODELO_MATEMATICO.md.
"""
from collections import deque
from dataclasses import dataclass
import csv
import json
import math
from pathlib import Path


@dataclass(frozen=True)
class Config:
    area_cm2: float = 900.0
    altura_cm: float = 45.0
    retardos_s: tuple = (7.0, 6.0, 3.0)
    tau_c_s: float = 8.0
    muestreo_s: float = 1.0
    dt_s: float = 0.1
    caudal_nominal_lpm: float = 45.0
    caudal_max_lpm: float = 90.0
    kff: tuple = (1.0, 1.0, 1.0)
    deposito_inicial_l: float = 100.0
    deposito_capacidad_l: float = 130.0

    def __post_init__(self):
        positive = (self.area_cm2, self.altura_cm, self.tau_c_s,
                    self.muestreo_s, self.dt_s, self.caudal_max_lpm,
                    self.deposito_capacidad_l)
        if any(not math.isfinite(x) or x <= 0 for x in positive):
            raise ValueError('Los parámetros positivos deben ser finitos y mayores que cero.')
        if len(self.retardos_s) != 3 or len(self.kff) != 3:
            raise ValueError('Se requieren tres retardos y tres ganancias feedforward.')
        if any(not math.isfinite(x) or x < 0 for x in self.retardos_s):
            raise ValueError('Retardos no negativos y finitos.')
        if any(not math.isfinite(x) or not 0 <= x <= 1 for x in self.kff):
            raise ValueError('Ganancias feedforward entre cero y uno.')
        if self.tau_c_s < max(self.retardos_s):
            raise ValueError('Se requiere tau_c >= máximo retardo para esta sintonización.')
        if not 0 <= self.caudal_nominal_lpm <= self.caudal_max_lpm:
            raise ValueError('Caudal nominal fuera del rango de bomba.')
        if not 0 <= self.deposito_inicial_l <= self.deposito_capacidad_l:
            raise ValueError('Volumen inicial del depósito fuera de rango.')
        for t in (self.muestreo_s, *self.retardos_s):
            if not math.isclose(t / self.dt_s, round(t / self.dt_s), abs_tol=1e-9):
                raise ValueError('Muestreo y retardos deben ser múltiplos de dt.')

    @property
    def ganancia_nivel(self):
        """cm/s por L/min; la ganancia de salida es el negativo de este valor."""
        return 1000.0 / (60.0 * self.area_cm2)

    def parametros_pi(self):
        return [dict(kc=-1.0 / (self.ganancia_nivel * (self.tau_c_s + theta)),
                     ti=4.0 * (self.tau_c_s + theta)) for theta in self.retardos_s]


class PI:
    def __init__(self, kc, ti, bias, limite):
        self.kc, self.ti, self.bias, self.limite = kc, ti, bias, limite
        self.integral_lpm = 0.0

    def calcular(self, error_cm, ff_lpm, dt_s):
        incremento = self.kc * dt_s * error_cm / self.ti
        candidato = self.integral_lpm + incremento
        salida = self.bias + self.kc * error_cm + candidato + ff_lpm
        # Integración condicional: permitir descargar el integrador saturado.
        if not ((salida > self.limite and incremento > 0) or
                (salida < 0 and incremento < 0)):
            self.integral_lpm = candidato
        salida = self.bias + self.kc * error_cm + self.integral_lpm + ff_lpm
        return max(0.0, min(self.limite, salida))


class Retardo:
    def __init__(self, pasos, inicial):
        self.cola = deque([inicial] * pasos)

    def avanzar(self, valor):
        self.cola.append(valor)
        return self.cola.popleft()


class Banco:
    def __init__(self, config=None, niveles_iniciales=(30.0, 30.0, 30.0)):
        self.c = config or Config()
        if len(niveles_iniciales) != 3 or any(
            not math.isfinite(h) or not 0 <= h <= self.c.altura_cm for h in niveles_iniciales
        ):
            raise ValueError('Niveles iniciales inválidos.')
        self.volumenes = [h * self.c.area_cm2 / 1000 for h in niveles_iniciales]
        self.deposito_l = self.c.deposito_inicial_l
        self.retardos = [Retardo(round(t / self.c.dt_s), self.c.caudal_nominal_lpm)
                         for t in self.c.retardos_s]

    @property
    def niveles(self):
        return [1000 * v / self.c.area_cm2 for v in self.volumenes]

    @property
    def volumen_total_l(self):
        return self.deposito_l + sum(self.volumenes)

    def avanzar(self, alimentacion_lpm, mandos_lpm):
        """Un mismo caudal real sale de una celda y entra en la siguiente."""
        if len(mandos_lpm) != 3 or any(not math.isfinite(q) for q in
                                                      [alimentacion_lpm, *mandos_lpm]):
            raise ValueError('Se requieren alimentación y tres mandos finitos.')
        c = self.c
        clip = lambda q: max(0.0, min(c.caudal_max_lpm, q))
        feed = min(clip(alimentacion_lpm), self.deposito_l * 60 / c.dt_s)
        q = [min(r.avanzar(clip(u)), v * 60 / c.dt_s)
             for r, u, v in zip(self.retardos, mandos_lpm, self.volumenes)]
        entradas = [feed, q[0], q[1]]
        nuevos = [v + (qi - qo) * c.dt_s / 60
                  for v, qi, qo in zip(self.volumenes, entradas, q)]
        deposito = self.deposito_l + (q[2] - feed) * c.dt_s / 60
        if any(v > c.area_cm2 * c.altura_cm / 1000 + 1e-10 for v in nuevos):
            raise RuntimeError('Desbordamiento: detener o implementar un modelo de rebose.')
        if deposito > c.deposito_capacidad_l + 1e-10:
            raise RuntimeError('Desbordamiento del depósito de retorno.')
        self.volumenes, self.deposito_l = nuevos, deposito
        return feed, q


def alimentacion_demo(t):
    return 55.0 if 120.0 <= t < 420.0 else 45.0


def simular(feedforward=False, duracion_s=900.0, config=None,
            alimentacion=alimentacion_demo, consigna=lambda t: (30.0, 30.0, 30.0),
            niveles_iniciales=(30.0, 30.0, 30.0)):
    c = config or Config()
    if not math.isfinite(duracion_s) or duracion_s <= 0 or not math.isclose(
        duracion_s / c.dt_s, round(duracion_s / c.dt_s), abs_tol=1e-9
    ):
        raise ValueError('Duración positiva y múltiplo de dt.')
    banco = Banco(c, niveles_iniciales)
    pi = [PI(p['kc'], p['ti'], c.caudal_nominal_lpm, c.caudal_max_lpm)
          for p in c.parametros_pi()]
    pasos_muestra = round(c.muestreo_s / c.dt_s)
    total_inicial = banco.volumen_total_l
    max_error_balance = 0.0
    iae = [0.0] * 3
    mandos = [c.caudal_nominal_lpm] * 3
    reales = mandos.copy()
    feed_real = c.caudal_nominal_lpm
    filas = []
    for paso in range(round(duracion_s / c.dt_s)):
        t = paso * c.dt_s
        sp = tuple(consigna(t))
        if len(sp) != 3 or any(not math.isfinite(x) or not 0 < x < c.altura_cm for x in sp):
            raise ValueError('Tres consignas finitas dentro de la altura de las celdas.')
        errores = [s - h for s, h in zip(sp, banco.niveles)]
        if paso % pasos_muestra == 0:
            # En este escenario P4 es ideal y conocido. Las otras perturbaciones
            # se miden en los caudales reales, nunca en mandos futuros.
            feed_medido = min(c.caudal_max_lpm, max(0.0, alimentacion(t)),
                              banco.deposito_l * 60 / c.dt_s)
            disturbios = [feed_medido, reales[0], reales[1]]
            mandos = [ctrl.calcular(e, kff * (d - c.caudal_nominal_lpm)
                                   if feedforward else 0.0, c.muestreo_s)
                      for ctrl, e, kff, d in zip(pi, errores, c.kff, disturbios)]
        anteriores = banco.niveles
        feed_real, reales = banco.avanzar(alimentacion(t), mandos)
        for i, (h0, h1) in enumerate(zip(anteriores, banco.niveles)):
            # Consigna constante durante el subintervalo: cuadratura trapezoidal.
            iae[i] += (abs(sp[i] - h0) + abs(sp[i] - h1)) * c.dt_s / 2
        max_error_balance = max(max_error_balance,
                               abs(banco.volumen_total_l - total_inicial))
        # Registro tras cada paso: tiempo, estado y caudales del intervalo terminado.
        filas.append(dict(t_s=(paso + 1) * c.dt_s, niveles_cm=banco.niveles,
                          consignas_cm=list(sp), mandos_lpm=mandos.copy(),
                          salidas_lpm=reales.copy(), alimentacion_lpm=feed_real,
                          deposito_l=banco.deposito_l, iae_cm_s=iae.copy()))
    return dict(estrategia='PI + FF' if feedforward else 'PI',
                iae_cm_s=iae, parametros_pi=c.parametros_pi(),
                max_error_balance_l=max_error_balance, datos=filas)


def guardar_resultados(carpeta='resultados'):
    destino = Path(carpeta)
    destino.mkdir(parents=True, exist_ok=True)
    resumen = []
    for ff, nombre in [(False, 'pi'), (True, 'pi_ff')]:
        resultado = simular(feedforward=ff)
        with (destino / f'{nombre}.csv').open('w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['t_s', *[f'h{i}_cm' for i in range(1, 4)],
                             *[f'sp{i}_cm' for i in range(1, 4)],
                             *[f'mando{i}_lpm' for i in range(1, 4)],
                             *[f'q{i}_lpm' for i in range(1, 4)], 'feed_lpm', 'deposito_l'])
            for d in resultado['datos']:
                writer.writerow([d['t_s'], *d['niveles_cm'], *d['consignas_cm'],
                                 *d['mandos_lpm'], *d['salidas_lpm'],
                                 d['alimentacion_lpm'], d['deposito_l']])
        resumen.append({k: v for k, v in resultado.items() if k != 'datos'})
    (destino / 'resumen.json').write_text(json.dumps(resumen, indent=2), encoding='utf-8')
    print(json.dumps(resumen, indent=2))


if __name__ == '__main__':
    guardar_resultados()
