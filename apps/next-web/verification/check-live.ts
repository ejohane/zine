// Independent authenticated readback. Never emit library bodies or credentials.
import { realSession } from '../../api/scripts/clerk-session';
import { ZineClient } from '../../api/client';
import { createHash } from 'node:crypto';
const input = JSON.parse(await Bun.stdin.text()) as {
  id: string;
  url: string;
  note: string;
  reason: string;
  secondReason: string;
  position?: number;
  completed?: boolean;
  archived?: boolean;
};
const session = await realSession();
try {
  const api = new ZineClient({ baseUrl: 'https://api-next.myzine.app', token: session.getToken });
  const me = await api.request<{ id: string }>('GET', '/v1/me');
  const item = await api.item(input.id);
  const assert = (ok: unknown, label: string) => {
    if (!ok) throw Error('Independent readback failed: ' + label);
  };
  assert(item.content.url === input.url, 'URL');
  for (const text of [input.note, input.reason, input.secondReason])
    assert(
      item.context.filter((entry) => entry.text === text).length === 1,
      'one durable context entry'
    );
  if (input.position !== undefined) assert(item.progress.position === input.position, 'position');
  if (input.completed !== undefined)
    assert(!!item.progress.completedAt === input.completed, 'completion');
  if (input.archived !== undefined) assert(item.archived === input.archived, 'archive');
  console.log(
    JSON.stringify({
      independentSession: true,
      ownerHash: createHash('sha256').update(me.id).digest('hex'),
      itemId: item.id,
      contextEntriesConfirmed: 3,
      position: item.progress.position,
      completed: !!item.progress.completedAt,
      archived: item.archived,
      revision: item.revision,
    })
  );
} finally {
  await session.close();
}
