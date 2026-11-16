# Modelo matemático de la simulación

## Alcance y decisión de modelado

Se implementa un modelo hidráulico de tres tanques de sección constante,
conectados por bombas, y un depósito de retorno. Es una adaptación educativa
inspirada en Quintanilla et al., MethodsX 10 (2023), 102081:
https://doi.org/10.1016/j.mex.2023.102081

No constituye una réplica validada del banco experimental. No modela sólidos,
recuperación mineral, distribución de burbujas ni dinámica de espuma. El volumen
calculado es volumen de líquido equivalente: se omiten la expansión por aire y
la salida de líquido arrastrado en la espuma. El nivel mostrado es el nivel de
ese modelo hidráulico, no una predicción validada de la interfaz pulpa-espuma.

La sección declarada en el artículo es 30 cm x 30 cm. Se utiliza esa geometría
para obtener una dinámica conservativa. La ganancia publicada -0.001018 no se
incorpora en estos balances porque no coincide con la conversión volumétrica
para esa sección. Tampoco se copian las ganancias PI experimentales.

## 1. Variables y unidades

- h_i: nivel de celda i, cm.
- A = 900 cm²: sección horizontal de cada celda.
- V_i = A h_i / 1000: volumen equivalente, L.
- q_0: alimentación desde el depósito a la celda 1, L/min.
- q_1, q_2, q_3: caudales REALES de salida de las celdas, L/min.
- u_i: mando de caudal antes del retardo, L/min.
- V_T: volumen del depósito de retorno, L.
- t: tiempo, s.

## 2. Balances físicos

```text
dh_1/dt = g (q_0 - q_1)
dh_2/dt = g (q_1 - q_2)
dh_3/dt = g (q_2 - q_3)
dV_T/dt = (q_3 - q_0) / 60

g = 1000 / (60 A) = 0.0185185185 cm/s por (L/min)
```

Por construcción, el caudal que abandona una celda es exactamente el mismo que
entra en la siguiente. Los retardos nunca se aplican de nuevo al transferir ese
caudal entre celdas. Así:

```text
d(V_T + V_1 + V_2 + V_3)/dt = 0
```

No se recorta el nivel a 0 o 45 cm después de integrar: eso podría crear o
destruir volumen. Las bombas se limitan al líquido disponible antes de efectuar
la transferencia. Si se supera la capacidad de una celda o del depósito, el
programa detiene el ensayo con un error explícito. Simular reboses requeriría
incorporar sus caudales al balance.

## 3. Bombas y retardos

```text
q_i(t) = sat[u_i(t - theta_i), 0, q_max]
theta = (7, 6, 3) s
```

Los valores de theta proceden del artículo; asignar todo el retardo a la
actuación hidráulica es una hipótesis de esta simulación. El experimento puede
incluir otras contribuciones de instrumentación y proceso que aquí no se
identifican por separado. No se añade otro retardo de sensor ni un filtro de
mediana, pues las mediciones de este escenario son ideales.

Se supone que P4, la bomba de alimentación, responde idealmente al escenario de
caudal prescrito. No tiene un controlador de nivel propio. El rango 0-90 L/min
es un límite de simulación elegido y configurable; no es una calibración de
las bombas del artículo. Las colas de retardo se inicializan a 45 L/min para
representar una planta que ya estaba en equilibrio antes de t = 0.

## 4. Modelo lineal para sintonizar cada lazo

Manteniendo fijo el caudal de entrada:

```text
G_i(s) = Delta H_i(s) / Delta U_i(s) = -g exp(-theta_i s) / s
```

La ganancia es negativa: aumentar la extracción reduce el nivel. El acoplamiento
entre celdas permanece en los balances completos, aunque se sintonizan los
lazos localmente. Es necesario verificar el conjunto, como se hace en las
pruebas, no inferir su comportamiento solo de cada lazo aislado.

## 5. Sintonización SIMC para el proceso integrador

```text
Kc_i = -1 / [g (tau_c + theta_i)]
Ti_i = 4 (tau_c + theta_i)
```

Se elige tau_c = 8 s, mayor o igual que todos los retardos. Esta elección es
de diseño, no un dato identificado. La regla es la del proceso integrador
(sin constante de tiempo finita), descrita por Skogestad:
https://skoge.folk.ntnu.no/publications/2003/tuningPID/README.html

| Celda | Kc, (L/min)/cm | Ti, s |
|---|---:|---:|
| 1 | -3.600000 | 60 |
| 2 | -3.857143 | 56 |
| 3 | -4.909091 | 44 |

## 6. PI digital y feedforward

