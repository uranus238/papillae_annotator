@echo off
cd /d "%~dp0"
where npm >nul 2>nul
if not errorlevel 1 goto npm_start
where pnpm >nul 2>nul
if not errorlevel 1 goto pnpm_start
echo Node.js and npm are required. Install Node.js LTS, then retry.
pause
exit /b 1
:npm_start
if exist node_modules\vite\bin\vite.js goto npm_run
call npm install
if errorlevel 1 goto failed
:npm_run
call npm run dev -- --open
exit /b
:pnpm_start
if exist node_modules\vite\bin\vite.js goto pnpm_run
call pnpm install
if errorlevel 1 goto failed
:pnpm_run
call pnpm run dev -- --open
exit /b
:failed
echo Setup failed. Check the error above.
pause
exit /b 1
