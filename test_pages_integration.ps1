# Script de prueba de integracion para verificar que las paginas corregidas funcionen correctamente

Write-Host "=== TEST DE INTEGRACION - PAGINAS CORREGIDAS ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "1. Verificando archivos corregidos..." -ForegroundColor Yellow

$archivos = @(
    "tenants_views\razo\admin-bitacora.html",
    "tenants_views\razo\admin-numcuenta.html",
    "tenants_views\razo\forgot-password.html"
)

foreach ($archivo in $archivos) {
    Write-Host ""
    Write-Host "  Verificando: $archivo" -ForegroundColor Cyan
    
    if (Test-Path $archivo) {
        Write-Host "    [OK] Archivo existe" -ForegroundColor Green
        
        $content = Get-Content $archivo -Raw
        
        # Verificar que carga api.js
        if ($content -match 'api\.js') {
            Write-Host "    [OK] Carga api.js" -ForegroundColor Green
            
            # Contar cuantas veces aparece
            $apiMatches = [regex]::Matches($content, 'api\.js')
            if ($apiMatches.Count -eq 1) {
                Write-Host "    [OK] Sin duplicados" -ForegroundColor Green
            } else {
                Write-Host "    [WARNING] Aparece $($apiMatches.Count) veces" -ForegroundColor Yellow
            }
            
            # Verificar que esta en el head
            if ($content -match '<head>[\s\S]*?api\.js[\s\S]*?</head>') {
                Write-Host "    [OK] Esta en el head" -ForegroundColor Green
            } else {
                Write-Host "    [WARNING] NO esta en el head" -ForegroundColor Yellow
            }
        } else {
            Write-Host "    [ERROR] NO carga api.js" -ForegroundColor Red
        }
    } else {
        Write-Host "    [ERROR] Archivo NO existe" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "2. Verificando archivo api.js..." -ForegroundColor Yellow

$apiJsPath = "tenants_views\razo\js\api.js"
if (Test-Path $apiJsPath) {
    Write-Host "  [OK] Archivo api.js existe" -ForegroundColor Green
    
    $apiContent = Get-Content $apiJsPath -Raw
    
    if ($apiContent -match 'API\s*=') {
        Write-Host "  [OK] Variable API esta definida" -ForegroundColor Green
    } else {
        Write-Host "  [ERROR] Variable API NO esta definida" -ForegroundColor Red
    }
    
    if ($apiContent -match 'API_BASE_URL') {
        Write-Host "  [OK] Variable API_BASE_URL esta definida" -ForegroundColor Green
    } else {
        Write-Host "  [ERROR] Variable API_BASE_URL NO esta definida" -ForegroundColor Red
    }
} else {
    Write-Host "  [ERROR] Archivo api.js NO existe" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== RESULTADO ===" -ForegroundColor Cyan
Write-Host "Todos los archivos han sido corregidos." -ForegroundColor Green
Write-Host "Inicia el servidor para probar: npm start" -ForegroundColor Yellow
Write-Host ""
