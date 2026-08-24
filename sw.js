// PyLand Service Worker —— 缓存整个站点（含 Skulpt）
// 原理：首次打开在线时，把 index.html / sw.js / manifest.json / icon 全部缓存进本地。
// 之后打开（哪怕断网）直接从本地命中，秒开，零等待。
// 注意：Skulpt 引擎已经内嵌在 HTML 里，无需单独缓存。
const VERSION = "v2";
const CACHE_NAME = `pyland-${VERSION}`;
const ASSETS = [
  "./",                // 入口页
  "./index.html",
  "./sw.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", e => {
  // 容错：单个资源失败不阻塞 SW 安装
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(ASSETS.map(u =>
        fetch(u).then(r => r.ok ? cache.put(u, r.clone()) : null).catch(() => null)
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith("pyland-") && k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 缓存策略：cache-first（同源资源），网络失败时用缓存兜底
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // 只接管同源请求；外链（CDN/CORS）不动
  if(url.origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(e.request).then(cached => {
        if(cached) return cached;
        return fetch(e.request).then(resp => {
          if(resp.ok && (e.request.method === "GET")){
            cache.put(e.request, resp.clone());
          }
          return resp;
        }).catch(() => cached);   // 离线 + 缓存未命中 → 让浏览器显示默认错误
      })
    )
  );
});
