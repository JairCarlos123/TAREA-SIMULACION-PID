# CELDA LAB

Aplicación local interactiva para estudiar el control de nivel de tres celdas
conectadas en serie. El motor de simulación está escrito en Python; la interfaz
usa HTML, CSS, JavaScript y SVG. En el uso local no requiere instalar bibliotecas
ni conexión a Internet para funcionar.

Para alojarla en Internet con Python funcionando en Render, consulta
**RENDER.md**. Ya se incluyen `app.py`, `requirements.txt` y `render.yaml`.
La página principal se encuentra en `web/index.html` y el servidor la muestra
automáticamente en `/`.

## Abrir en Windows

1. Haz doble clic en **INICIAR_SIMULACION.bat**.
2. Se abrirá el navegador en **http://127.0.0.1:8765**.
3. Mantén abierta la ventana del servidor mientras uses la aplicación.
4. Para detener el servidor, pulsa **Ctrl+C** en esa ventana.

Necesitas Python 3.10 o posterior. El iniciador busca primero `py -3` y después
`python`, y avisa si no encuentra una versión compatible. Se ha comprobado con
Python 3.11. Si lo abres
desde una terminal situada en esta carpeta:

```powershell
python servidor.py --abrir
```

Si el puerto está ocupado por otra aplicación:

```powershell
python servidor.py --port 8766 --abrir
```

No abras directamente `web/index.html`: la interfaz necesita comunicarse con el
servidor Python. El servidor escucha únicamente en el equipo local.

## Copiar o enviar a otra computadora

Puedes copiar la carpeta completa a otra PC con Windows o enviar
`CELDA_LAB_simulacion.zip` por correo. En la otra PC:

1. Extrae todo el ZIP; no ejecutes el BAT desde dentro del archivo comprimido.
2. Comprueba que esté instalado Python 3.10 o posterior, disponible con `py -3`
   o `python`. No se necesitan Flask, NumPy ni otras bibliotecas adicionales.
3. Haz doble clic en `INICIAR_SIMULACION.bat`.

Las rutas se resuelven desde la ubicación de la carpeta, por lo que no dependen
del nombre de usuario ni de la carpeta de esta computadora. El BAT funciona en
Windows. En Linux o macOS, con Python instalado, se inicia con
`python3 servidor.py --abrir` desde la carpeta de la aplicación.

El BAT no contiene el modelo: inicia `servidor.py`. El servidor ejecuta el motor
`modelo_celdas.py` y sirve `web/index.html` al navegador. Por eso enviar solo el
HTML o abrirlo con doble clic no permite calcular ensayos nuevos. Si Python ya
está funcionando, basta abrir `http://127.0.0.1:8765`; no hay que iniciar otro BAT.
`127.0.0.1` siempre se refiere a la computadora donde abres ese navegador.

Para distribuirla sin instalar Python haría falta una versión ejecutable que
incluya el intérprete. El ZIP actual contiene el código y no incluye Python.

## Funciones

- Diagrama de las tres celdas, cuatro bombas y depósito de retorno.
- Niveles dibujados a escala respecto a una altura de celda de 45 cm.
- Reproducción, pausa, reinicio, velocidad y selección del instante.
- Configuración de las consignas y del instante de su cambio.
- Alimentación base y perturbación de tipo pulso, escalón o ninguna.
- Tres escenarios de ejemplo.
- Sintonización SIMC configurable a través de tau_c y ganancias feedforward.
- Cálculo de PI y PI + FF en las mismas condiciones.
- Gráficas de nivel, caudal y desviación, con consulta de valores, selección de
  intervalo y series que se pueden ocultar.
- Comparación del IAE, desviación máxima y tiempo en límites de bomba.
- Exportación CSV de la estrategia seleccionada y JSON de ambas estrategias.
- Secciones de modelo matemático y guía de uso dentro de la aplicación.
- Diseño adaptable a escritorio, tableta y móvil.
- Botón de sol/luna en la esquina superior derecha. Guarda la preferencia de
  modo día o noche en ese navegador; inicialmente respeta el tema del sistema.

La gráfica muestra el ensayo completo. La línea vertical señala el instante
reproducido. El panel superior muestra el IAE acumulado hasta ese instante; la
sección Comparación utiliza el IAE de todo el ensayo. La velocidad de
reproducción no cambia los resultados físicos.

## Ejecución y datos

Python integra los balances con dt = 0.1 s. El PI se actualiza cada 1 s. La
interfaz recibe estados registrados cada 1 s y los interpola únicamente para
animar la presentación. Los IAE y las métricas máximas se calculan en Python
usando los subpasos del motor.

El CSV exportado desde la interfaz contiene estados cada 1 s y los IAE ya
integrados. El JSON contiene configuración, escenario, eventos, parámetros PI,
métricas y las dos series temporales. Para generar los CSV del escenario
predeterminado cada 0.1 s, ejecuta:

```powershell
python modelo_celdas.py
```

## Carpeta de entrega

Se retiraron los archivos de pruebas y los temporales del desarrollo. No son
necesarios para ejecutar la aplicación. La carpeta `resultados` conserva los
CSV generados previamente; puedes mantenerlos para tus análisis. Python puede
volver a crear una carpeta `__pycache__` al ejecutarse: es una caché automática.

## Alcance científico

Es un modelo hidráulico educativo inspirado en Quintanilla et al., MethodsX
(2023), DOI: https://doi.org/10.1016/j.mex.2023.102081. Conserva volumen y usa la
sección declarada de las celdas. Las ganancias PI se recalculan para ese balance;
el feedforward usa la desviación respecto al caudal nominal. No es una réplica
literal del algoritmo ni una validación contra los datos experimentales.

No predice espuma, aireación, ley de concentrado ni recuperación mineral. Si se
alcanza un rebose, el programa informa el error y conserva el último ensayo
completado en pantalla. Consulta MODELO_MATEMATICO.md para las ecuaciones,
hipótesis, unidades y decisiones de modelado.

## Archivos principales

```text
INICIAR_SIMULACION.bat  Inicio con doble clic
servidor.py            Servidor local y API de simulación
modelo_celdas.py       Motor físico y control PI
web/index.html         Interfaz
web/styles.css         Diseño adaptable
web/app.js             Interacciones, animación y gráficas
MODELO_MATEMATICO.md   Ecuaciones y fundamentos
```
