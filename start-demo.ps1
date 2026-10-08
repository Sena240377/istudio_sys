param([switch]$SkipInstall)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js 24以上をインストールし、PowerShellを開き直してください。'
}
$nodeMajor = [int]((& node -p "process.versions.node.split('.')[0]").Trim())
if ($nodeMajor -lt 24) { throw 'Node.js 24以上が必要です（バックアップ・復元でnode:sqliteを使用）。' }
if (-not (Get-Command pnpm.cmd -ErrorAction SilentlyContinue)) {
  throw 'pnpmをインストールしてください。手順はREADME.mdを参照してください。'
}
if (-not (Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
if (-not $SkipInstall) {
  & pnpm.cmd install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw '依存関係の取得に失敗しました。' }
}
& pnpm.cmd db:generate
if ($LASTEXITCODE -ne 0) { throw 'Prisma Clientの生成に失敗しました。' }
& pnpm.cmd db:push
if ($LASTEXITCODE -ne 0) { throw 'データベースの準備に失敗しました。' }
& pnpm.cmd db:seed
if ($LASTEXITCODE -ne 0) { throw 'デモデータの準備に失敗しました。' }
Write-Host 'iStudio 検証用プロトタイプ: http://127.0.0.1:3000'
& pnpm.cmd dev
