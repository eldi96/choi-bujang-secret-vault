const status = document.querySelector('#install-status');
const installButton = document.querySelector('#install-app');
const standalone = matchMedia('(display-mode: standalone)');
let installPrompt = null;
function showInstallState() {
  const appWindow = standalone.matches || navigator.standalone === true;
  status.textContent = appWindow ? '앱 전용 창으로 실행 중 · 기기 승인과는 별개입니다.' : '브라우저로 실행 중 · 설치 여부로 기기 승인을 판단하지 않습니다.';
}
showInstallState();
standalone.addEventListener('change', showInstallState);
addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});
installButton.addEventListener('click', async () => {
  if (!installPrompt) return;
  const prompt = installPrompt;
  installPrompt = null;
  installButton.hidden = true;
  await prompt.prompt();
  await prompt.userChoice;
  showInstallState();
});
addEventListener('appinstalled', () => {
  installPrompt = null;
  installButton.hidden = true;
  showInstallState();
});
function showNetworkState() {
  document.querySelector('#network-status').textContent = navigator.onLine
    ? '통신 가능 여부는 요청 시 확인합니다. 자료 접근에는 서버 검증이 필요합니다.'
    : '오프라인입니다. 로그인·자료 조회·저장은 연결 후 다시 시도해 주세요. 보호 자료는 오프라인용으로 저장하지 않습니다.';
}
showNetworkState();
addEventListener('online', showNetworkState);
addEventListener('offline', showNetworkState);
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    document.querySelector('#install-help').textContent = '오프라인 안내를 준비하지 못했습니다. 연결 상태를 확인한 뒤 새로고침해 주세요.';
  });
}
