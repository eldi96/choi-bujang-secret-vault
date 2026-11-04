# 11단계 접속 승인 제작 기록

## 승인 범위

현재 구현은 **서버가 검증한 로그인 세션에 묶인 접속 승인**입니다. 물리 기기나 보안 하드웨어의 증명이 아닙니다. 세션 탈취·복제 방어 또는 운영 ALEPH 엔진의 기기 등록 연동을 완료했다고 표현하지 않습니다. 판정기는 기존 엔진의 deviceRegistered만 사용하며 이번 승인 테이블을 엔진 등록부로 승격하지 않습니다.

- 브라우저는 기기 개인키·토큰을 localStorage/sessionStorage/IndexedDB에 저장하지 않습니다.
- 기존 인증은 Secure·HttpOnly·SameSite=Strict 쿠키를 유지합니다. 승인용 키·토큰·쿠키는 새로 발급하지 않습니다.
- 서버가 서명을 확인한 Supabase session_id와 사용자 ID만 승인 조회에 사용합니다. 세션 ID 원문은 API 응답에 노출하지 않고 DB에는 SHA-256만 저장합니다.
- 다른 로그인·다른 브라우저 세션은 별도 요청이며 기존 승인 기록을 계정 전체로 적용하지 않습니다.
- 만료·회수·세션 없음·DB 오류 시 접근을 거부합니다. 자료 API는 매 요청마다 검사합니다.

## 사용자 화면

1. 로그인합니다. 승인 전에는 메모 조회 요청을 보내지 않으며 기존 메모·편집 내용을 화면에서 지웁니다.
2. **이 접속의 기기 승인 요청**을 누르면 POST /api/device가 pending만 등록합니다. 자기 승인용 role·approved·sessionId 본문은 거부합니다.
3. 서버 운영자가 요청 번호와 요청자를 별도 신뢰 경로에서 확인합니다. 공개 승인 API나 자기 승인 버튼은 제공하지 않습니다.
4. **승인 결과 확인**으로 GET /api/device를 조회합니다. 서버 응답이 approved·registered:true일 때 기존 자료실을 엽니다.
5. 회수·만료 후 직접 notes·restore API 요청도 403입니다. 화면은 30초 주기·탭 복귀·온라인 복귀 때 재확인하며 통신 실패·오프라인 때 자료를 숨깁니다.

## 서버 운영자의 별도 승인

Supabase의 관리 SQL 환경에서만 실행합니다. 실제 계정·세션·메모값을 문서나 Git에 복사하지 않습니다. 요청 번호는 접근 권한 자체가 아닙니다.

```sql
-- 확인한 요청 한 건에만 24시간 승인. 실제 요청 번호로 대체합니다.
update public.vault_device_requests
set status='approved', reviewed_at=now(), expires_at=now()+interval '24 hours'
where id='CONFIRMED_REQUEST_UUID'::uuid and status='pending';

-- 회수도 확인한 한 건만 대상으로 합니다.
update public.vault_device_requests
set status='revoked', reviewed_at=now()
where id='CONFIRMED_REQUEST_UUID'::uuid and status='approved';
```

일반 로그인 사용자는 승인 테이블을 읽거나 수정할 수 없고 RPC를 직접 실행할 수 없습니다. 요청을 재전송해도 approved/rejected/revoked 기록을 pending으로 덮어쓰지 않습니다. 이 제작 단위에서는 실제 사용자의 요청을 대신 승인하지 않았습니다.

## DB와 보호 경로

- 새 테이블: public.vault_device_requests. RLS 활성, anon/authenticated 권한 없음. 기존 vault_notes·정책·데이터는 변경하지 않았습니다.
- 서버 전용 RPC: public.vault_device_access. auth.sessions에서 소유자와 세션 존재를 확인합니다. EXECUTE는 service_role만 허용합니다.
- SQL 원본: docs/sql/device-approval.sql. 학습 DB에 적용 완료이므로 같은 SQL을 다시 실행하지 않습니다.
- 메모 GET/POST/PUT/DELETE와 POST /api/restore-note가 승인 검사 뒤 기존 소유권·입력 검사를 수행합니다.
- 승인 테이블과 운영 엔진 판정기는 별도입니다. 심판 토큰에는 승인 세션 계약이 없어 보호 API를 우회시키지 않고 거부합니다. 공식 심판 연동은 추가 계약 확인이 필요합니다.

## 실행한 검증

- node --test test/device-approval.test.mjs test/device-screen.test.mjs: 승인 요청 대기 유지, 자기 승인·출처 위조 거부, 승인 전 모든 메모 동작 차단, 승인 후 기존 CRUD, 회수 후 재차단, DB 장애 거부, 세션 없는 요청 거부, 복원 경로 검사. 모의 인증·DB 시험입니다.
- 화면 스크립트 모의 시험에서 승인 전 메모 요청 0건, 승인 후 표시, 회수 후 본문·편집값 제거를 확인했습니다. API·화면 모의 시험 합계 5건 통과이며 실제 브라우저 시험과 구분합니다.
- npm run decider:test 4건, npm run fixture:7, npm run detect:test 6건 통과.
- npm run build -- --local 통과.
- 실제 학습 DB에서 합성 사용자·세션을 트랜잭션 안에 만들고 대기→승인→다른 세션 거부→회수→만료를 검사했습니다. 전부 ROLLBACK하여 시험 계정·세션·요청이 남지 않게 했습니다. 실제 브라우저 로그인 시험은 아닙니다.
- 실제 DB 확인: 승인 테이블 RLS true, anon SELECT false, authenticated UPDATE false 및 RPC EXECUTE false, 없는 세션은 session_invalid·registered:false.
- 보안 점검에서 이 테이블의 RLS 정책 없음 INFO는 서버 전용 설계에 따른 것입니다. 기존 rls_auto_enable 함수 공개 실행과 유출 비밀번호 검사 비활성 경고도 발견했으며 이번 범위에서 수정하지 않았습니다.
- 커밋·배포 및 실제 브라우저 승인 전후 시험은 아직 미실행입니다. 이전 10단계 실제 B 복원·복구 후 재시험도 미실행 상태를 유지합니다.
