const CACHE_VERSION='ecom-digital-pwa-2026-09-29-v1';
const APP_CACHE=`${CACHE_VERSION}-app`;
const RUNTIME_CACHE=`${CACHE_VERSION}-runtime`;
const APP_SHELL=[
  './',
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];
const STATIC_CDN_HOSTS=new Set([
  'cdnjs.cloudflare.com',
  'unpkg.com',
  'cdn.jsdelivr.net'
]);

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(APP_CACHE).then(cache=>cache.addAll(APP_SHELL)));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith('ecom-digital-pwa-')&&!key.startsWith(CACHE_VERSION)).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});

async function networkFirst(request,fallback){
  try{
    const response=await fetch(request);
    if(response&&response.ok){
      const cache=await caches.open(RUNTIME_CACHE);
      cache.put(request,response.clone());
    }
    return response;
  }catch(error){
    return (await caches.match(request))||(await caches.match(fallback));
  }
}

async function cacheFirst(request){
  const cached=await caches.match(request);
  if(cached)return cached;
  const response=await fetch(request);
  if(response&&(response.ok||response.type==='opaque')){
    const cache=await caches.open(RUNTIME_CACHE);
    cache.put(request,response.clone());
  }
  return response;
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);

  // Dữ liệu và phiên đăng nhập Supabase luôn đi thẳng tới máy chủ, không lưu vào cache PWA.
  if(url.hostname.endsWith('.supabase.co'))return;

  if(request.mode==='navigate'){
    event.respondWith(networkFirst(request,'./offline.html'));
    return;
  }

  if(url.origin===self.location.origin){
    event.respondWith(cacheFirst(request));
    return;
  }

  // Chỉ lưu các thư viện giao diện công khai; các dịch vụ ngoài khác vẫn dùng mạng trực tiếp.
  if(STATIC_CDN_HOSTS.has(url.hostname))event.respondWith(cacheFirst(request));
});
