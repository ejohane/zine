/** Local-only persisted REST smoke. Inject credentials using secretsctl; never logs auth material. */
import { readFile } from 'node:fs/promises';
import { ulid } from 'ulid';
const base = new URL(process.argv[2] || 'http://localhost:8785/api/v1/');
if (base.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))
  throw new Error('Verification requires an explicit loopback local Worker');
if (!base.pathname.endsWith('/')) base.pathname += '/';
if (!process.env.ZINE_TEST_USER_EMAIL || !process.env.ZINE_TEST_USER_PASSWORD)
  throw new Error('Run with secretsctl run zine.test');
let token = '',
  issueId = '';
async function call(path: string, method = 'GET', input?: unknown, anonymous = false) {
  const response = await fetch(new URL(path.replace(/^\//, ''), base), {
    method,
    signal: AbortSignal.timeout(30_000),
    headers: {
      ...(anonymous ? {} : { Authorization: `Bearer ${token}` }),
      'Content-Type': input instanceof Uint8Array ? 'image/png' : 'application/json',
      'Idempotency-Key': ulid(),
    },
    ...(input === undefined
      ? {}
      : { body: input instanceof Uint8Array ? input : JSON.stringify(input) }),
  });
  console.log(JSON.stringify({ operation: `${method} ${path}`, status: response.status }));
  return response;
}
async function json(path: string, method = 'GET', input?: unknown, anonymous = false) {
  const response = await call(path, method, input, anonymous);
  if (!response.ok) throw new Error('REST verification failed');
  return response.json();
}
try {
  const response = await fetch('https://clerk.myzine.app/v1/client/sign_ins', {
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://myzine.app' },
    body: new URLSearchParams({
      identifier: process.env.ZINE_TEST_USER_EMAIL,
      password: process.env.ZINE_TEST_USER_PASSWORD,
      strategy: 'password',
    }),
  });
  const result = await response.json();
  const session = result.client?.sessions?.find(
    (s: { id: string }) => s.id === result.response?.created_session_id
  );
  token = session?.last_active_token?.jwt;
  if (!response.ok || !token) throw new Error('Clerk verification login failed');
  console.log(
    JSON.stringify({
      realClerkSession: true,
      subjectMatchesDefaultSnapshot: session.user?.id === 'user_31ejjz59G6mTX1SIyErOi0fwu4A',
    })
  );
  const existing = await call('/me/publication');
  if (!existing.ok && existing.status !== 404) throw new Error('Publication lookup failed');
  if (existing.status === 404)
    await json('/me/publication', 'POST', {
      editorName: 'Local foundation verifier',
      displayName: 'Foundation verification',
      description: null,
      coverAssetId: null,
    });
  const bookmarks = await json('/bookmarks?contentType=ARTICLE&provider=WEB&limit=50');
  const bookmark = bookmarks.items[0];
  if (!bookmark) throw new Error('Local snapshot needs an eligible saved WEB article');
  let issue = (
    await json('/me/publication/issues', 'POST', {
      kind: 'INDEPENDENT',
      title: 'Local foundation verification',
    })
  ).issue;
  issueId = issue.id;
  const png = new Uint8Array(
    await readFile(
      new URL(
        '../apps/ios/ZineNative/Resources/Assets.xcassets/ZineMark.imageset/ZineMark.png',
        import.meta.url
      )
    )
  );
  const { asset } = await json('/me/publication-assets', 'POST', png);
  issue = (
    await json(`/me/issues/${issueId}`, 'PATCH', {
      expectedRevision: issue.revision,
      operations: [
        {
          type: 'addSelection',
          selectionId: ulid(),
          sectionId: issue.sections[0].id,
          bookmarkId: bookmark.id,
          commentary: 'Local verification selection',
        },
        { type: 'setPresentation', coverAssetId: asset.id },
      ],
    })
  ).issue;
  if ((await call(`/issues/${issueId}`, 'GET', undefined, true)).status !== 404)
    throw new Error('Draft became public');
  if ((await call(`/publication-assets/${asset.id}`, 'GET', undefined, true)).status !== 404)
    throw new Error('Draft cover became public');
  issue = (
    await json(`/me/issues/${issueId}/publish`, 'POST', { expectedRevision: issue.revision })
  ).issue;
  const publicIssue = (await json(`/issues/${issueId}`, 'GET', undefined, true)).issue;
  const selections = publicIssue.sections.flatMap(
    (section: { selections: Record<string, unknown>[] }) => section.selections
  );
  if (
    !selections.length ||
    selections.some(
      (selection: Record<string, unknown>) => 'itemId' in selection || 'bookmarkId' in selection
    )
  )
    throw new Error('Public projection failed');
  const cover = await call(`/publication-assets/${asset.id}`, 'GET', undefined, true);
  const bytes = new Uint8Array(await cover.arrayBuffer());
  if (
    !cover.ok ||
    cover.headers.get('Content-Type') !== 'image/jpeg' ||
    bytes[0] !== 255 ||
    bytes[1] !== 216
  )
    throw new Error('Sanitized cover failed');
  await json(`/me/issues/${issueId}`, 'DELETE', { expectedRevision: issue.revision });
  if (
    (await call(`/issues/${issueId}`, 'GET', undefined, true)).status !== 404 ||
    (await call(`/publication-assets/${asset.id}`, 'GET', undefined, true)).status !== 404
  )
    throw new Error('Unavailable projection failed');
  issueId = '';
  console.log(
    'PASS: persisted composition, private draft, explicit publish, public projection, decoded JPEG cover and deletion'
  );
} catch {
  console.error('FAIL: local foundation verification; credentials and auth responses omitted');
  process.exitCode = 1;
} finally {
  if (issueId && token) {
    try {
      const { issue } = await json(`/me/issues/${issueId}`);
      await json(`/me/issues/${issueId}`, 'DELETE', { expectedRevision: issue.revision });
    } catch {
      console.error('Local disposable issue cleanup requires inspection');
      process.exitCode = 1;
    }
  }
  token = '';
}
