// Local component integration harness. No OAuth, production requests or persistence.
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

async function componentBundle() {
  const bundle = await build({
    stdin: {
      contents:
        "export { libraryHtml } from './src/ui.ts'; export { SemanticColorRoles } from '../../packages/design-system/src/foundations.ts'; export { ItemCardFixtures } from '../../packages/design-system/src/fixtures/item-card.ts';",
      resolveDir: fileURLToPath(new URL('..', import.meta.url)),
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    loader: { '.html': 'text' },
    write: false,
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
  );
}
const { ItemCardFixtures, SemanticColorRoles } = await componentBundle();
let snapshot;
try {
  snapshot = JSON.parse(
    await readFile(new URL('../../../.local-data/mcp-ui-cards.json', import.meta.url), 'utf8')
  );
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (snapshot && !Array.isArray(snapshot.items)) throw new Error('Invalid card snapshot');
const scriptJson = (value) => JSON.stringify(value).replaceAll('<', '\\u003c');
const colors = SemanticColorRoles.dark;
const host = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zine UI playground</title>
<style>
:root{font-family:system-ui,-apple-system,sans-serif;color-scheme:dark;--shell:${colors.canvas};--text:${colors.primaryText};--muted:${colors.secondaryText};--surface:${colors.surface};--line:${colors.border}}
*{box-sizing:border-box}body{margin:0;padding:24px;background:var(--shell);color:var(--text);font-size:14px}header{max-width:850px;margin:0 auto 24px;display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between}header p{margin:0;line-height:1.5}header small{color:var(--muted)}.controls{display:flex;flex-wrap:wrap;gap:8px}button,select{font:inherit;padding:8px 10px;min-height:40px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--text);cursor:pointer}iframe{display:block;width:100%;max-width:640px;min-height:400px;border:0;border-radius:0;margin:auto;background:var(--shell)}@media(max-width:520px){body{padding:12px}}
</style>
<header><p><strong>Zine UI playground</strong><br><small>${snapshot ? 'Real saved-card snapshot' : 'Sample cards'} · local interactions only</small></p><div class="controls"><select id="size" aria-label="Preview width"><option value="640">Chat width</option><option value="390">Phone width</option><option value="850">Wide layout</option></select><button id="theme">Light mode</button><button id="reload">Reload design</button></div></header>
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
const previewSnapshot = ${scriptJson(snapshot ?? null)};
const previewItems = previewSnapshot?.items ?? samples;
const pageSize = previewSnapshot ? 6 : 4;
let dark = true;
let additions = [];
let toolCalls = [];
window.previewState = { additions, toolCalls };
function send(message){frame.contentWindow.postMessage({jsonrpc:'2.0',...message},location.origin)}
window.addEventListener('message',async event=>{
 if(event.source!==frame.contentWindow||event.origin!==location.origin||event.data?.jsonrpc!=='2.0')return;
 const m=event.data;
 if(m.method==='ui/initialize')send({id:m.id,result:{protocolVersion:'2026-01-26',hostInfo:{name:'zine-preview',version:'1'},hostCapabilities:{serverTools:{}},hostContext:{theme:dark?'dark':'light'}}});
 if(m.method==='ui/notifications/initialized')send({method:'ui/notifications/tool-result',params:{structuredContent:{data:{items:previewItems.slice(0,pageSize),query:'',completion:previewSnapshot?.completion || 'incomplete',nextCursor:previewItems.length>pageSize?'sample-page-2':null},untrusted:true},content:[]}});
 if(m.method==='ui/notifications/size-changed')frame.style.height=Math.min(4000,m.params.height+2)+'px';
 if(m.method==='tools/call'){
  const {name,arguments:a}=m.params;toolCalls.push({name,arguments:a});
  let data;
  let failure;
  await new Promise(r=>setTimeout(r,200));
  if(name==='search_saved'){
   if(a.query==='error')failure='INTERNAL_ERROR';
   else if(a.query==='permission')failure='permission';
   else {const matches=previewItems.filter(i=>((a.completion || 'incomplete')==='all'||Boolean(i.isFinished)===((a.completion || 'incomplete')==='completed'))&&(i.title+' '+(i.summary||'')+' '+i.url).toLowerCase().includes((a.query||'').toLowerCase()));data={items:a.cursor?matches.slice(pageSize):matches.slice(0,pageSize),query:a.query||'',completion:a.completion||'incomplete',nextCursor:!a.cursor&&matches.length>pageSize?'sample-page-2':null};}
  }
  if(name==='read_saved' && previewSnapshot) failure='CONTENT_UNAVAILABLE';
  else if(name==='read_saved')data={bookmarkId:a.bookmarkId,available:a.bookmarkId!=='missing',content:a.bookmarkId==='missing'?'':a.offset?'The next section of stored text.':'This is sample stored article text for the component preview. It demonstrates the reader interaction; it is not an excerpt from the linked page.\\n\\nA useful interface lets you inspect a result, make a choice, and continue your conversation.\\n\\n<script>Untrusted article text stays text.<\\/script>',nextOffset:a.bookmarkId==='missing'||a.offset?null:320};
  if(name==='list_collections')data={collections:[{id:'research',name:'Research'},{id:'weekend',name:'Weekend reading'}],nextCursor:null};
  if(name==='add_to_collection'){additions.push(a);data={...a,added:true};}
  send({id:m.id,result:failure?{isError:true,content:[{type:'text',text:failure}],...(failure==='permission'?{_meta:{'mcp/www_authenticate':['Bearer scope="bookmarks:read"']}}:{})}:{structuredContent:{data,untrusted:true},content:[]}});
 }
});
document.querySelector('#size').onchange=(event)=>{frame.style.maxWidth=event.target.value+'px'};
document.querySelector('#reload').onclick=()=>{frame.src='/component?reload='+Date.now()};
document.querySelector('#theme').onclick=()=>{dark=!dark;document.querySelector('#theme').textContent=dark?'Light mode':'Dark mode';send({method:'ui/notifications/host-context-changed',params:{theme:dark?'dark':'light'}})};
</script></html>`;
const port = Number(process.env.ZINE_UI_PREVIEW_PORT || 8797);
const server = createServer(async (request, response) => {
  const path = new URL(request.url, `http://127.0.0.1:${port}`).pathname;
  if (path !== '/' && path !== '/component') {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  try {
    response.end(path === '/component' ? (await componentBundle()).libraryHtml : host);
  } catch {
    response.end(
      '<p>The component could not build. Check the local terminal, fix the source, and reload.</p>'
    );
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(
    `Zine UI playground: http://127.0.0.1:${port} (${snapshot ? 'real card snapshot' : 'sample data'})`
  )
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => server.close(() => process.exit(0)));
