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
    renderDecision() { return '학생 구현 대기: 서버의 판정과 이유를 연결하세요.'; },
    renderEvents() { return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.'; },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
