// PyLand Service Worker —— 把 Skulpt 引擎缓存下来用
// 原理：首次打开在线时，sw 把 Skulpt CDN 的所有候选 URL 都缓存进本地。
// 之后打开页面（哪怕断网）就直接从本地命中，再也不被 CDN 403 坑到。
const VERSION = "v1";
const CACHE_NAME = `pyland-${VERSION}`;
const SKULPT_PREFIXES = [
  "https://unpkg.com/skulpt",
  "https://cdn.jsdelivr.net/npm/skulpt",
  "https://cdn.jsdelivr.net/gh/skulpt"
];

self.addEventListener("install", e => {
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith("pyland-") && k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = e.request.url;
  // 只接管 Skulpt 相关 CDN；其它一律放行（不同 HTML 之间走网络优先）
  if(SKULPT_PREFIXES.some(p => url.startsWith(p))){
    e.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(e.request).then(cached => {
          if(cached){
            return cached;
          }
          return fetch(e.request).then(resp => {
            // 只缓存成功的响应
            if(resp.ok){
              cache.put(e.request, resp.clone());
            }
            return resp;
          }).catch(() => cached);   // 离线且无缓存 → 返回 undefined 让上层报错
        })
      )
    );
  }
});
