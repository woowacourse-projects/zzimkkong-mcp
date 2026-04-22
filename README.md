# zzimkkong-mcp

Claude Code에서 판교 캠퍼스 회의실을 예약할 수 있는 MCP 서버입니다.

## 사전 조건

- [Node.js](https://nodejs.org) 18 이상
- `woowacourse-projects` GitHub Organization 멤버
- Claude Code 설치

## 설치

### 1. 설치 스크립트 실행

**macOS / Linux**
```bash
bash <(curl -s https://raw.githubusercontent.com/woowacourse-projects/zzimkkong-mcp/main/install.sh)
```

**Windows (PowerShell)**
```powershell
irm https://raw.githubusercontent.com/woowacourse-projects/zzimkkong-mcp/main/install.ps1 | iex
```

스크립트가 자동으로 다음을 처리합니다:
- Node.js 18 이상 및 Claude Code 설치 여부 확인
- GitHub Token이 없으면 브라우저에서 발급 페이지 자동 오픈 (`read:packages` 권한 필요)
- npm 인증 설정 (`~/.npmrc`)
- Claude Code MCP 등록 (`claude mcp add`)

### 2. Claude Code 재시작

설치 후 Claude Code를 완전히 종료했다가 다시 시작합니다.

---

## 수동 설치

스크립트 대신 직접 설치할 경우:

```bash
# 1. npm 인증 설정
echo "//npm.pkg.github.com/:_authToken=YOUR_TOKEN" >> ~/.npmrc
echo "@woowacourse-projects:registry=https://npm.pkg.github.com" >> ~/.npmrc

# 2. Claude Code에 MCP 등록
claude mcp add zzimkkong -s user -- npx @woowacourse-projects/zzimkkong-mcp
```

---

## 사용 가능한 기능

| 기능 | 설명 |
|------|------|
| 회의실 목록 조회 | 층별 예약 가능한 공간과 운영 시간 확인 |
| 예약 가능 시간 확인 | 특정 날짜·시간대에 비어있는 공간 조회 |
| 로그인 | 이메일/GitHub/Google OAuth 로그인 |
| 예약 생성 | 회의실 예약 (로그인 시 비밀번호 불필요) |
| 예약 조회 | 내 예약 목록 및 상세 정보 확인 |
| 예약 수정/이동 | 기존 예약 공간·시간 변경 |
| 예약 취소 | 예약 삭제 |

## 슬래시 커맨드 (스킬)

| 커맨드 | 설명 |
|--------|------|
| `/reserve-room` | 회의실 예약 단계별 안내 |
| `/my-reservations` | 내 예약 목록 조회 및 취소 |
| `/find-room [조건]` | 조건으로 공간 검색 후 바로 예약 |
| `/move-reservation` | 예약을 다른 공간·시간으로 이동 |

## 사용 예시

Claude Code에서 자연어로 요청하면 됩니다.

```
오늘 오후 2시~3시에 비어있는 회의실 알려줘
```

```
다음주 수요일 오후 2시 11층 코치 회의실 예약해줘
```

```
내 예약 목록 보여줘
```

## 업데이트

새 버전이 배포되면 아래 명령어로 업데이트합니다.

```bash
claude mcp remove zzimkkong
claude mcp add zzimkkong -s user -- npx @woowacourse-projects/zzimkkong-mcp
```
