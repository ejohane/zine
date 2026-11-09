import type { Env } from './types';

export function inspector(env: Env, nonce: string) {
  const key = env.CLERK_PUBLISHABLE_KEY ?? '';
  const issuer = new URL(env.AUTH_ISSUER).origin;
  const escape = (text: string) =>
    text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Zine API · Inspector</title>
<style>
:root{color-scheme:light;--canvas:#f7f7f5;--surface:#fff;--text:#20211f;--muted:#5b6059;--line:#c9cdc5;--action:#263b2c;--focus:#205ec2;font:16px/1.55 system-ui,sans-serif;color:var(--text);background:var(--canvas)}
*{box-sizing:border-box}body{margin:0}main{max-width:1200px;margin:auto;padding:40px 28px}header{display:flex;align-items:center;justify-content:space-between;gap:24px;border-bottom:1px solid var(--line);padding-bottom:24px;margin-bottom:32px}h1{font-size:28px;letter-spacing:-.025em;margin:0}h2{font-size:20px;line-height:1.3;margin:0 0 16px}p{max-width:70ch;margin:8px 0 24px;color:var(--muted)}button,input,textarea,select{font:inherit}button,input,textarea,select{border:1px solid var(--line);border-radius:6px}button{padding:10px 16px;background:var(--surface);color:var(--text);cursor:pointer}button:hover{background:#ecefe9}button:disabled{opacity:.55;cursor:wait}button.primary{background:var(--action);border-color:var(--action);color:#fff}button.primary:hover{background:#344e3c}input,textarea,select{width:100%;padding:10px 12px;background:var(--surface);color:var(--text)}textarea{min-height:180px;resize:vertical;font:14px/1.6 ui-monospace,monospace}label{display:block;margin-bottom:6px;font-weight:600;font-size:14px}.field{margin-bottom:16px}.workspace{display:grid;grid-template-columns:minmax(280px,380px) minmax(0,1fr);gap:40px}section+section{margin-top:32px;padding-top:24px;border-top:1px solid var(--line)}.actions{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.method{display:grid;grid-template-columns:100px 1fr;gap:12px}.status{font-size:14px;color:var(--muted)}pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.65 ui-monospace,monospace;max-height:70vh;overflow:auto;padding:20px;background:var(--surface);border:1px solid var(--line);border-radius:8px;font-variant-numeric:tabular-nums}a{color:var(--action);text-underline-offset:3px}:focus-visible{outline:3px solid var(--focus);outline-offset:3px}::selection{background:#d8e7d9;color:var(--text)}input,textarea{caret-color:var(--action)}[hidden]{display:none!important}#sign-in{max-width:420px;margin:40px auto}#response-status{min-height:26px;margin-bottom:12px}#session{display:flex;align-items:center;gap:16px}@media(max-width:760px){main{padding:24px 18px}.workspace{grid-template-columns:1fr;gap:28px}header{align-items:flex-start}h1{font-size:24px}pre{max-height:60vh}}
</style>
${key ? `<script nonce="${nonce}" defer crossorigin="anonymous" src="${escape(issuer)}/npm/@clerk/ui@1/dist/ui.browser.js"></script><script nonce="${nonce}" defer crossorigin="anonymous" data-clerk-publishable-key="${escape(key)}" src="${escape(issuer)}/npm/@clerk/clerk-js@6/dist/clerk.browser.js"></script>` : ''}
</head><body><main>
<header><div><h1>Zine API</h1><div class="status">Independent service · API inspector</div></div><div id="session"><span id="session-status" role="status">${key ? 'Loading sign-in…' : 'Authentication configuration pending'}</span><button id="sign-out" hidden>Sign out</button></div></header>
<div id="sign-in"></div>
<div id="workspace" class="workspace" hidden>
<div><section><h2>Save something</h2><form id="save-form"><div class="field"><label for="save-url">Source URL</label><input id="save-url" type="url" required placeholder="https://…"></div><div class="field"><label for="save-context">Why you’re saving it <span class="status">(optional)</span></label><input id="save-context" type="text" maxlength="20000"></div><button class="primary" type="submit">Save to Zine</button></form></section>
<section><h2>Explore your data</h2><div class="actions"><button data-path="/v1/items?limit=10">Saved items</button><button data-path="/v1/items?status=received&limit=10">For review</button><button data-path="/v1/subscriptions">Subscriptions</button><button data-path="/v1/collections">Collections</button></div><form id="search-form"><div class="field"><label for="search-query">Search retained information</label><input id="search-query" required type="search"></div><div class="field"><label for="search-mode">Search method</label><select id="search-mode"><option value="hybrid">Words and meaning</option value="keyword">Words</option><option value="semantic">Meaning</option></select></div><button type="submit">Search</button></form></section>
<section><h2>Make a request</h2><form id="request-form"><div class="method"><div class="field"><label for="method">Method</label><select id="method"><option>GET</option><option>POST</option><option>PATCH</option><option>PUT</option><option>DELETE</option></select></div><div class="field"><label for="path">API path</label><input id="path" required value="/v1/me"></div></div><div class="field"><label for="body">JSON body</label><textarea id="body" spellcheck="false" placeholder="{}"></textarea></div><button type="submit">Send request</button></form></section></div>
<div><h2>Response</h2><div id="response-status" class="status" role="status">Choose an operation to inspect its response.</div><pre id="response" tabindex="0" aria-label="API response">Your authenticated API responses will appear here.</pre></div>
</div></main>
<script nonce="${nonce}">
const byId=(id)=>document.getElementById(id);
const redact=(value)=>Array.isArray(value)?value.map(redact):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,v])=>[key,/^(token|access_token|refresh_token|authorization|secret)$/i.test(key)?'[redacted]':redact(v)])):value;
async function callApi(path,method='GET',body){
 if(!path.startsWith('/v1/'))throw new Error('Use a path beginning with /v1/.');
 byId('response-status').textContent='Sending '+method+' '+path+'…';
 const buttons=[...document.querySelectorAll('button')];buttons.forEach((button)=>button.disabled=true);
 try{
  const token=await Clerk.session.getToken();if(!token)throw new Error('Your session ended. Sign in again.');
  const response=await fetch(path,{method,headers:{authorization:'Bearer '+token,...(body===undefined?{}:{'content-type':'application/json'}),...(path==='/v1/saves'?{'idempotency-key':crypto.randomUUID()}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const value=response.status===204?{deleted:true}:await response.json();
  byId('response-status').textContent=method+' '+path+' · HTTP '+response.status+' · '+(response.headers.get('x-request-id')||'');
  byId('response').textContent=JSON.stringify(redact(value),null,2);
  if(value.item?.id)byId('path').value='/v1/items/'+value.item.id;
  return {status:response.status,value};
 }finally{buttons.forEach((button)=>button.disabled=false);}
}
const handle=(operation)=>async(event)=>{event.preventDefault();try{await operation(event);}catch(error){byId('response-status').textContent=error.message||'Request failed. Try again.';}};
byId('save-form').addEventListener('submit',handle(()=>callApi('/v1/saves','POST',{url:byId('save-url').value,...(byId('save-context').value?{context:{text:byId('save-context').value}}:{})})));
byId('search-form').addEventListener('submit',handle(()=>callApi('/v1/items/search','POST',{query:byId('search-query').value,match:byId('search-mode').value})));
byId('request-form').addEventListener('submit',handle(()=>callApi(byId('path').value,byId('method').value,byId('body').value.trim()?JSON.parse(byId('body').value):undefined)));
document.querySelectorAll('[data-path]').forEach((button)=>button.addEventListener('click',handle(()=>callApi(button.dataset.path))));
byId('sign-out').addEventListener('click',handle(async()=>{await Clerk.signOut();location.reload();}));
window.addEventListener('load',async()=>{
 try{
  if(!window.Clerk)return;
  await Clerk.load({ui:{ClerkUI:window.__internal_ClerkUICtor}});
  if(!Clerk.isSignedIn){byId('session-status').textContent='Sign in to inspect your library';Clerk.mountSignIn(byId('sign-in'),{routing:'hash',forceRedirectUrl:location.origin});return;}
  byId('session-status').textContent='Signed in';byId('sign-out').hidden=false;byId('workspace').hidden=false;
  await callApi('/v1/me');
 }catch(error){byId('session-status').textContent='Sign-in failed: '+error.message;}
});
</script></body></html>`;
}
