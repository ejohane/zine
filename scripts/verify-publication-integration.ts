/** Authenticated local integration only. Secrets stay in process memory, never files/output. */
import { writeFile, mkdir } from 'node:fs/promises';
import { ulid } from 'ulid';
import type {
  OwnerIssue,
  PublicIssue,
  OwnerPublication,
  SelectionSaveResult,
  WeeklyRecap,
} from '@zine/shared';
const base = new URL(process.argv[2] || 'http://localhost:8785/api/v1/');
if (base.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))
  throw new Error('Explicit loopback Worker required');
if (!base.pathname.endsWith('/')) base.pathname += '/';
let token = '',
  issueId = '';
async function call(
  path: string,
  method = 'GET',
  input?: unknown,
  anonymous = false,
  key = ulid()
) {
  const response = await fetch(new URL(path.replace(/^\//, ''), base), {
    method,
    signal: AbortSignal.timeout(45_000),
    headers: {
      ...(anonymous ? {} : { Authorization: `Bearer ${token}` }),
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
  console.log(JSON.stringify({ operation: `${method} ${path}`, status: response.status }));
  return response;
}
async function value<T>(
  path: string,
  method = 'GET',
  input?: unknown,
  anonymous = false,
  key?: string
): Promise<T> {
  const response = await call(path, method, input, anonymous, key);
  if (!response.ok) throw new Error('Local API operation failed');
  return response.json() as Promise<T>;
}
try {
  if (!process.env.ZINE_TEST_USER_EMAIL || !process.env.ZINE_TEST_USER_PASSWORD)
    throw new Error('Inject zine.test credentials');
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
  if (!response.ok || !token) throw new Error('Clerk login failed');
  console.log(
    JSON.stringify({
      realClerkSession: true,
      subjectMatchesLocalSnapshot: session.user?.id === 'user_31ejjz59G6mTX1SIyErOi0fwu4A',
    })
  );
  const { publication } = await value<{ publication: OwnerPublication }>('/me/publication');
  const bookmarks = await value<{ items: Array<{ id: string }> }>(
    '/bookmarks?contentType=ARTICLE&provider=WEB&limit=50'
  );
  const bookmark = bookmarks.items[0];
  if (!bookmark) throw new Error('No eligible local saved WEB article');
  const key = ulid();
  let { issue } = await value<{ issue: OwnerIssue }>(
    '/me/publication/issues',
    'POST',
    { kind: 'INDEPENDENT', title: 'A week of good reading' },
    false,
    key
  );
  issueId = issue.id;
  const replay = await value<{ issue: OwnerIssue }>(
    '/me/publication/issues',
    'POST',
    { kind: 'INDEPENDENT', title: 'A week of good reading' },
    false,
    key
  );
  if (replay.issue.id !== issueId) throw new Error('Create retry duplicated issue');
  const selectionId = ulid();
  ({ issue } = await value<{ issue: OwnerIssue }>(`/me/issues/${issueId}`, 'PATCH', {
    expectedRevision: issue.revision,
    operations: [
      {
        type: 'setPresentation',
        introduction: 'An issue assembled during local end-to-end verification.',
      },
      { type: 'setSectionHeading', sectionId: issue.sections[0].id, heading: 'Worth your time' },
      {
        type: 'addSelection',
        selectionId,
        sectionId: issue.sections[0].id,
        bookmarkId: bookmark.id,
        commentary: 'A selection from my saved reading.',
      },
    ],
  }));
  if ((await call(`/issues/${issueId}`, 'GET', undefined, true)).status !== 404)
    throw new Error('Draft leaked');
  const publishKey = ulid();
  ({ issue } = await value<{ issue: OwnerIssue }>(
    `/me/issues/${issueId}/publish`,
    'POST',
    { expectedRevision: issue.revision },
    false,
    publishKey
  ));
  const { issue: publicIssue } = await value<{ issue: PublicIssue }>(
    `/issues/${issueId}`,
    'GET',
    undefined,
    true
  );
  if (
    publicIssue.sections
      .flatMap((s) => s.selections)
      .some((s) => 'bookmarkId' in s || 'itemId' in s)
  )
    throw new Error('Public projection leaked owner fields');
  const saveKey = ulid();
  const saved = await value<SelectionSaveResult>(
    `/issues/${issueId}/selections/${selectionId}/save`,
    'POST',
    undefined,
    false,
    saveKey
  );
  const savedReplay = await value<SelectionSaveResult>(
    `/issues/${issueId}/selections/${selectionId}/save`,
    'POST',
    undefined,
    false,
    saveKey
  );
  if (
    saved.userItemId !== bookmark.id ||
    savedReplay.userItemId !== saved.userItemId ||
    savedReplay.discoveryReferences.filter((reference) => reference.selectionId === selectionId)
      .length !== 1
  )
    throw new Error('Save/provenance replay failed');
  await value(`/bookmarks/${saved.userItemId}/discovery-references`);
  await value(`/issues/${issueId}/visit`, 'PUT', { observedRevision: issue.revision });
  await value(`/issues/${issueId}/visit`);
  await value('/me/publication-activity');
  await value('/me/publication-delivery-preferences');
  const preferences = await value<{ preferences: { timezone: string } }>(
    '/me/weekly-recap-preferences'
  );
  const { recaps } = await value<{ recaps: WeeklyRecap[] }>('/me/weekly-recaps?limit=2');
  if (recaps.some((r) => r.selectedCandidateIds.length))
    throw new Error('Wrapped preselected content');
  if (
    recaps[0] &&
    (await call(`/me/weekly-recaps/${recaps[0].weekStart}`, 'GET', undefined, true)).status !== 401
  )
    throw new Error('Private recap accessible');
  if ((await call(`/publications/${publication.id}/subscription`, 'PUT')).status !== 409)
    throw new Error('Self-subscription allowed');
  await mkdir('.local-data', { recursive: true });
  await writeFile(
    '.local-data/publication-integration.json',
    JSON.stringify(
      {
        publicationId: publication.id,
        issueId,
        selectionId,
        bookmarkId: saved.userItemId,
        revision: issue.revision,
        timezone: preferences.preferences.timezone,
        recapWeeks: recaps.map((r) => r.weekStart),
      },
      null,
      2
    )
  );
  console.log(
    JSON.stringify({
      passed: true,
      localIssueId: issueId,
      localPublicationId: publication.id,
      recapCount: recaps.length,
      keptForNativeWebVerification: true,
    })
  );
} catch {
  console.error('FAIL: local integration; credentials and auth responses omitted');
  process.exitCode = 1;
  if (issueId && token) {
    try {
      const { issue } = await value<{ issue: OwnerIssue }>(`/me/issues/${issueId}`);
      await value(`/me/issues/${issueId}`, 'DELETE', { expectedRevision: issue.revision });
    } catch {
      console.error('Local verification issue cleanup needs inspection');
    }
  }
}
