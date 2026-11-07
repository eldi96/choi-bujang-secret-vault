
// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if ([7, 8, 9, 10, 11, 12].includes(config.step)) {
    // 격리 환경에서 process.argv를 읽는 scripts/fixture-7.mjs를 불러오지 않습니다.
    const attempts = [];
    for (const [attackId, expectedDecision] of [
      ['normal_fixture', 'allow'],
      ['compound_risk_fixture', 'step_up'],
      ['unregistered_device_fixture', 'deny'],
    ]) {
      attempts.push({
        attackId,
        expected: '로컬 가상 요청 판정: ' + expectedDecision,
        observed: 'not_run',
      });
    }
    attempts.push({
      attackId: 'live_reauthentication',
      expected: '동일 사용자 새 로그인 전 자료 차단 및 새 요청 재판정',
      observed: 'not_run',
    });
    if (config.step >= 8) {
      for (const [attackId, expectedDecision] of [
        ['notes_list_fixture', 'deny'],
        ['notice_read_fixture', 'allow'],
        ['notice_write_fixture', 'deny'],
        ['teacher_material_fixture', 'deny'],
      ]) {
        attempts.push({
          attackId,
          expected: '로컬 가상 판정: ' + expectedDecision,
          observed: 'not_run',
        });
      }
      attempts.push({ attackId: 'live_cross_owner_api',
        expected: '실제 A/B 인증 세션으로 타인 메모 및 공지 쓰기 거부',
        observed: 'not_run' });
    }
    if (config.step >= 9) {
      // 격리 환경에서 시험 도구를 가져오지 않습니다. 여기서 실행하지 않은 점검입니다.
      const detectionCases = ['정상 조회 30건', '10분 안에 120건', '10분 안에 121건',
        '폭주 조회 200건', '서로 다른 사용자 각 100건', '10분 밖으로 흩어진 조회 200건'];
      detectionCases.forEach((name, index) => attempts.push({
        attackId: 'detection_fixture_' + (index + 1),
        expected: '로컬 탐지 계약: ' + name,
        observed: 'not_run',
      }));
      attempts.push({
        attackId: 'live_revocation',
        expected: '운영 엔진 사건 전달 및 회수 제안 집행·탐지 회수 지연 측정',
        observed: 'not_run',
      });
    }
    if (config.step >= 10) {
      attempts.push({
        attackId: 'target_note_restore',
        expected: 'B의 지정 메모 한 건을 비공개 사본으로 복원 후 ID·소유자·내용 해시 일치',
        observed: 'not_run',
      }, {
        attackId: 'post_restore_regression',
        expected: '실제 자료·정책 복구 후 1~9단계 정상·금지 요청 및 감사 보존 재검증',
        observed: 'not_run',
      });
    }
    if (config.step >= 11) {
      // 자식 프로세스로 시험을 실행하지 않습니다. 별도 실행 기록과 이번 묶음을 섞지 않습니다.
      attempts.push({
        attackId: 'device_approval_mock',
        expected: '서버 승인 전 메모 차단, 승인 후 정상, 회수·오류·자기 승인 거부'
          + (config.step === 12 ? ', 작전실 API·로그·22행 미실행 표 일치' : ''),
        observed: 'not_run',
      }, {
        attackId: 'live_device_approval',
        expected: '배포 화면에서 실제 로그인·승인 대기·서버 승인 후 본인 자료·회수 후 거부 확인',
        observed: 'not_run',
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
