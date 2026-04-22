#!/usr/bin/env bash
set -euo pipefail

ORG="woowacourse-projects"
PACKAGE="@${ORG}/zzimkkong-mcp"
NPMRC="${HOME}/.npmrc"
REGISTRY="npm.pkg.github.com"

echo "🔧 zzimkkong-mcp 설치를 시작합니다..."
echo ""

# ── 사전 조건 확인 ─────────────────────────────────────────────────────────────
echo "📋 사전 조건 확인 중..."

# Node.js 18 이상
if ! command -v node &>/dev/null; then
  echo "❌ Node.js가 설치되어 있지 않습니다."
  echo "   👉 https://nodejs.org 에서 Node.js 18 이상을 설치해주세요."
  exit 1
fi
NODE_VERSION=$(node -e "process.stdout.write(process.versions.node)")
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "❌ Node.js 버전이 너무 낮습니다. (현재: v${NODE_VERSION}, 필요: v18 이상)"
  echo "   👉 https://nodejs.org 에서 최신 버전으로 업그레이드해주세요."
  exit 1
fi
echo "  ✅ Node.js v${NODE_VERSION}"

# Claude Code CLI
if ! command -v claude &>/dev/null; then
  echo "❌ Claude Code CLI가 설치되어 있지 않습니다."
  echo "   👉 https://claude.ai/code 에서 Claude Code를 설치해주세요."
  exit 1
fi
CLAUDE_VERSION=$(claude --version 2>/dev/null || echo "unknown")
echo "  ✅ Claude Code ${CLAUDE_VERSION}"

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

# ── Claude Code MCP 등록 ───────────────────────────────────────────────────────
echo "🔌 Claude Code에 MCP 등록 중..."
claude mcp remove zzimkkong 2>/dev/null || true
claude mcp add zzimkkong -s user -- npx "$PACKAGE"
echo "✅ Claude Code MCP 등록 완료"

echo ""
echo "🎉 설치 완료! Claude Code를 재시작하면 zzimkkong MCP가 활성화됩니다."
