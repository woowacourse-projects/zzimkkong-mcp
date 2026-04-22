# zzimkkong-mcp

Claude Code에서 판교 캠퍼스 회의실을 예약할 수 있는 MCP 서버입니다.

## 사전 조건

- [Node.js](https://nodejs.org) 18 이상
- `woowacourse-projects` GitHub Organization 멤버
- Claude Code 설치

## 설치

### 1. GitHub Personal Access Token 발급

1. https://github.com/settings/tokens/new 접속
2. 아래와 같이 설정 후 **Generate token** 클릭
   - Note: `zzimkkong-mcp` (구분용 이름)
   - Expiration: 원하는 기간
   - Scopes: **`read:packages`** 체크
3. 발급된 토큰을 복사해 둡니다 (페이지를 벗어나면 다시 볼 수 없습니다)

### 2. 설치 스크립트 실행

```bash
bash <(curl -s https://raw.githubusercontent.com/woowacourse-projects/zzimkkong-mcp/main/install.sh)
```

Token 입력 프롬프트가 나오면 1단계에서 복사한 토큰을 붙여넣습니다.

### 3. Claude Code 재시작

설치 후 Claude Code를 완전히 종료했다가 다시 시작합니다.

---

## 사용 가능한 기능

| 기능 | 설명 |
|------|------|
| 회의실 목록 조회 | 예약 가능한 공간과 운영 시간 확인 |
| 예약 가능 시간 확인 | 특정 날짜·시간대에 비어있는 공간 조회 |
| 예약 생성 | 회의실 예약 (4자리 비밀번호 설정 필요) |
| 예약 조회 | 예약 ID와 비밀번호로 상세 정보 확인 |
| 예약 수정 | 기존 예약 시간·내용 변경 |
| 예약 취소 | 예약 삭제 |
| 내 예약 찾기 | 이름으로 예약 목록 검색 |

## 사용 예시

Claude Code에서 자연어로 요청하면 됩니다.

```
오늘 오후 2시~3시에 비어있는 회의실 알려줘
```

```
지구 회의실 내일 10시~11시 예약해줘, 예약자 홍길동, 목적은 스프린트 회고
```

```
홍길동 이름으로 예약된 회의실 목록 보여줘
```

## 업데이트

새 버전이 배포되면 아래 명령어로 업데이트합니다.

```bash
npm update -g @woowacourse-projects/zzimkkong-mcp
```
