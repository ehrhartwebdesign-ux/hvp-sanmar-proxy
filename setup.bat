@echo off
echo.
echo ================================================
echo   HVP SanMar Proxy -- GitHub + Render Setup
echo ================================================
echo.

where git >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Git is not installed.
    echo Download it at: https://git-scm.com/downloads
    pause
    exit /b 1
)

echo Step 1 of 3 -- GitHub
echo ---------------------
echo You need a free GitHub account. Create one at https://github.com if needed.
echo.
set /p GH_USER="Enter your GitHub username: "

if "%GH_USER%"=="" (
    echo ERROR: GitHub username required.
    pause
    exit /b 1
)

set REPO_NAME=hvp-sanmar-proxy
set REPO_URL=https://github.com/%GH_USER%/%REPO_NAME%.git

echo.
echo Next: Create the GitHub repository.
echo   1. Open: https://github.com/new
echo   2. Repository name: %REPO_NAME%
echo   3. Set to Public
echo   4. Do NOT check any initialization boxes
echo   5. Click Create repository
echo.
pause

echo.
echo Pushing code to GitHub...
git init
git add .
git commit -m "Initial deploy"
git branch -M main
git remote remove origin 2>nul
git remote add origin %REPO_URL%
git push -u origin main

echo.
echo Code is on GitHub.
echo.
echo Step 2 of 3 -- Render Deployment
echo ---------------------------------
echo 1. Go to: https://render.com
echo 2. Sign in with GitHub
echo 3. Click: New + then Web Service
echo 4. Connect repository: %GH_USER%/%REPO_NAME%
echo 5. Settings:
echo      Name:          hvp-sanmar-proxy
echo      Branch:        main  
echo      Build Command: npm install
echo      Start Command: node server.js
echo      Plan:          Free
echo 6. Click Create Web Service
echo 7. Wait ~2 minutes
echo 8. Copy your URL (e.g. https://hvp-sanmar-proxy.onrender.com)
echo.
set /p RENDER_URL="Paste your Render URL here: "

echo.
echo Step 3 of 3 -- Connect to Quote Builder
echo ----------------------------------------
echo In HVPromos_QuoteBuilder.html:
echo   1. Click Settings (top right)
echo   2. Enter SanMar username + password
echo   3. Paste Proxy URL: %RENDER_URL%
echo   4. Click Test Connection
echo   5. Click Save
echo.
echo ================================================
echo   All done!
echo ================================================
echo.
pause
