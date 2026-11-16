const PATTERNS = Object.freeze([
  { name: 'jndi-lookup-in-header', condition: '요청 머리글에 외부 주소를 향하는 완전한 JNDI 원격 조회 구문이 있음', evidence: 'CVE-2021-44228: 기록되는 요청의 JNDI 조회가 취약한 Log4j에서 원격 조회를 일으킬 수 있음.' },
  { name: 'jndi-lookup-in-parameter', condition: '요청 주소나 인자에 외부 주소를 향하는 완전한 JNDI 원격 조회 구문이 있음', evidence: 'CVE-2021-44228: 공격자가 제어한 로그 메시지나 인자의 JNDI 조회가 악용될 수 있음.' },
  { name: 'vulnerability-scanner-trace', condition: '알려진 취약점 점검 도구의 흔적이 요청에 나타남', evidence: '가상 경보 묶음에 점검 도구 흔적이 나타나며, 도구 흔적만으로 악용이나 악의를 확정할 수 없음.' },
]);

export function decide(alert) {
  const data = alert?.data ?? {};
  const rule = alert?.rule ?? {};
  const header = typeof data.useragent === 'string' ? data.useragent : '';
  const url = typeof data.url === 'string' ? data.url : '';
  const description = typeof rule.description === 'string' ? rule.description : '';
  // 명시된 완전한 조회 형태만 높은 확신도로 분류합니다.
  const lookup = /\$\{jndi:(?:ldap|ldaps|rmi|dns):\/\/[^\s/}:]+(?::\d+)?(?:\/[^\s}]*)?\}/i;
  const headerMatch = lookup.test(header);
  const parameterMatch = lookup.test(url);
  const scanner = /(?:log4j[-_ ]?scan|log4shell[-_ ]?scan|점검 도구|취약점 점검)/i.test(`${header} ${url} ${description}`);
  const ambiguous = /CVE-2021-44228|\bjndi\b|lookup-fragment|cve-list|log-library-note|조회 형태가 잘린|취약점 이름 검색|취약점 목록 문서|중괄호|라이브러리 이름|점검 도구/i.test(`${header} ${url} ${description}`);
  let confidence = 0.12;
  let reason = 'no_pattern_match';
  if (headerMatch || parameterMatch) {
    confidence = 0.94;
    reason = headerMatch ? PATTERNS[0].name : PATTERNS[1].name;
  } else if (scanner || ambiguous) {
    confidence = 0.60;
    reason = scanner ? PATTERNS[2].name : PATTERNS[1].name;
  }
  return { action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record', confidence, reason };
}
