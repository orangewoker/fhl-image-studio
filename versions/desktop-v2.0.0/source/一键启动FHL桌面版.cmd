@echo off
setlocal

set "PUBLIC_ROOT=%~dp0"
set "PROGRAM_ROOT="

for /d %%D in ("%PUBLIC_ROOT%*") do (
  if exist "%%~fD\start-ui.cmd" (
    set "PROGRAM_ROOT=%%~fD\"
  )
)

if "%PROGRAM_ROOT%"=="" (
  echo [FHL Image Studio] Cannot find internal start-ui.cmd.
  echo Please keep the program files folder next to this launcher.
  pause
  exit /b 1
)

set "INTERNAL_START=%PROGRAM_ROOT%start-ui.cmd"
set "IMAGE_STUDIO_PUBLIC_ROOT=%PUBLIC_ROOT%"
call "%INTERNAL_START%"
exit /b %ERRORLEVEL%
