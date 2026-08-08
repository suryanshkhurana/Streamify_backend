#!/usr/bin/env pwsh
<#
  Streamify Load Test Runner
  Run this script from the project root to execute all tests in order.
  Records results to tests/load/results/
#>

$BASE_URL = "http://localhost:3000"
$RESULTS_DIR = "tests/load/results"
$TIMESTAMP = Get-Date -Format "yyyyMMdd-HHmm"

# Create results directory
New-Item -ItemType Directory -Force -Path $RESULTS_DIR | Out-Null

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "   Streamify Load Test Suite                  " -ForegroundColor Cyan
Write-Host "   Base URL: $BASE_URL                        " -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

# Check local k6 exists
if (-not (Test-Path ".\bin\k6.exe")) {
    Write-Host "[ERROR] k6 not found at .\bin\k6.exe" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Local k6 found" -ForegroundColor Green
Write-Host ""

Write-Host "-------------------------------------------" -ForegroundColor DarkGray
Write-Host " TEST 1/4 - Catalog Latency (PostgreSQL)" -ForegroundColor White
Write-Host "-------------------------------------------" -ForegroundColor DarkGray
.\bin\k6.exe run --env BASE_URL=$BASE_URL --out json="$RESULTS_DIR/1-catalog-$TIMESTAMP.json" tests/load/1-catalog-latency.js

Write-Host ""
Write-Host "-------------------------------------------" -ForegroundColor DarkGray
Write-Host " TEST 2/4 - Search Latency (Elasticsearch)" -ForegroundColor White
Write-Host "-------------------------------------------" -ForegroundColor DarkGray
.\bin\k6.exe run --env BASE_URL=$BASE_URL --out json="$RESULTS_DIR/2-search-$TIMESTAMP.json" tests/load/2-search-latency.js

Write-Host ""
Write-Host "-------------------------------------------" -ForegroundColor DarkGray
Write-Host " TEST 3/4 - Spike Test (100 users)" -ForegroundColor White
Write-Host "-------------------------------------------" -ForegroundColor DarkGray
.\bin\k6.exe run --env BASE_URL=$BASE_URL --out json="$RESULTS_DIR/5-spike-$TIMESTAMP.json" tests/load/5-spike-test.js

Write-Host ""
Write-Host "-------------------------------------------" -ForegroundColor DarkGray
Write-Host " TEST 4/4 - Auth Throughput (bcrypt)" -ForegroundColor White
Write-Host "-------------------------------------------" -ForegroundColor DarkGray
.\bin\k6.exe run --env BASE_URL=$BASE_URL --out json="$RESULTS_DIR/3-auth-$TIMESTAMP.json" tests/load/3-auth-throughput.js

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host "   [OK] All tests complete!                   " -ForegroundColor Green
Write-Host "   Results saved to: $RESULTS_DIR/            " -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
