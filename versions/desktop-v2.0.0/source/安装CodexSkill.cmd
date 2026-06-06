@echo off
setlocal

set "SRC=%~dp0SKILL.md"
set "DST=%USERPROFILE%\.codex\skills\fhl-image-studio"
set "OLD1=%USERPROFILE%\.codex\skills\fhl-image-studio-cli"
set "OLD2=%USERPROFILE%\.codex\skills\fhl-ty-v2"

if not exist "%SRC%" (
  echo Cannot find "%SRC%"
  pause
  exit /b 1
)

if not exist "%USERPROFILE%\.codex\skills" mkdir "%USERPROFILE%\.codex\skills"
if not exist "%DST%" mkdir "%DST%"

copy /Y "%SRC%" "%DST%\SKILL.md" >nul
if errorlevel 1 (
  echo Failed to install Codex skill.
  pause
  exit /b 1
)

call :disable_old "%OLD1%" "%USERPROFILE%\.codex\skills\fhl-image-studio-cli.disabled"
call :disable_old "%OLD2%" "%USERPROFILE%\.codex\skills\fhl-ty-v2.disabled"

echo Installed Codex skill:
echo   %DST%\SKILL.md
echo.
echo Skill name:
echo   fhl-image-studio
echo.
echo Restart Codex or open a new Codex thread to let it discover the skill.
pause
endlocal
exit /b 0

:disable_old
if exist "%~1\SKILL.md" (
  if exist "%~2" rmdir /S /Q "%~2"
  move "%~1" "%~2" >nul
)
exit /b 0
