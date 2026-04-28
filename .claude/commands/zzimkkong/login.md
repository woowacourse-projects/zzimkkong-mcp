찜꽁 로그인을 도와주세요. $ARGUMENTS

## 흐름

1. **현재 상태 확인**: `get_my_info` 툴로 로그인 상태를 확인합니다.
   - 정상 로그인 상태면: 현재 계정 정보를 보여주고 "이미 로그인되어 있습니다. 다른 계정으로 전환할까요?" 를 물어봅니다.
     - 전환 원하면 → 2단계로 이동
     - 전환 불필요 → 종료
   - 세션 만료 또는 미로그인 → 2단계로 이동

2. **로그인 방법 선택**:
   - `get_last_login_method` 툴을 호출해 마지막 로그인 방법(email/github/google/none)을 확인합니다.
   - `AskUserQuestion` 툴로 선택지를 제시합니다:
     - question: "로그인 방법을 선택해주세요"
     - header: "로그인 방법"
     - options 3개: 마지막 로그인 방법에 해당하는 항목의 description 끝에 " (최근선택)"을 추가합니다.
       - label: "이메일/비밀번호", description: "이메일과 비밀번호로 로그인합니다."
       - label: "GitHub", description: "GitHub 계정으로 브라우저 로그인합니다."
       - label: "Google", description: "Google 계정으로 브라우저 로그인합니다."

3. **로그인 실행**: 선택에 따라 해당 툴을 실행합니다.
   - 이메일/비밀번호 선택 → 이메일과 비밀번호를 입력받아 `login` 툴 실행
   - GitHub 선택 → `login_github` 툴 실행 (브라우저 자동 열림)
   - Google 선택 → `login_google` 툴 실행 (브라우저 자동 열림)

4. **결과 안내**: 로그인 성공 시 계정 이름, 이메일, 역할을 출력합니다.

## 주의사항
- `$ARGUMENTS`에 "github", "google", "이메일" 등이 포함되어 있으면 해당 방법으로 바로 진행합니다.
- 브라우저 로그인(GitHub/Google)은 Chrome이 설치되어 있어야 합니다.
