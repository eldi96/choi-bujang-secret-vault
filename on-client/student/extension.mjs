// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.
export function createStudentView() {
  return {
    renderIdentity({ me, devices, sessions }) {
      const root = document.createElement('section');
      const deviceStatus = { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' };
      const sessionStatus = { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' };
      const add = (parent, tag, text) => {
        const element = document.createElement(tag);
        element.textContent = text;
        parent.appendChild(element);
        return element;
      };
      const value = (input) => input == null || input === '' ? '확인 불가' : String(input);
      const showDevice = (parent, device) => {
        add(parent, 'p', `기기: ${value(device?.label)} · ID: ${value(device?.id)} · 상태: ${deviceStatus[device?.status] ?? '확인 불가'}`);
      };
      const showSession = (parent, session) => {
        add(parent, 'p', `세션 ID: ${value(session?.id)} · 상태: ${sessionStatus[session?.status] ?? '확인 불가'}`);
      };
      const show = (title, input, renderData) => {
        const section = document.createElement('section');
        root.appendChild(section);
        add(section, 'h3', title);
        const modeText = { demo: '예제 자료', disconnected: '연결 없음', unknown: '확인 불가' }[input?.mode];
        if (modeText) add(section, 'p', modeText);
        if (input?.status === 'loading') {
          add(section, 'p', '불러오는 중');
        } else if (input?.status === 'error') {
          add(section, 'p', `연결 실패: ${value(input.error?.message)}`);
        } else if (input?.status === 'ok') {
          renderData(section, input.data);
        } else {
          add(section, 'p', '확인 불가');
        }
      };
      show('현재 사용자·기기·세션', me, (section, data) => {
        add(section, 'p', `사용자: ${value(data?.user?.label)} · ID: ${value(data?.user?.id)}`);
        showDevice(section, data?.device);
        showSession(section, data?.session);
      });
      show('등록 기기', devices, (section, data) => {
        if (!Array.isArray(data)) add(section, 'p', '기기 목록 확인 불가');
        else if (data.length === 0) add(section, 'p', '등록된 기기 없음');
        else data.forEach((device) => showDevice(section, device));
      });
      show('로그인 세션', sessions, (section, data) => {
        if (!Array.isArray(data)) add(section, 'p', '세션 목록 확인 불가');
        else if (data.length === 0) add(section, 'p', '로그인 세션 없음');
        else data.forEach((session) => showSession(section, session));
      });
      return root;
    },
    renderDecision({ status, mode, data, error, appId }) {
      const root = document.createElement('section');
      const add = (text) => {
        const element = document.createElement('p');
        element.textContent = text;
        root.appendChild(element);
      };
      const value = (input) => input == null || input === '' ? '확인 불가' : String(input);
      if (mode === 'demo') add('예제 자료');
      else if (mode === 'disconnected') add('연결 없음');
      else if (mode === 'unknown') add('확인 불가');
      add(`업무 앱 ID: ${value(status === 'ok' ? data?.appId ?? appId : appId)}`);
      if (status === 'idle') {
        add('앱을 골라 접속을 요청하세요');
      } else if (status === 'loading') {
        add('판정 확인 중');
      } else if (status === 'error') {
        add(`요청 실패: ${value(error?.message)}`);
        add('접근 요청에 실패했습니다. 접근 거부 판정이 아니며, 접근 허용 여부를 확인할 수 없습니다.');
      } else if (status === 'ok') {
        const labels = {
          allow: '접근 허용(allow)',
          deny: '접근 거부(deny)',
          challenge: '추가 인증 또는 확인 필요(challenge)',
          unknown: '판정 확인 불가(unknown)',
        };
        const decision = Object.hasOwn(labels, data?.decision) ? data.decision : 'unknown';
        add(labels[decision]);
        add(`판정 이유: ${value(data?.reason)}`);
        add(`판정 시각: ${value(data?.checkedAt)}`);
        if (decision === 'allow') add('정책상 접근 허용이며, 실제 앱 접속 성공을 보장하지 않습니다.');
        else if (decision === 'challenge') add('이 앱이 추가 인증 또는 확인 절차를 대신 수행하지 않습니다.');
        else if (decision === 'unknown') add('접근 허용 여부를 확인할 수 없습니다.');
      } else {
        add('요청 상태 확인 불가. 접근 허용 여부를 확인할 수 없습니다.');
      }
      return root;
    },
    renderEvents({ status, mode, data, error }) {
      const root = document.createElement('section');
      const add = (parent, tag, text) => {
        const element = document.createElement(tag);
        if (text !== undefined) element.textContent = text;
        parent.appendChild(element);
        return element;
      };
      const value = (input) => input == null || input === '' ? '확인 불가' : String(input);
      const labels = {
        kind: { access: '접속 기록', xdr: 'XDR 경보' },
        access: { allowed: '허용됨', denied: '거부됨', unknown: '확인 불가' },
        session: { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' },
        device: { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' },
      };
      const describe = (type, code) => `${Object.hasOwn(labels[type], code) ? labels[type][code] : '확인 불가'}(${value(code)})`;
      if (mode === 'demo') add(root, 'p', '예제 자료');
      else if (mode === 'disconnected') add(root, 'p', '연결 없음');
      else if (mode === 'unknown') add(root, 'p', '확인 불가');
      add(root, 'p', '조회 범위: 본인의 최근 보안 기록 최대 40건. 전체 직원 이력이나 실시간 전체 위협 탐지가 아닙니다.');
      if (status === 'loading') {
        add(root, 'p', '기록을 불러오는 중');
        return root;
      }
      if (status === 'error') {
        if (error?.code === 'CONTRACT_MISMATCH') add(root, 'p', '기록의 형식을 확인할 수 없습니다.');
        add(root, 'p', `기록을 불러오지 못했습니다: ${value(error?.message)}`);
        return root;
      }
      if (status !== 'ok' || !Array.isArray(data)) {
        add(root, 'p', '기록 조회 상태 확인 불가');
        return root;
      }
      const events = [...data].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      const filters = {};
      const createFilter = (name, key, getValue) => {
        const label = add(root, 'label', name);
        const select = add(label, 'select');
        const all = add(select, 'option', '전체');
        all.value = 'all';
        for (const optionValue of new Set(events.map(getValue).filter((v) => v != null && v !== ''))) {
          const option = add(select, 'option', key === 'kind' ? describe('kind', optionValue) : key === 'access' ? describe('access', optionValue) : String(optionValue));
          option.value = optionValue;
        }
        select.value = 'all';
        filters[key] = select;
        select.addEventListener('change', () => { detail.replaceChildren(); renderList(); });
      };
      createFilter('기록 종류', 'kind', (event) => event.kind);
      createFilter('업무 앱', 'appId', (event) => event.appId);
      createFilter('접속 상태', 'access', (event) => event.state?.access);
      const count = add(root, 'p');
      count.setAttribute('aria-live', 'polite');
      const list = add(root, 'ul');
      const detail = add(root, 'section');
      detail.setAttribute('aria-live', 'polite');
      const renderDetail = (event) => {
        detail.replaceChildren();
        detail.setAttribute('data-student-event-detail', event.id);
        add(detail, 'h3', `${event.id} 상세`);
        add(detail, 'p', `사건 ID: ${value(event.id)} · 업무 앱: ${value(event.appId)}`);
        for (const [title, entries] of [['근거', event.evidence], ['규칙', event.rules]]) {
          add(detail, 'h4', title);
          if (!Array.isArray(entries)) add(detail, 'p', '확인 불가');
          else if (entries.length === 0) add(detail, 'p', `${title} 없음`);
          else {
            const items = add(detail, 'ul');
            for (const entry of entries) add(items, 'li', `${value(entry.id)}: ${value(entry.text)}`);
          }
        }
        add(detail, 'h4', '상태');
        add(detail, 'p', `접속 상태: ${describe('access', event.state?.access)}`);
        add(detail, 'p', `세션 상태: ${describe('session', event.state?.session)}`);
        add(detail, 'p', `기기 상태: ${describe('device', event.state?.device)}`);
      };
      const renderList = () => {
        list.replaceChildren();
        detail.removeAttribute('data-student-event-detail');
        const visible = events.filter((event) =>
          (filters.kind.value === 'all' || event.kind === filters.kind.value) &&
          (filters.appId.value === 'all' || event.appId === filters.appId.value) &&
          (filters.access.value === 'all' || event.state?.access === filters.access.value));
        count.textContent = `표시 ${visible.length}건 / 조회 ${events.length}건`;
        if (visible.length === 0) add(list, 'li', '표시할 기록이 없습니다');
        for (const event of visible) {
          const row = add(list, 'li');
          row.setAttribute('data-student-event-id', event.id);
          add(row, 'p', `사건 ID: ${value(event.id)} · 시각: ${value(event.at)} · 종류: ${describe('kind', event.kind)} · 업무 앱: ${value(event.appId)} · 요약: ${value(event.summary)}`);
          const button = add(row, 'button', `${event.id} 상세`);
          button.type = 'button';
          button.addEventListener('click', () => renderDetail(event));
        }
      };
      renderList();
      return root;
    },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
