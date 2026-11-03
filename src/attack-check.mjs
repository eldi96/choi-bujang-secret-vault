
// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if ([7, 8, 9, 10].includes(config.step)) {
    const { fixtureRequests } = await import('../scripts/fixture-7.mjs');
    const { decide } = await import('./decider.mjs');
    const { normal, suspicious } = fixtureRequests();
    const attempts = [];
    for (const [attackId, request, expectedDecision] of [
      ['normal_fixture', normal, 'allow'],
      ['compound_risk_fixture', suspicious, 'step_up'],
      ['unregistered_device_fixture', { ...normal, deviceRegistered: false }, 'deny'],
    ]) {
      const result = await decide(request);
      attempts.push({
        attackId,
        expected: '로컬 가상 요청 판정: ' + expectedDecision,
        observed: (result.decision === expectedDecision ? '일치' : '불일치')
          + ': ' + result.decision + ', 사유 ' + result.reasonCode
          + ' (실제 HTTP·공식 심판 시험 아님)',
      });
    }
    attempts.push({
      attackId: 'live_reauthentication',
      expected: '동일 사용자 새 로그인 전 자료 차단 및 새 요청 재판정',
      observed: '미실행: 제공 엔진의 새 로그인 검증 계약 및 실제 연동 환경 확인 필요',
    });
    if (config.step >= 8) {
      for (const [attackId, overrides, expectedDecision] of [
        ['notes_list_fixture', { path: '/notes', route: 'GET /notes' }, 'deny'],
        ['notice_read_fixture', { service: 'notices', path: '/notices', route: 'GET /notices' }, 'allow'],
        ['notice_write_fixture', { service: 'notices', method: 'POST', path: '/notices', route: 'POST /notices' }, 'deny'],
        ['teacher_material_fixture', { service: 'teacher', path: '/teacher/demo', route: 'GET /teacher/:id' }, 'deny'],
      ]) {
        const result = await decide({ ...normal, ...overrides });
        attempts.push({ attackId, expected: '로컬 가상 판정: ' + expectedDecision,
          observed: (result.decision === expectedDecision ? '일치: ' : '불일치: ')
            + result.decision + ' (실제 API·공식 심판 시험 아님)' });
      }
      attempts.push({ attackId: 'live_cross_owner_api',
        expected: '실제 A/B 인증 세션으로 타인 메모 및 공지 쓰기 거부',
        observed: '미실행: 실제 세션·DB 교차 접근 시험 필요. 공지 GET은 501 미구현' });
    }
    if (config.step >= 9) {
      const { detect } = await import('./detect.mjs');
      const { checkDetection } = await import('../scripts/detect-test.mjs');
      const results = await checkDetection(detect);
      results.forEach((result, index) => attempts.push({
        attackId: 'detection_fixture_' + (index + 1),
        expected: '로컬 탐지 계약: ' + result.name,
        observed: (result.passed ? '통과' : '실패') + ' (가상 사건·실제 접속 회수 아님)',
      }));
      attempts.push({
        attackId: 'live_revocation',
        expected: '운영 엔진 사건 전달 및 회수 제안 집행·탐지 회수 지연 측정',
        observed: '미실행: 운영 엔진 연동·실제 접속 회수 시험 필요',
      });
    }
    if (config.step === 10) {
      attempts.push({
        attackId: 'target_note_restore',
        expected: 'B의 지정 메모 한 건을 비공개 사본으로 복원 후 ID·소유자·내용 해시 일치',
        observed: '미실행: 비공개 B 대상 사본·POST 복원 경로 준비, 실제 B 세션 복원 및 해시 대조 미실행',
      }, {
        attackId: 'post_restore_regression',
        expected: '실제 자료·정책 복구 후 1~9단계 정상·금지 요청 및 감사 보존 재검증',
        observed: '미실행: README에 절차만 기록. 정책 시험 사본 한 줄 복원과 전체 실제 복구는 다름',
      });
    }
    return attempts;
  }
  if (![1, 2, 3, 4, 5, 6].includes(config.step)) {
    throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  }

  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }

  if (
    app.protocol !== 'https:' ||
    app.username ||
    app.password ||
    app.search ||
    app.hash ||
    app.pathname !== '/' ||
    app.hostname.endsWith('.example')
  ) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }

  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) {
    throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  }

  if (config.step >= 3 && config.step <= 6) {
    let response;

    try {
      response = await fetch(new URL('/api/notes', app), {
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
    } catch (error) {
      return [{
        attackId: 'anonymous_notes_api',
        expected: '비로그인 GET /api/notes 요청은 HTTP 401로 거부',
        observed: '검증 불가: 요청 실패 (' + error.name + ')',
      }];
    }

    let exposed = false;

    if (response.ok) {
      try {
        const data = await response.json();
        exposed = Array.isArray(data?.notes);
      } catch {
        // 응답을 메모 목록으로 해석할 수 없음
      }
    }

    const checks = [{
      attackId: 'anonymous_notes_api',
      expected: '비로그인 GET /api/notes 요청은 HTTP 401로 거부',
      observed: response.status === 401
        ? '차단 확인: HTTP 401'
        : exposed
          ? '차단 실패: 비로그인 메모 목록 노출 (HTTP ' + response.status + ')'
          : '검증 불가 또는 계약 불일치: HTTP ' + response.status,
    }];

    if (config.step >= 4 && config.step <= 6) {
      let json = false;

      try {
        const body = await response.json();
        json = !!body && typeof body.error === 'string' && body.error.length > 0;
      } catch {
        // JSON 오류 응답이 아님
      }

      checks[0].expected = '비로그인 GET /api/notes: HTTP 401 또는 403 및 JSON 오류';
      checks[0].observed = (response.status === 401 || response.status === 403) && json
        ? '차단 확인: HTTP ' + response.status + ', JSON 오류'
        : '차단 실패 또는 검증 불가: HTTP ' + response.status +
          ', JSON 오류 ' + (json ? '있음' : '없음');

      for (const [id, path, expected, validate] of [
        [
          'deployment_identity',
          '/aleph.json',
          '배포 식별 JSON 응답 HTTP 200',
          r => r.status === 200,
        ],
        [
          'security_header',
          '/',
          '첫 화면 X-Content-Type-Options: nosniff 또는 CSP',
          r => r.headers.get('x-content-type-options') === 'nosniff' ||
            !!r.headers.get('content-security-policy'),
        ],
      ]) {
        try {
          const r = await fetch(new URL(path, app), {
            redirect: 'error',
            signal: AbortSignal.timeout(10000),
          });

          let valid = validate(r);

          if (id === 'deployment_identity' && valid) {
            try {
              const body = await r.json();
              valid = body?.schema === 'aleph.defense.deployment.v1' &&
                body?.step === config.step;
            } catch {
              valid = false;
            }
          }

          checks.push({
            attackId: id,
            expected,
            observed: valid
              ? '확인: HTTP ' + r.status
              : '실패 또는 검증 불가: HTTP ' + r.status,
          });
        } catch (error) {
          checks.push({
            attackId: id,
            expected,
            observed: '검증 불가: 요청 실패 (' + error.name + ')',
          });
        }
      }

      checks.push({
        attackId: 'cross_owner_access',
        expected: '다른 로그인 사용자의 메모 GET·PUT·DELETE 거부',
        observed: '미실행: 사용자별 인증 세션을 사용한 교차 접근 시험 필요',
      });
    }

    if (config.step === 6) {
      checks.push({
        attackId: 'unregistered_device',
        expected: '미등록 기기의 자료실 접근 거부',
        observed: '미실행: 공식 SDP 엔진을 통한 미등록 기기 접근 시험 필요',
      });
    }

    return checks;
  }

  const response = await fetch(new URL('/data.json', app), {
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });

  let visible = false;

  if (response.ok) {
    try {
      const data = await response.json();
      visible = data?.sampleMarker === config.sampleMarker &&
        Array.isArray(data.notes) &&
        data.notes.length > 0;
    } catch {
      // JSON 응답이 아니면 성공으로 판정하지 않음
    }
  }

  if (config.step === 2) {
    return [{
      attackId: 'public_static_notes',
      expected: '비로그인 /data.json에서 가상 메모가 노출되지 않음',
      observed: visible
        ? '실패: 정적 메모 확인 표시가 노출됨'
        : response.ok
          ? '정적 메모 확인 표시 없음 (HTTP ' + response.status + ')'
          : response.status === 404 || response.status === 410
            ? '정적 자료 없음 (HTTP ' + response.status + ')'
            : '검증 불가: HTTP ' + response.status,
    }];
  }

  return [{
    attackId: 'anonymous_note_read',
    expected: '비로그인 화면에서 가상 메모를 확인',
    observed: visible
      ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임'
      : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})`,
  }];
}
