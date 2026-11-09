import { openApiDocument } from './openapi';

export function apiReference() {
  const paths = openApiDocument().paths as Record<string, Record<string, { summary: string }>>;
  const escape = (text: string) =>
    text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const rows = Object.entries(paths)
    .flatMap(([path, methods]) =>
      Object.entries(methods).map(
        ([method, operation]) =>
          `<tr><td><strong>${escape(method.toUpperCase())}</strong></td><td><code>${escape(path)}</code></td><td>${escape(operation.summary)}</td></tr>`
      )
    )
    .join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Zine API reference</title>
<style>body{font:16px/1.6 system-ui,sans-serif;color:#20211f;background:#f7f7f5;max-width:1100px;margin:40px auto;padding:0 24px}h1{font-size:30px}a{color:#263b2c}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:12px 8px;border-bottom:1px solid #c9cdc5;vertical-align:top}code{font:13px/1.6 ui-monospace,monospace;overflow-wrap:anywhere}p{max-width:72ch}a:focus-visible{outline:3px solid #205ec2;outline-offset:3px}@media(max-width:700px){table,tbody,tr,td{display:block}th,thead{display:none}td{border:0;padding:4px}tr{padding:12px 0;border-bottom:1px solid #c9cdc5}}</style>
<h1>Zine API reference</h1><p>Save references, retain personal context, enrich understanding and retrieve it across experiences. All personal operations require a Bearer token. Saving is durable before background enrichment begins.</p>
<p><a href="/openapi.json">Download the OpenAPI contract</a> · <a href="/">Open the authenticated inspector</a></p>
<p>Use Idempotency-Key when saving. Browse defaults to saved items, including archived items. Transcripts and article text are requested separately or through include. Semantic indexing is eventually consistent; responses expose pending index work.</p>
<table><thead><tr><th>Method</th><th>Path</th><th>Operation</th></tr></thead><tbody>${rows}</tbody></table></html>`;
}
