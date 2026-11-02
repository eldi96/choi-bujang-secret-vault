// 서버가 경로로 구분하는 자원 이름입니다. 클라이언트의 자원 ID 주장을 믿지 않습니다.
// 자원 식별은 권한 부여가 아니며, 메모 소유권 검사는 자료 API가 유지합니다.
export const RESOURCE_IDS = Object.freeze({
  notes: 'vault.notes',
  instructorNotices: 'vault.instructor_notices',
});

export function identifyResource(pathname) {
  if (typeof pathname !== 'string') return null;
  if (pathname === '/api/notes') return RESOURCE_IDS.notes;
  if (/^\/api\/notes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pathname)) {
    return RESOURCE_IDS.notes;
  }
  if (pathname === '/api/notices') return RESOURCE_IDS.instructorNotices;
  return null;
}
