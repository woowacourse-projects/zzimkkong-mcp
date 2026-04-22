# zzimkkong-mcp 설치 스크립트 (Windows PowerShell)
$ErrorActionPreference = "Stop"

$ORG = "woowacourse-projects"
$PACKAGE = "@$ORG/zzimkkong-mcp"
$REGISTRY = "npm.pkg.github.com"
$NPMRC = "$env:USERPROFILE\.npmrc"

Write-Host "🔧 zzimkkong-mcp 설치를 시작합니다..." -ForegroundColor Cyan
Write-Host ""

# ── 사전 조건 확인 ─────────────────────────────────────────────────────────────
Write-Host "📋 사전 조건 확인 중..."

# Node.js 18 이상
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "❌ Node.js가 설치되어 있지 않습니다." -ForegroundColor Red
  Write-Host "   👉 https://nodejs.org 에서 Node.js 18 이상을 설치해주세요."
  exit 1
}
$nodeVersion = node -e "process.stdout.write(process.versions.node)"
$nodeMajor = [int]($nodeVersion -split "\.")[0]
if ($nodeMajor -lt 18) {
  Write-Host "❌ Node.js 버전이 너무 낮습니다. (현재: v$nodeVersion, 필요: v18 이상)" -ForegroundColor Red
  Write-Host "   👉 https://nodejs.org 에서 최신 버전으로 업그레이드해주세요."
  exit 1
}
Write-Host "  ✅ Node.js v$nodeVersion"

# Claude Code CLI
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  Write-Host "❌ Claude Code CLI가 설치되어 있지 않습니다." -ForegroundColor Red
  Write-Host "   👉 https://claude.ai/code 에서 Claude Code를 설치해주세요."
  exit 1
}
$claudeVersion = (claude --version 2>$null) ?? "unknown"
Write-Host "  ✅ Claude Code $claudeVersion"

Write-Host ""

# ── GitHub Token ──────────────────────────────────────────────────────────────
$GITHUB_TOKEN = $env:GITHUB_TOKEN

if (-not $GITHUB_TOKEN) {
  # ~/.npmrc에 저장된 토큰 확인
  if (Test-Path $NPMRC) {
    $existingLine = Get-Content $NPMRC | Where-Object { $_ -match "^//$REGISTRY/:_authToken=" }
    if ($existingLine) {
      $GITHUB_TOKEN = $existingLine -replace "^//$REGISTRY/:_authToken=", ""
      Write-Host "✅ 기존 GitHub Token 재사용"
    }
  }
}

if (-not $GITHUB_TOKEN) {
  Write-Host "GitHub Personal Access Token이 필요합니다."
  Write-Host "브라우저에서 토큰 발급 페이지를 열겠습니다..."
  Write-Host "  • Expiration: 원하는 기간 선택"
  Write-Host "  • Scopes: 'read:packages' 체크 후 Generate token 클릭"
  Write-Host ""
  Start-Process "https://github.com/settings/tokens/new?description=zzimkkong-mcp&scopes=read:packages"
  Write-Host ""
  $GITHUB_TOKEN = Read-Host -Prompt "발급된 Token을 붙여넣으세요" -AsSecureString
  $GITHUB_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($GITHUB_TOKEN)
  )
}

# ── ~/.npmrc 설정 ─────────────────────────────────────────────────────────────
if (-not (Test-Path $NPMRC)) { New-Item -Path $NPMRC -ItemType File | Out-Null }
$lines = Get-Content $NPMRC -ErrorAction SilentlyContinue | Where-Object { $_ -notmatch $REGISTRY }
$lines += "//$REGISTRY/:_authToken=$GITHUB_TOKEN"
$lines += "@$ORG`:registry=https://$REGISTRY"
$lines | Set-Content $NPMRC
Write-Host "✅ npm 인증 설정 완료"

# ── Claude Code MCP 등록 ───────────────────────────────────────────────────────
Write-Host "🔌 Claude Code에 MCP 등록 중..."
claude mcp remove zzimkkong 2>$null
claude mcp add zzimkkong -s user -- npx $PACKAGE
Write-Host "✅ Claude Code MCP 등록 완료"

Write-Host ""
Write-Host "🎉 설치 완료! Claude Code를 재시작하면 zzimkkong MCP가 활성화됩니다." -ForegroundColor Green