El controlador se actualiza cada Ts = 1 s. Entre actualizaciones, el mando
permanece constante. La parte integral se almacena en unidades de caudal:

```text
e_i[k] = r_i[k] - h_i[k]
I_candidato = I_i[k-1] + Kc_i Ts e_i[k] / Ti_i
u_libre = q_nom + Kc_i e_i[k] + I_candidato + FF_i[k]
u_i[k] = sat(u_libre, 0, q_max)
```

Se rechaza el incremento integral si la salida excede un límite y el incremento
la empuja aún más hacia ese límite. Se permite la integración que descarga una
saturación. Esta protección anti-windup trata los límites del mando, no modela
una protección industrial por marcha en seco.

En modo PI, FF_i = 0. En modo PI + FF:

```text
d_1 = q_0 medido; d_2 = q_1 medido; d_3 = q_2 medido
FF_i[k] = Kff_i (d_i[k] - q_nom)
q_nom = 45 L/min; Kff = (1, 1, 1)
```

Kff = 1 es el valor estático que compensa una variación de entrada en el balance
ideal. No cancela anticipadamente los retardos de las bombas: la acción sigue
siendo causal. Las entradas a celdas 2 y 3 utilizan los últimos caudales reales
disponibles, con antigüedad de un subpaso de integración, nunca mandos futuros.

Esta formulación mantiene la compensación mientras exista la desviación de
caudal. Es una adaptación explícita respecto a la ecuación 8 del artículo,
que usa la diferencia entre muestras consecutivas. No se presenta como una
reproducción literal de su algoritmo. Se puede configurar Kff = (0.8, 0.8, 1),
pero eso por sí solo tampoco reproduce el algoritmo publicado.

## 7. Integración y evaluación

Se usa dt = 0.1 s para el balance y Ts = 1 s para el PI. Son dos intervalos
distintos. Los retardos son colas con un número entero de subpasos. Se exige
que Ts, duración y retardos sean múltiplos de dt para evitar redondeos ocultos.

El balance de volumen utiliza Euler explícito; con caudales retenidos en cada
subintervalo, su actualización volumétrica es exacta para esos caudales. Esto
no elimina el error de discretización del sistema con control y retardos. La
prueba de refinamiento compara dt = 0.1 s y 0.05 s manteniendo Ts = 1 s.

```text
IAE_i = integral de |r_i - h_i| dt, en cm·s
```

El IAE se acumula mediante cuadratura trapezoidal en cada subpaso. Para cambios
de consigna se considera su valor constante en el subintervalo que comienza.
El CSV registra el estado al final de cada subpaso y los caudales aplicados
durante ese subintervalo; el estado inicial se especifica en este documento.

## 8. Ensayo generado y verificación

Condiciones iguales para ambas estrategias:

- Duración: 900 s.
- Niveles iniciales y consignas: (30, 30, 30) cm.
- Depósito inicial: 100 L; capacidad: 130 L.
- Volumen total inicial: 181 L.
- Alimentación: 45 L/min hasta t = 120 s; 55 L/min desde 120 hasta 420 s;
  45 L/min a partir de 420 s.
- Mismas ganancias PI, retardos, pasos y límites en las dos estrategias.

Resultados de esta simulación (no del experimento):

| Estrategia | IAE celda 1 | IAE celda 2 | IAE celda 3 |
|---|---:|---:|---:|
| PI | 332.944 | 301.635 | 236.942 |
| PI + FF | 75.448 | 95.713 | 61.306 |

El error máximo de conservación del volumen es menor que 3e-12 L. Ambas
estrategias vuelven a menos de 0.01 cm del objetivo al final de este ensayo.
Los IAE cambian menos del 2% al reducir dt a 0.05 s. Estos resultados verifican
este escenario y la coherencia numérica; no demuestran validez experimental
ni garantizan que FF sea superior bajo cualquier condición.

Durante el desarrollo se verificaron: conversión de unidades, equilibrio, retardo exacto,
sentido del control, anti-windup, conservación y no negatividad, detección de
rebose, recuperación del nivel y límites, refinamiento temporal, comparación
del ensayo y validación de parámetros.

## Ejecución

```powershell
python modelo_celdas.py
```

No se necesitan paquetes externos. La ejecución genera `resultados/pi.csv`,
`resultados/pi_ff.csv` y `resultados/resumen.json`.

La función `simular` devuelve los datos numéricos listos para conectarlos a una
interfaz HTML. Esa interfaz debe mostrar esos datos; no debe resolver un segundo
modelo independiente con JavaScript ni crear ondas que parezcan resultados.
