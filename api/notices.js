import { RESOURCE_IDS } from '../src/resources.mjs';

// 공지 자료·역할 계약은 아직 없습니다. 자원 경로만 예약하고 본문은 제공하지 않습니다.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Aleph-Resource-Id', RESOURCE_IDS.instructorNotices);
  if (req.method !== 'GET') {
    return res.status(403).json({ error: 'Notice writes denied', reasonCode: 'instructor_authority_unavailable' });
  }
  return res.status(501).json({ error: 'Instructor notices are not configured', reasonCode: 'resource_not_configured' });
}
