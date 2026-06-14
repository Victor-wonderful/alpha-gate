# Alpha Gate — Supabase DB 백업 스크립트
# 사용법:  D:\web01 에서  ->  pwsh ./scripts/backup-db.ps1   (또는 powershell -File ...)
#
# 사전 준비 (한 번만):
#   1) Docker Desktop 실행 중이어야 함 (Supabase CLI가 내부적으로 사용)
#   2) .env.local 에 아래 한 줄 추가 (대시보드 Settings -> Database -> Connection string -> URI 복사):
#        SUPABASE_DB_URL=postgresql://postgres:[비밀번호]@db.fknijvjiqtaonuvpxoac.supabase.co:5432/postgres
#      ※ .env.local 은 .gitignore 되어 있어 안전합니다.

$ErrorActionPreference = "Stop"

# --- 1. .env.local 에서 DB URL 읽기 ---
$envFile = Join-Path $PSScriptRoot "..\.env.local"
if (-not (Test-Path $envFile)) { throw ".env.local 을 찾을 수 없습니다: $envFile" }

$dbUrl = $null
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*SUPABASE_DB_URL\s*=\s*(.+)$') {
        $dbUrl = $matches[1].Trim().Trim('"').Trim("'")
        break
    }
}
if (-not $dbUrl) {
    throw "SUPABASE_DB_URL 이 .env.local 에 없습니다. 위 주석의 '사전 준비'를 참고해 추가하세요."
}

# --- 2. 백업 폴더 + 타임스탬프 ---
$backupDir = Join-Path $PSScriptRoot "..\backups"
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$schemaFile = Join-Path $backupDir "alpha-gate-$stamp-schema.sql"
$dataFile   = Join-Path $backupDir "alpha-gate-$stamp-data.sql"

Write-Host "DB 백업 시작 ($stamp)..." -ForegroundColor Cyan

# --- 3. 스키마 + 데이터 덤프 (Supabase CLI -> Docker pg_dump) ---
Write-Host "  [1/2] 스키마 덤프..." -ForegroundColor Gray
supabase db dump --db-url $dbUrl -f $schemaFile
if ($LASTEXITCODE -ne 0) { throw "스키마 덤프 실패" }

Write-Host "  [2/2] 데이터 덤프..." -ForegroundColor Gray
supabase db dump --db-url $dbUrl --data-only -f $dataFile
if ($LASTEXITCODE -ne 0) { throw "데이터 덤프 실패" }

# --- 4. 결과 ---
$schemaKB = [math]::Round((Get-Item $schemaFile).Length / 1KB, 1)
$dataKB   = [math]::Round((Get-Item $dataFile).Length / 1KB, 1)
Write-Host ""
Write-Host "백업 완료 ✅" -ForegroundColor Green
Write-Host "  스키마: $schemaFile  ($schemaKB KB)"
Write-Host "  데이터: $dataFile  ($dataKB KB)"
Write-Host ""
Write-Host "이 파일들을 외장/클라우드 등 안전한 곳에 보관하세요. (backups/ 는 git 제외됨)" -ForegroundColor Yellow
