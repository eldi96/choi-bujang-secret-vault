const plan = [
  [1, 'normal', 'GET /aleph.json', '200 · 배포 주소·커밋·단계가 시험 대상과 일치'],
  [1, 'forbidden', '비로그인 GET /data.json', '공개 메모 없음 · 404/410 등 실제 상태와 비노출 확인'],
  [2, 'normal', '승인된 A 세션 GET /api/notes', '200 · 승인 세션의 본인 목록 API 응답'],
  [2, 'forbidden', '비로그인 GET /api/notes', '401 · login_required 오류 응답'],
  [3, 'normal', '정상 로그인 후 GET /api/notes', '200 · 서버가 검증한 세션으로 조회 허용'],
  [3, 'forbidden', '유효하지 않은 인증으로 GET /api/notes', '401 · 메모 비노출'],
  [4, 'normal', '승인된 A 세션 GET /api/notes/:A시험메모', '200 · 지정한 본인 메모 일치'],
  [4, 'forbidden', '승인된 B 세션 GET /api/notes/:A시험메모', '404 · 타인 메모 비노출'],
  [5, 'normal', '승인된 세션으로 서버 GET /api/notes', '200 · 서버 경유 정상 조회'],
  [5, 'forbidden', '공개 키로 원본 DB REST 읽기', '권한 거부 · 메모 비노출 (빈 목록만으로 권한 회수 단정 금지)'],
  [6, 'normal', '실제 등록 기기의 엔진 경유 본인 단건 요청', '엔진 허용 및 원본 API 200'],
  [6, 'forbidden', '실제 미등록 기기의 엔진 경유 동일 요청', '엔진 거부 · 원본 자료 비노출'],
  [7, 'normal', '엔진이 검증한 유효 재확인 뒤 본인 단건 요청', '엔진 허용 및 원본 API 200'],
  [7, 'forbidden', '추가 확인이 필요한 접속의 재확인 전 요청', 'step_up · 재확인 전 원본 자료 비노출'],
  [8, 'normal', '등록 기기에서 허용 구역 본인 단건 요청', '판정 allow 및 원본 API 200'],
  [8, 'forbidden', '엔진 경유 미허용 구역 요청', 'deny · route_not_allowed · 자료 비노출'],
  [9, 'normal', '실제 사건 전달에서 정상 조회 후 본인 단건 요청', 'observe · 회수 없음 · API 200'],
  [9, 'forbidden', '승인된 엔진 시험으로 탐지·회수 집행 후 재요청', '회수 집행 기록 및 후속 자료 요청 거부'],
  [10, 'normal', 'B의 지정 한 건 POST /api/restore-note 후 재조회', '복원 응답 200 · ID·소유자·내용 해시 일치 · 정상 조회 유지'],
  [10, 'forbidden', 'A 세션으로 B 복원 POST /api/restore-note', '403 · 대상 및 대상 외 자료 불변'],
  [11, 'normal', '실제 승인 세션 GET /api/device 후 GET /api/notes', 'approved·registered=true 및 자료 200'],
  [11, 'forbidden', '승인 전 또는 만료·회수 세션 GET /api/notes', '403 · 자료 비노출 (DB 장애는 별도 확인 불가)'],
];
const tbody = document.querySelector('#checks');
const run = document.querySelector('#run-pair');
const save = document.querySelector('#save-table');
const observations = new Map();
const columns = ['단계', '구분', '요청', '기대 결과', '실제 API 결과', '요청 ID', '확인 시각(UTC)'];

function rows() {
  return plan.flatMap(([step, kind, request, expected]) => {
    const results = observations.get(step + kind) ?? [['미실행', '', '']];
    return results.map(result => [step, kind === 'normal' ? '정상' : '금지', request, expected, ...result]);
  });
}
function render() {
  tbody.replaceChildren(...rows().map(values => {
    const tr = document.createElement('tr');
    for (const value of values) {
      const td = document.createElement('td');
      td.textContent = value || '—';
      tr.append(td);
    }
    return tr;
  }));
}
async function measure(kind) {
  const normal = kind === 'normal';
  let response;
  let actual;
  try {
    response = await fetch('/api/notes', {method:'GET', credentials:normal ? 'same-origin' : 'omit',
      cache:'no-store', redirect:'error', signal:AbortSignal.timeout(15000)});
    const status = response.status;
    const json = response.headers.get('content-type')?.includes('application/json');
    let match = false;
    if (normal && status === 200 && json) {
      // 목록 형식만 검사하고 제목·본문·메모 ID는 화면이나 기록에 복사하지 않는다.
      match = Array.isArray((await response.json()).notes);
    } else if (!normal && status === 401 && json) {
      const error = await response.json();
      match = error.reasonCode === 'login_required' && Object.keys(error).every(k => ['error','reasonCode'].includes(k));
    }
    actual = 'HTTP ' + status + (match ? (normal ? ' · 정상 목록 허용' : ' · 무인증 거부') : ' · 기대 불일치');
  } catch {
    actual = response ? 'HTTP ' + response.status + ' · 응답 형식 확인 불가' : '요청 시도 · 응답 확인 불가';
  }
  const id = response?.headers.get('x-vercel-id') || response?.headers.get('x-request-id');
  const key = '2' + kind;
  const results = observations.get(key) ?? [];
  results.push([actual, id && /^[A-Za-z0-9_:.-]{1,160}$/.test(id) ? id : '응답 ID 없음 · 대조 불가', new Date().toISOString()]);
  observations.set(key, results);
  render();
}
run.addEventListener('click', async () => {
  run.disabled = true; save.disabled = true;
  try { await measure('normal'); await measure('forbidden'); }
  finally { run.disabled = false; save.disabled = false; }
});
save.addEventListener('click', () => {
  const csv = [columns, ...rows()].map(row => row.map(v => '"' + String(v).replaceAll('"','""') + '"').join(',')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['\uFEFF', csv], {type:'text/csv;charset=utf-8'}));
  link.download = '단계별-실측-기록.csv';
  link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});
render();
