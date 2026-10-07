// 한 번 열면 오프라인에서도 열리도록 앱 파일과 CDN 파일을 저장해 둔다.
// 배포 갱신 시 VERSION 과 index.html 의 ?v= 를 같이 올릴 것.
const VERSION = 'ttk-v3';
const APP = [
  './', 'index.html', 'css/style.css?v=3', 'js/app.js?v=3', 'manifest.json', 'icons/icon.svg',
  'js/ui/viewer3d.js', 'js/ui/drawing.js', 'js/ui/tabs.js', 'js/ui/sidebar.js', 'js/ui/media.js', 'js/ui/visionDialog.js',
  'js/core/materials.js', 'js/core/model.js', 'js/core/parser.js', 'js/core/ai.js', 'js/core/cutlist.js',
  'js/core/bom.js', 'js/core/listing.js', 'js/core/storage.js', 'js/core/prompts.js', 'js/core/vision.js',
  'js/core/templates/index.js', 'js/core/templates/helpers.js', 'js/core/templates/wood.js',
  'js/core/templates/metal.js', 'js/core/templates/fire.js', 'js/core/templates/outdoor.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(APP)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // AI 요청은 저장하지 않는다
  if (url.hostname === 'api.anthropic.com') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && (url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net')) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
      }
      return res;
    }))
  );
});
