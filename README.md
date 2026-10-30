# BYTE BACK 방어전 시작 틀 R5

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 포함된 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 학생이 하는 일: 세 걸음

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

배포가 끝나면 `/`에서 점령된 가상 자료실을 볼 수 있습니다. `/data.json`에는 같은 가상 메모가 공개됩니다. 이 공개 상태를 확인하는 것이 1단계의 출발점입니다. 1단계 접수와 심판 판정은 포털에서 확인합니다.

## 시작 틀의 자동 처리

`vercel.json`은 정적 결과물 `public`을 배포합니다. 빌드 명령 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 이 값이 없으면 빌드가 실패하므로, 성공한 것처럼 빈 주소를 내보내지 않습니다. `aleph.json`의 내용만으로 저장소 소유권이나 방어 성공을 인정하지 않습니다. 심판이 공개 저장소의 실제 커밋과 배포된 자료를 따로 대조해야 합니다.

`aleph.config.json`의 `repoUrl`과 `publicAppUrl`은 이전 제출 묶음 방식의 자리표시자입니다. 1단계에서는 학생이 편집하지 않습니다. 2단계 이후 코딩 도구가 필요한 설정과 보호 기능을 단계별로 작성합니다. `npm run bundle`과 `bundle-notes.json`도 1단계의 세 걸음에는 포함되지 않습니다.

로컬에서 가상 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. 저장소의 `src/attack-check.mjs`는 실제 배포가 된 뒤 `/data.json`을 비로그인으로 요청해 공개 가상 메모의 확인 표시를 읽습니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.


## 2단계 진행 기록 (검증 전)

- 가상 메모 4건은 Supabase `vault_notes`에 저장했으며, RLS 활성화와 `anon`/`authenticated`의 직접 SELECT 권한 없음은 SQL Editor에서 확인했습니다.
- 브라우저는 `/api/notes`를 요청합니다. Vercel 서버 함수만 `SUPABASE_URL`, `SUPABASE_SECRET_KEY` 환경변수를 사용합니다. 실제 키를 Git에 넣지 않습니다.
- `public/data.json`은 저장소에서 삭제했고, 2단계 이후 빌드에서도 생성하지 않습니다. 루트 `data.json`의 메모도 제거했습니다.
- **남은 약점:** `/api/notes`는 아직 로그인·사용자별 권한 검사가 없는 공개 주소입니다. 누구나 API를 호출해 가상 메모를 읽을 수 있습니다. RLS가 이 서버 함수를 통한 공개 응답까지 막는 것은 아닙니다.
- **과거 노출:** 이전 공개 커밋과 이전 Vercel 배포에 남은 메모는 이번 변경만으로 제거되지 않습니다. 과거 노출이 해소되었다고 판단하지 않습니다.
- **검증 미완료:** 최신 Vercel 배포의 카드 4건, `/data.json` 비노출, `/aleph.json` 유효성 및 공식 심판 결과는 아직 확인하지 않았습니다.


## 2단계 제작 3 — 공개 노출 점검 (2026-10-25)

### 최신 GitHub 파일 확인

- 최신 `data.json`: `{"notes":[]}`로 메모 문장 없음 (파일 내용 확인).
- 최신 `public/data.json`: GitHub에서 404, 파일 없음 (파일 경로 확인).
- 최신 `public/index.html`: `fetch('/api/notes')` 사용, `/data.json` 요청 없음 (파일 내용 확인).
- `scripts/build-public.mjs`: 2단계 이후 `public/data.json`을 생성하지 않고 기존 파일을 제거하도록 구현됨 (코드 확인).
- 이 결과는 **확인한 최신 파일과 경로에 한정**합니다. 저장소 전체·모든 과거 커밋을 검색했다는 의미가 아닙니다.

### 배포에서 확인할 절차

1. 현재 운영 Vercel 주소의 `/`를 열어 가상 메모 카드가 정확히 4개 보이는지 확인합니다.
2. 같은 주소의 `/data.json`을 열어 메모 문장이 보이지 않는지 확인하고, 개발자 도구 Network에서 HTTP 상태 코드(404 등)를 기록합니다.
3. 같은 주소의 `/aleph.json`을 열어 `step: 2`, `repoUrl`, `commit`, `publicAppUrl`을 현재 배포와 비교합니다.
4. `/api/notes`를 로그인 없이 열어 응답에 메모가 포함되는지 확인합니다. **이 경로는 현재 공개되어 있습니다.**
5. GitHub 최신 파일 및 현재 배포된 HTML/JSON/JS에서 `실습용 가상 과제 기록`, `실습용 가상 포트폴리오 기록`, `실습용 가상 리추얼 기록`, `실습용 가상 행정 기록`을 검색합니다. 화면에 표시되는 API 응답의 메모는 예상된 동작이며, 정적 파일에 하드코딩된 메모와 구분해 기록합니다.

