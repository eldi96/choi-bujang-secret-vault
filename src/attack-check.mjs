// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (![1, 2, 3].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  if (config.step === 3) {
    let response;
    try {
      response = await fetch(new URL('/api/notes', app), {
        redirect: 'error', signal: AbortSignal.timeout(10000),
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
    return [{
      attackId: 'anonymous_notes_api',
      expected: '비로그인 GET /api/notes 요청은 HTTP 401로 거부',
      observed: response.status === 401
        ? '차단 확인: HTTP 401'
        : exposed
          ? '차단 실패: 비로그인 메모 목록 노출 (HTTP ' + response.status + ')'
          : '검증 불가 또는 계약 불일치: HTTP ' + response.status,
    }];
  }
  const response = await fetch(new URL('/data.json', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let visible = false;
  if (response.ok) {
    try {
      const data = await response.json();
      visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
        && data.notes.length > 0;
    } catch {
      // A non-JSON response is a failed check, not a successful deployment.
    }
  }
  if (config.step === 2) {
    return [{ attackId: 'public_static_notes', expected: '비로그인 /data.json에서 가상 메모가 노출되지 않음',
      observed: visible ? '실패: 정적 메모 확인 표시가 노출됨' : response.ok ? '정적 메모 확인 표시 없음 (HTTP ' + response.status + ')' : response.status === 404 || response.status === 410 ? '정적 자료 없음 (HTTP ' + response.status + ')' : '검증 불가: HTTP ' + response.status }];
  }
  return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
    observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
}
