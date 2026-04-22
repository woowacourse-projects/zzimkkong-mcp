#!/usr/bin/env bash
set -euo pipefail

ORG="woowacourse-projects"
PACKAGE="@${ORG}/zzimkkong-mcp"
NPMRC="${HOME}/.npmrc"
SETTINGS="${HOME}/.claude/settings.json"
REGISTRY="npm.pkg.github.com"

echo "🔧 zzimkkong-mcp 설치를 시작합니다..."
echo ""

# ── GitHub Token ──────────────────────────────────────────────────────────────
if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "GitHub Personal Access Token이 필요합니다."
  echo "👉 https://github.com/settings/tokens 에서 'read:packages' 권한으로 생성하세요."
  echo ""
  read -rsp "Token: " GITHUB_TOKEN
  echo ""
fi

# ── ~/.npmrc 설정 (중복 없이 갱신) ───────────────────────────────────────────
touch "$NPMRC"
grep -v "$REGISTRY" "$NPMRC" > "${NPMRC}.tmp" || true
{
  echo "//${REGISTRY}/:_authToken=${GITHUB_TOKEN}"
  echo "@${ORG}:registry=https://${REGISTRY}"
} >> "${NPMRC}.tmp"
mv "${NPMRC}.tmp" "$NPMRC"
chmod 600 "$NPMRC"
echo "✅ npm 인증 설정 완료"

# ── 패키지 설치 ────────────────────────────────────────────────────────────────
echo "📦 ${PACKAGE} 설치 중..."
npm install -g "$PACKAGE"
echo "✅ 패키지 설치 완료"

# ── Claude Code settings.json 업데이트 ────────────────────────────────────────
mkdir -p "$(dirname "$SETTINGS")"

node -e "
  const fs = require('fs');
  const p = '$SETTINGS';
  let s = {};
  if (fs.existsSync(p)) {
    try { s = JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e) {}
  }
  s.mcpServers = s.mcpServers || {};
  s.mcpServers.zzimkkong = { command: 'zzimkkong-mcp' };
  fs.writeFileSync(p, JSON.stringify(s, null, 2) + '\n');
"
echo "✅ Claude Code 설정 완료"

echo ""
echo "🎉 설치 완료! Claude Code를 재시작하면 zzimkkong MCP가 활성화됩니다."