### 현재 확인 결과와 한계

- 사용자 확인: 운영 화면에 메모 카드 4개가 표시됨.
- 사용자 확인: `/data.json` 접속 시 오류 표시. **정확한 HTTP 상태 코드 미확인.**
- 사용자 제공 `/aleph.json`: `step: 2`, 저장소 `eldi96/choi-bujang-secret-vault`, 커밋 `572535815d7b4d6b26603b881eb16f5422d45aad` 확인. `publicAppUrl`은 별도 Vercel 배포 URL이며 주소 간 일치 여부는 추가 확인 필요.
- 자동 외부 HTTP 검사는 도구에서 해당 Vercel 주소에 접근하지 못하여 **미검증**. 사용자 확인과 자동 검증을 혼동하지 않습니다.
- **남은 약점:** `/api/notes`는 인증·인가가 없는 공개 API입니다. 서버 전용 키를 숨겨도 누구나 서버에 메모를 요청할 수 있습니다.
- **과거 노출:** 이전 공개 Git 커밋이나 옛 Vercel 배포에 메모가 남아 있을 수 있습니다. 현재 정적 파일에서 제거한 것만으로 과거 노출이 해소됐다고 쓰지 않습니다.
- 공식 심판 점수 및 통과 여부는 아직 확인되지 않았습니다.


## 3단계 저장점 (2026-10-25)

- 배포 자료실: https://choi-bujang-secret-vault-zeta-nine.vercel.app
- 로그인: Supabase Auth 이메일·비밀번호 로그인과 로그아웃. 브라우저는 로그인 토큰을 `Authorization: Bearer ...` 헤더로 전달합니다.
- 서버: `src/verify-login.mjs`의 검증 결과로 인증 여부를 판정하며 브라우저가 보낸 사용자 ID·역할을 신뢰하지 않습니다. 무로그인·유효하지 않은 토큰은 401로 거부합니다.
- 자료: Supabase `vault_notes`의 기존 숫자 기본키를 보존하고 별도 `public_id` UUID로 API의 메모를 식별합니다. 새 메모에는 서버가 검증한 사용자 ID를 `owner_id`로 저장합니다.
- 경로: `GET /api/notes`, `POST /api/notes`, `GET /api/notes/:id`, `PUT /api/notes/:id`, `DELETE /api/notes/:id`. 경로 목록은 `aleph.config.json`의 `allowedRoutes`에 기록되어 있습니다.
- 사용자 확인: A 로그인·로그아웃, 비로그인 메모 숨김, A 계정의 테스트 메모 추가·수정·삭제는 화면에서 성공했다고 보고했습니다.
- **미검증:** 삭제 후 단건 GET의 HTTP 404, 별도 HTTP 요청을 통한 인증 거부, 공식 심판 결과 및 최신 제출 묶음.
- **4단계에 남긴 취약점:** 단건 조회·수정·삭제 시 `owner_id` 비교를 하지 않으므로 다른 로그인 사용자가 UUID를 알면 접근할 수 있습니다. 4단계에서 수정해야 합니다.
- **이전 기록 주의:** 위 2단계 설명의 공개 API와 2단계 배포 확인 내용은 당시 기록이며, 현재 구현 상태를 나타내지 않습니다.

### 다시 확인하는 방법

1. 배포 사이트에서 시크릿 창을 열어 로그인하지 않은 상태에서 메모가 보이지 않는지 확인합니다.
2. A 테스트 계정으로 로그인하여 메모 목록을 보고 새 **가상 테스트 메모**를 추가·수정·삭제합니다. 기존 네 건은 삭제하지 않습니다.
3. 저장소를 로컬에 내려받은 상태에서 `npm run bundle`을 실행합니다. 실행 전 `git status`가 깨끗해야 하며, 생성되는 `artifacts/submission.json`은 Git에 올리지 않습니다.
4. 자체 점검과 공식 심판의 결과는 구분해 기록합니다.

## 4단계 저장점 (2026-10-26)

- API의 목록·단건 조회·수정·삭제는 서버가 검증한 사용자 ID와 `owner_id`가 일치하는 메모만 대상으로 합니다. 새 메모의 소유자는 서버가 지정하고, 수정 요청의 `owner_id`/`ownerId`는 거부합니다.
- 학습 DB `public.vault_notes`에 RLS를 활성화하고 SELECT·INSERT·UPDATE·DELETE 소유자 정책을 적용했습니다. `anon` 테이블 권한은 없고 `authenticated`에는 해당 네 권한만 남도록 GRANT/REVOKE 결과를 확인했습니다. 다른 테이블은 변경하지 않았습니다.
- 사용자 확인: A/B 각자 메모 목록이 분리되어 보이며, 메모 추가·수정·삭제가 정상 작동합니다. POST 생성 오류의 `crypto.randomInt` 범위는 수정했습니다.
- **미검증:** 실제 로그인 세션으로 상대 계정 메모의 GET·PUT·DELETE 차단, 소유자 변경 시도 차단, 직접 DB RLS 세션 테스트 및 공식 심판 통과 여부. 서버의 관리자 키는 RLS를 우회할 수 있으므로 API 소유자 필터와 RLS는 별도로 검증해야 합니다.
- 제출 묶음 생성은 `npm run bundle`로 실행하며, 실행 전에 로컬 Git 상태가 깨끗하고 origin이 실제 저장소를 가리켜야 합니다. `artifacts/submission.json`은 Git에 커밋하지 않습니다.

