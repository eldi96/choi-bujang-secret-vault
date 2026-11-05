const cards = document.querySelector('#cards');
const status = document.querySelector('#status');
const evidence = document.querySelector('#evidence');
const button = document.querySelector('#refresh');
const labels = { approved: '승인', pending: '승인 대기', not_requested: '요청 전', rejected: '승인 거절',
  revoked: '회수됨', expired: '만료', session_invalid: '세션 무효', session_unavailable: '세션 확인 불가',
  registry_unavailable: '조회 실패' };
function card(title, value, description) {
  const section = document.createElement('section');
  const heading = document.createElement('h2'); heading.textContent = title;
  const metric = document.createElement('p'); metric.className = 'value'; metric.textContent = value;
  const detail = document.createElement('p'); detail.textContent = description;
  section.append(heading, metric, detail); return section;
}
let sequence = 0;
function clear(message) {
  cards.replaceChildren(); evidence.textContent = '확인 전'; status.textContent = message;
}
async function refresh() {
  const current = ++sequence;
  button.disabled = true; clear('서버 조회 중 · 이전 결과를 집계하지 않습니다.');
  try {
    const response = await fetch('/api/operations', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error(response.status === 401 ? '자료실에서 로그인 후 다시 확인해 주세요.' : `서버 확인 불가 (HTTP ${response.status})`);
    const data = await response.json();
    if (current !== sequence) return;
    if (data.schema !== 'aleph.operations.v1' || !data.summary) throw new Error('응답 형식 확인 불가');
    const { rules, detection, revocation, recovery } = data.summary;
    const approval = revocation.approval;
    cards.replaceChildren(
      card('판정기 규칙', `${rules.count}개 · 설정 확인`, `${rules.ids.join(' · ')} / 실행 횟수: 미집계. 규칙 등록은 실행 성공이 아닙니다.`),
      card('탐지 사건', detection.eventCount === null ? '미집계' : `${detection.eventCount}건`, '운영 사건 이력 조회 미실행 · 사건 저장소 미연결'),
      card('회수 상태', labels[approval.status] ?? '확인 불가', `${approval.evidence === 'api_confirmed' ? '실제 승인 조회 응답' : '승인 조회 확인 불가'} / 현재 세션만 해당. 엔진 회수 집행 건수: 미집계. 승인 회수와 엔진 회수는 별개입니다.`),
      card('복구 버전', recovery.restoredVersion ?? '복원 결과 조회 미실행', `현재 배포: ${recovery.deployedVersion ?? '확인 불가'} / 복원 버전: 미확인. 사본 설정: ${recovery.backupConfigured ? '있음 (무결성 미검증)' : '없음'}. 완료 이력 조회는 미연결입니다.`),
    );
    // 화면 값과 대조용 원본은 같은 API 응답에서만 가져옵니다.
    evidence.textContent = JSON.stringify(data, null, 2);
    status.textContent = `서버 확인 시각: ${data.checkedAt} · 현재 세션 · 공식 통과 미확인`;
  } catch (error) {
    if (current === sequence) clear(error.message);
  } finally { if (current === sequence) button.disabled = false; }
}
button.addEventListener('click', refresh);
addEventListener('offline', () => { ++sequence; button.disabled = false; clear('오프라인 · 서버 확인 불가'); });
document.addEventListener('visibilitychange', () => {
  ++sequence; button.disabled = false;
  clear(document.hidden ? '화면을 떠남 · 이전 결과 숨김' : '서버 결과를 다시 확인해 주세요.');
});
void refresh();
