@echo off
chcp 65001 >nul
pushd "%~dp0"
if errorlevel 1 exit /b 1
title CELDA LAB - Servidor de simulacion
echo.
echo   CELDA LAB - Laboratorio virtual de control de nivel
echo   La interfaz se abrira en tu navegador.
echo   Manten esta ventana abierta mientras usas la simulacion.
echo.
py -3 -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>&1
if not errorlevel 1 goto usar_py
python -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>&1
if not errorlevel 1 goto usar_python
echo   No se encontro Python 3.10 o posterior.
echo   Instala Python y vuelve a abrir este archivo.
echo   Si usas el comando python, habilita su opcion Add Python to PATH.
echo.
pause
popd
exit /b 1

:usar_py
py -3 servidor.py --abrir
goto terminar

:usar_python
python servidor.py --abrir

:terminar
if errorlevel 1 pause
popd
