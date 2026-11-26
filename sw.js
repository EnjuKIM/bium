// 비움 — 오프라인에서도 앱 화면이 열리도록 하는 서비스 워커
// 기록 데이터는 여기서 다루지 않습니다 (기록은 브라우저 localStorage에 따로 저장됨).
const SHELL = 'bium-shell-v2';
const FONTS = 'bium-fonts-v1';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== FONTS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.endsWith('.apk')) return; // 앱 설치 파일은 저장하지 않고 그대로 내려받기
  if (url.searchParams.has('check')) return; // 새 판 확인은 항상 서버에 직접 물어봐요

  // 앱 화면: 인터넷이 되면 항상 최신판, 안 되면 저장해 둔 판
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then(res => {
          // 앱 화면(HTML)일 때만 오프라인용으로 저장 (다른 파일을 열어도 앱 화면이 덮이지 않게)
          if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) {
            const copy = res.clone(); caches.open(SHELL).then(c => c.put('./index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 같은 주소의 아이콘·매니페스트: 저장본을 바로 쓰고, 뒤에서 새 판으로 갈아둠
  if (url.origin === self.location.origin) {
    e.respondWith(caches.open(SHELL).then(async c => {
      const hit = await c.match(req, { ignoreSearch: true });
      const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  // 글꼴(Google Fonts, Pretendard): 한 번 받으면 저장해 두고 오프라인에서도 사용
  if (/(^|\.)fonts\.googleapis\.com$|(^|\.)fonts\.gstatic\.com$|^cdn\.jsdelivr\.net$/.test(url.hostname)) {
    e.respondWith(caches.open(FONTS).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});

// 알림을 누르면 앱 화면으로
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./');
  }));
});