### 4단계 재확인

1. 배포 사이트에서 A/B 계정으로 각각 로그인하여 본인 메모 목록과 시험용 메모 추가·수정·삭제를 확인합니다.
2. 상대 계정 메모의 단건 조회·수정·삭제가 거부되는지 별도로 검사합니다. 미실행 결과를 성공으로 기록하지 않습니다.
3. 로컬 저장소에서 `npm run bundle`을 실행하고 출력의 단계·커밋·점검 결과를 확인합니다. 공식 심판 판정은 별도로 확인합니다.

## 5단계 저장점 (2026-10-26)

- 메모 조회·추가·수정·삭제는 `api/notes.js` 서버 함수로 처리하며, Supabase Auth 로그인 확인과 검증된 사용자 ID 기반 `owner_id` 필터를 유지합니다. 서버 전용 Supabase 키는 브라우저에 노출하지 않습니다.
- 학습 DB의 `public.vault_notes` 테이블에 한해 `PUBLIC`, `anon`, `authenticated` 직접 권한을 회수했습니다. 권한 재조회 결과 `anon` 및 `authenticated`의 SELECT·INSERT·UPDATE·DELETE는 모두 false, `service_role`의 네 권한은 모두 true였습니다. 다른 테이블은 변경하지 않았습니다.
- 권한 회수 후 사용자 확인: 배포 화면에서 A 계정의 메모 조회·추가·수정·삭제가 정상 작동했습니다. 이는 사용자 화면 확인이며 자동화된 HTTP 검증은 아닙니다.
- `aleph.config.json`의 `step`을 5로, `originalApiUrl`을 쿼리 없는 `https://sskbfouqhchnunyonhrj.supabase.co/rest/v1/vault_notes`로 설정했습니다. `judgeIssuer`, 로그인 발급자, 허용 경로, 서버 전용 설정은 유지합니다.
- **미검증:** anon 키로 원본 HTTPS REST 경로에 직접 요청했을 때의 HTTP 차단 응답, 5단계 공식 심판 판정, 이번 커밋 기준 제출 묶음 실행 결과.

### 5단계 재확인

1. 배포 화면에서 A 계정으로 로그인한 뒤 시험용 메모 조회·추가·수정·삭제를 확인합니다. 기존 메모는 보존합니다.
2. 승인된 학습 DB에서 `has_table_privilege`로 `anon`·`authenticated`의 네 CRUD 권한이 false이고 `service_role`은 true인지 조회합니다.
3. 공개 가능한 anon 키로 원본 REST 경로를 읽기 전용 요청해 실제 차단 HTTP 응답을 확인합니다. 키는 Git·로그·제출 묶음에 기록하지 않습니다.
4. 로컬 Git 저장소를 원격과 동기화하고 `git status`가 깨끗한지 확인한 다음 `npm run bundle`을 실행합니다. 생성되는 `artifacts/submission.json`은 커밋하지 않습니다. 자체 점검과 공식 심판 결과를 구분합니다.


## 보너스 xdr-01 저장점 (2026-10-30)

- 대상: MITRE ATT&CK T1110 기반 무차별 로그인 공격 경보 분류.
- `xdr/brute-force/patterns.json`: 근거가 있는 탐지 패턴 2개.
- `xdr/brute-force/read-alerts.mjs`: 경보의 시각·출발 주소·계정·규칙 수준·설명만 추출.
- `xdr/brute-force/decide.mjs`: import·파일 입출력 없이 경보를 block/alert/record로 분류.
- `xdr/brute-force/respond.mjs`: 만료 시각과 경보 ID가 있는 차단 후보 및 알림 로그 작성 기능. **운영 ZTNA 실제 거부 연동은 미완료**.
- 재실행: 저장소 루트에서 `npm run xdr:run -- brute-force`.
- 사용자 로컬 실행 결과: `block 10 / alert 9 / record 9`, 정상 이벤트 `bf-20`~`bf-28`의 block 0건.
- 실행 결과는 `xdr/brute-force/result.json`에 기록됨. GitHub 저장본은 로컬 재실행본과 일치 여부를 별도 확인해야 함.
- 공식 심판 판정과 운영 ZTNA 차단 성공은 아직 확인되지 않음.
