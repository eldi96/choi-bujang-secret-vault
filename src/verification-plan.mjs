// 현재 배포의 회귀 확인 계획입니다. 공식 41종 목록이나 실행 결과가 아닙니다.
const plan = [
  [1, 'normal', 'GET /aleph.json', '200 · 배포 주소·커밋·단계가 시험 대상과 일치'],
  [1, 'forbidden', '비로그인 GET /data.json', '공개 메모 없음 · 404/410 등 실제 상태와 비노출 확인'],
  [2, 'normal', '승인된 A 세션 GET /api/notes', '200 · 본인 목록 정상 응답'],
  [2, 'forbidden', '비로그인 GET /api/notes', '401 · 메모 비노출'],
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

export function verificationPlan() {
  return plan.map(([step, kind, request, expected]) => ({
    caseId: `step${step}_${kind}`, step, kind, request, expected,
    execution: 'not_executed', environment: null, targetCommit: null,
    actualApiResult: null, requestId: null, checkedAt: null,
    serverRecordMatched: false, expectationMatched: null,
  }));
}
