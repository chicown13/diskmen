@echo off
echo YouTube Downloader - Scripts de Desenvolvimento

:menu
echo.
echo ===== MENU =====
echo 1. Instalar dependencias
echo 2. Iniciar backend (server.py)
echo 3. Iniciar frontend (desenvolvimento web)
echo 4. Build para Android
echo 5. Abrir Android Studio
echo 6. Sair
echo.
set /p choice="Escolha uma opcao (1-6): "

if %choice%==1 goto install
if %choice%==2 goto backend
if %choice%==3 goto frontend
if %choice%==4 goto build_android
if %choice%==5 goto open_android
if %choice%==6 goto end

:install
echo Instalando dependencias Node.js...
call npm install
echo.
echo Instalando dependencias Python...
call pip install -r requirements.txt
echo.
echo Dependencias instaladas!
pause
goto menu

:backend
echo Iniciando backend Python...
python server.py
pause
goto menu

:frontend
echo Iniciando desenvolvimento web...
call npm run dev
pause
goto menu

:build_android
echo Fazendo build para Android...
call npm run build
call npx cap sync android
echo.
echo Build concluido! Agora você pode abrir no Android Studio.
pause
goto menu

:open_android
echo Abrindo Android Studio...
call npx cap open android
goto menu

:end
echo Tchau!
pause