@echo off
setlocal

set "ROOT=%~dp0"
if "%IMAGE_STUDIO_PUBLIC_ROOT%"=="" (
  for %%I in ("%ROOT%..") do set "PUBLIC_ROOT=%%~fI\"
) else (
  for %%I in ("%IMAGE_STUDIO_PUBLIC_ROOT%") do set "PUBLIC_ROOT=%%~fI\"
)
set "FRONTEND=%ROOT%image-studio\frontend"
set "NPM_CACHE=%ROOT%.npm-cache"
set "PORTABLE_NODE=%ROOT%runtime\node\node.exe"
set "LOCAL_CONFIG=%ROOT%config\fhl-api.local.json"
set "FRONTEND_LOCAL=%FRONTEND%\.local"
set "FRONTEND_FHL_CONFIG=%FRONTEND_LOCAL%\fhl-api.local.json"
set "PORT=5173"
set "URL=http://127.0.0.1:%PORT%/"
set "PORTABLE_MODE=0"

echo [FHL Image Studio] Windows portable UI launcher V2.0.0
echo.

if not exist "%FRONTEND%\package.json" (
  echo [ERROR] Frontend package.json was not found:
  echo         %FRONTEND%\package.json
  pause
  exit /b 1
)

if not exist "%PUBLIC_ROOT%input" mkdir "%PUBLIC_ROOT%input"
if not exist "%PUBLIC_ROOT%output" mkdir "%PUBLIC_ROOT%output"
if not exist "%PUBLIC_ROOT%output\log" mkdir "%PUBLIC_ROOT%output\log"
if not exist "%PUBLIC_ROOT%intermediate" mkdir "%PUBLIC_ROOT%intermediate"
if not exist "%FRONTEND_LOCAL%" mkdir "%FRONTEND_LOCAL%"

if exist "%LOCAL_CONFIG%" (
  copy /Y "%LOCAL_CONFIG%" "%FRONTEND_FHL_CONFIG%" >nul
  echo [FHL Image Studio] Local FHL API config is ready.
) else (
  if exist "%FRONTEND_FHL_CONFIG%" del /F /Q "%FRONTEND_FHL_CONFIG%" >nul 2>nul
  echo [FHL Image Studio] Local FHL API config was not found; use the in-app FHL API button to configure it.
)

if exist "%PORTABLE_NODE%" (
  set "NODE_EXE=%PORTABLE_NODE%"
  set "PORTABLE_MODE=1"
  echo [FHL Image Studio] Using bundled Node runtime.
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] Node.js was not found, and bundled runtime is missing:
    echo         %PORTABLE_NODE%
    echo.
    echo This package can be made no-install by keeping runtime\node\node.exe.
    pause
    exit /b 1
  )
  for /f "delims=" %%N in ('where node') do (
    set "NODE_EXE=%%N"
    goto :node_found
  )
  :node_found
  echo [FHL Image Studio] Using system Node.js.
)

pushd "%FRONTEND%"
if errorlevel 1 (
  echo [ERROR] Failed to enter frontend directory:
  echo         %FRONTEND%
  pause
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  if "%PORTABLE_MODE%"=="1" (
    echo [ERROR] Portable dependencies are missing:
    echo         %FRONTEND%\node_modules
    echo.
    echo For a no-install package, keep node_modules inside image-studio\frontend.
    popd
    pause
    exit /b 1
  )

  where npm.cmd >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] npm.cmd was not found in PATH.
    echo         Reinstall Node.js or use the portable package with bundled node_modules.
    popd
    pause
    exit /b 1
  )

  echo [FHL Image Studio] Dependencies are missing.
  echo [FHL Image Studio] Installing dependencies with npm.cmd install...
  call npm.cmd install --cache "%NPM_CACHE%" --no-audit --no-fund
  echo.
)

if not exist "node_modules\vite\bin\vite.js" (
  echo [ERROR] Dependency installation did not complete.
  echo         Missing node_modules\vite\bin\vite.js
  popd
  pause
  exit /b 1
)

echo [FHL Image Studio] Starting V2.0.0 Windows UI preview...
echo [FHL Image Studio] URL: %URL%
echo [FHL Image Studio] User files root: %PUBLIC_ROOT%
echo [FHL Image Studio] Port %PORT% is strict. Close old previews if it is busy.
echo.

set "VITE_TARGET_PLATFORM=windows"
set "IMAGE_STUDIO_INTERNAL_ROOT=%ROOT%"
set "IMAGE_STUDIO_PUBLIC_ROOT=%PUBLIC_ROOT%"
"%NODE_EXE%" "node_modules\vite\bin\vite.js" --host 127.0.0.1 --port %PORT% --strictPort --open / --mode windows
set "EXIT_CODE=%ERRORLEVEL%"

popd

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [ERROR] UI preview exited with code %EXIT_CODE%.
  pause
)

exit /b %EXIT_CODE%
