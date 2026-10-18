// Local component integration harness. No OAuth, production requests or persistence.
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = await build({
  stdin: {
    contents:
      "export { libraryHtml } from './src/ui.ts'; export { ItemCardFixtures } from '../../packages/design-system/src/fixtures/item-card.ts';",
    resolveDir: fileURLToPath(new URL('..', import.meta.url)),
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  loader: { '.html': 'text' },
  write: false,
});
const { libraryHtml, ItemCardFixtures } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);
const host = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zine component preview</title>
<style>body{margin:0;padding:24px;background:#e9edf0;color:#151719;font:14px system-ui}header{max-width:850px;margin:0 auto 16px;display:flex;gap:16px;align-items:center;justify-content:space-between}header p{margin:0;line-height:1.5}button{font:inherit;padding:8px 12px;border:1px solid #cfd4da;border-radius:8px;background:white;cursor:pointer}iframe{display:block;width:100%;max-width:850px;min-height:400px;border:1px solid #cfd4da;border-radius:16px;margin:auto;background:white}@media(max-width:520px){body{padding:8px}header{padding:8px}}</style>
<header><p><strong>Zine component preview</strong><br>Simulated MCP host · sample data · changes stay in this preview</p><div><button id="size">Phone width</button> <button id="theme">Dark mode</button></div></header>
<iframe title="Zine saved library component" src="/component" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"></iframe>
<script>
const frame = document.querySelector('iframe');
const fixtureArt = ${JSON.stringify(ItemCardFixtures).replaceAll('<', '\\u003c')};
const samples = [
{...fixtureArt.article,bookmarkId:'interfaces',title:'Designing software you can talk to',url:'https://example.com/conversational-software',provider:'WEB',contentType:'ARTICLE',summary:'What changes when a conversation can bring up the exact interface you need? Notes on combining language, direct manipulation, and familiar tools.',tags:['Interfaces','Personal software']},
{...fixtureArt.video,bookmarkId:'personal',title:'The case for small, personal software',url:'https://example.com/personal-software',provider:'YOUTUBE',contentType:'VIDEO',summary:'A reading list about building tools that fit one person’s way of thinking, working, and collecting ideas.',tags:['Personal software']},
{...fixtureArt.podcast,bookmarkId:'reading',title:'A library that grows with your interests',url:'https://example.com/reading-library',provider:'SPOTIFY',contentType:'PODCAST',summary:'Saving is the beginning. Finding connections between things you have read is where a personal library becomes useful.',tags:['Reading','Knowledge']},
{...fixtureArt.article,thumbnailUrl:'https://picsum.photos/seed/zine-mcp/640/360',bookmarkId:'mcp',title:'Tools, conversation, and the interface between them',url:'https://developers.openai.com/plugins/build/chatgpt-ui',provider:'WEB',contentType:'ARTICLE',summary:'A component can turn structured tool results into something you can explore and act on directly.',tags:['Interfaces','MCP']},
{bookmarkId:'missing',title:'A link without saved article text',url:'https://example.com/no-stored-text',provider:'WEB',contentType:'ARTICLE',summary:null,tags:[]},
{bookmarkId:'unsafe',title:'Untrusted source: <img src=x onerror=alert(1)>',url:'javascript:alert(1)',provider:'WEB',contentType:'POST',summary:'This intentionally hostile fixture should render as plain text and offer no unsafe link.',tags:['<script>']}
];
let dark = false;
let additions = [];
let toolCalls = [];
window.previewState = { additions, toolCalls };
function send(message){frame.contentWindow.postMessage({jsonrpc:'2.0',...message},location.origin)}
window.addEventListener('message',async event=>{
 if(event.source!==frame.contentWindow||event.origin!==location.origin||event.data?.jsonrpc!=='2.0')return;
 const m=event.data;
 if(m.method==='ui/initialize')send({id:m.id,result:{protocolVersion:'2026-01-26',hostInfo:{name:'zine-preview',version:'1'},hostCapabilities:{serverTools:{}},hostContext:{theme:dark?'dark':'light'}}});
 if(m.method==='ui/notifications/initialized')send({method:'ui/notifications/tool-result',params:{structuredContent:{data:{items:samples.slice(0,4),query:'',nextCursor:'sample-page-2'},untrusted:true},content:[]}});
 if(m.method==='ui/notifications/size-changed')frame.style.height=Math.min(4000,m.params.height+2)+'px';
 if(m.method==='tools/call'){
  const {name,arguments:a}=m.params;toolCalls.push({name,arguments:a});
  let data;
  let failure;
  await new Promise(r=>setTimeout(r,200));
  if(name==='search_saved'){
   if(a.query==='error')failure='INTERNAL_ERROR';
   else if(a.query==='permission')failure='permission';
   else {const matches=samples.filter(i=>(i.title+' '+(i.summary||'')+' '+i.url).toLowerCase().includes((a.query||'').toLowerCase()));data={items:a.cursor?matches.slice(4):matches.slice(0,4),query:a.query||'',nextCursor:!a.cursor&&matches.length>4?'sample-page-2':null};}
  }
  if(name==='read_saved')data={bookmarkId:a.bookmarkId,available:a.bookmarkId!=='missing',content:a.bookmarkId==='missing'?'':a.offset?'The next section of stored text.':'This is sample stored article text for the component preview. It demonstrates the reader interaction; it is not an excerpt from the linked page.\\n\\nA useful interface lets you inspect a result, make a choice, and continue your conversation.\\n\\n<script>Untrusted article text stays text.<\\/script>',nextOffset:a.bookmarkId==='missing'||a.offset?null:320};
  if(name==='list_collections')data={collections:[{id:'research',name:'Research'},{id:'weekend',name:'Weekend reading'}],nextCursor:null};
  if(name==='add_to_collection'){additions.push(a);data={...a,added:true};}
  send({id:m.id,result:failure?{isError:true,content:[{type:'text',text:failure}],...(failure==='permission'?{_meta:{'mcp/www_authenticate':['Bearer scope="bookmarks:read"']}}:{})}:{structuredContent:{data,untrusted:true},content:[]}});
 }
});
document.querySelector('#size').onclick=()=>{const phone=frame.style.maxWidth!=='390px';frame.style.maxWidth=phone?'390px':'850px';document.querySelector('#size').textContent=phone?'Wide view':'Phone width'};
document.querySelector('#theme').onclick=()=>{dark=!dark;document.querySelector('#theme').textContent=dark?'Light mode':'Dark mode';send({method:'ui/notifications/host-context-changed',params:{theme:dark?'dark':'light'}})};
</script></html>`;
const port = Number(process.env.ZINE_UI_PREVIEW_PORT || 8797);
const server = createServer((request, response) => {
  const path = new URL(request.url, `http://127.0.0.1:${port}`).pathname;
  if (path !== '/' && path !== '/component') {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(path === '/component' ? libraryHtml : host);
});
server.listen(port, '127.0.0.1', () =>
  console.log(`Sample component preview: http://127.0.0.1:${port}`)
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => server.close(() => process.exit(0)));
