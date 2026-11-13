import { URL } from 'node:url';
import console from 'node:console';
import { readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../dist/', import.meta.url);
// Reference artwork belongs to the earlier mock, never the connected shell.
await rm(new URL('artwork/', root), { recursive: true, force: true });
async function files(path = '') {
  const entries = await readdir(new URL(path, root), { withFileTypes: true });
  return (
    await Promise.all(
      entries
        .filter((e) => !e.name.endsWith('.map') && e.name !== 'sw.js')
        .map((e) => (e.isDirectory() ? files(path + e.name + '/') : [path + e.name]))
    )
  ).flat();
}
const entries = (await files()).sort();
const digest = createHash('sha256');
for (const path of entries) digest.update(await readFile(new URL(path, root)));
const version = digest.digest('hex').slice(0, 16);
const assets = entries.map((p) => '/next/' + p);
await writeFile(
  new URL('sw.js', root),
  `/* Connected Zine shell ${version}. No API/auth/private data caching. */
const CACHE='zine-next-connected-${version}';
const ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('message',event=>{if(event.data==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('zine-next-connected-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith('/next/')||event.request.headers.has('authorization'))return;
 if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.open(CACHE).then(cache=>cache.match('/next/index.html'))));
 else if(ASSETS.includes(url.pathname))event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.pathname))||fetch(event.request)));
});
`
);
console.log('Connected shell ' + version + ': ' + entries.length + ' assets; /next/ scope only.');
