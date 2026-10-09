import type { z } from 'zod';
import type { CreateWeeklyRecapIssueSchema } from '../../../../packages/shared/src/schemas/weekly-recaps';
import { PublicationError } from '../publications/errors';
import { PublicationService } from '../publications/service';
import { requestHash } from '../publications/repository';
import { WeeklyRecapService } from './service';
type Intent = { request_hash: string; window_id: string; title: string; saved_ids: string };

export async function createWeeklyIssue(
  db: D1Database,
  owner: string,
  weekStart: string,
  input: z.infer<typeof CreateWeeklyRecapIssueSchema>,
  key: string
) {
  const hash = await requestHash({ weekStart, ...input });
  let intent = await db
    .prepare('SELECT * FROM weekly_recap_draft_requests WHERE user_id=? AND key=?')
    .bind(owner, key)
    .first<Intent>();
  if (intent && intent.request_hash !== hash)
    throw new PublicationError('IDEMPOTENCY_CONFLICT', 409);
  const recap = await new WeeklyRecapService(db).get(owner, weekStart);
  if (!intent) {
    const selected = input.selectedCandidateIds.map((id) => {
      const candidate = recap.candidates.find((c) => c.id === id);
      if (!candidate)
        throw new PublicationError('INVALID_INPUT', 400, { reason: 'FOREIGN_CANDIDATE' });
      if (!candidate.savedBookmarkId)
        throw new PublicationError('INELIGIBLE_SELECTIONS', 422, {
          candidateId: id,
          reason: 'NOT_SAVED',
        });
      if (candidate.publicationEligibility === 'PRIVATE_SOURCE')
        throw new PublicationError('INELIGIBLE_SELECTIONS', 422, {
          candidateId: id,
          reason: 'PRIVATE_SOURCE',
        });
      return candidate.savedBookmarkId;
    });
    await db
      .prepare(
        'INSERT OR IGNORE INTO weekly_recap_draft_requests(user_id,key,request_hash,window_id,title,saved_ids) VALUES(?,?,?,?,?,?)'
      )
      .bind(
        owner,
        key,
        hash,
        recap.id,
        input.title ?? `Week of ${weekStart}`,
        JSON.stringify(selected)
      )
      .run();
    intent = await db
      .prepare('SELECT * FROM weekly_recap_draft_requests WHERE user_id=? AND key=?')
      .bind(owner, key)
      .first<Intent>();
    if (intent!.request_hash !== hash) throw new PublicationError('IDEMPOTENCY_CONFLICT', 409);
  }
  return new PublicationService(db).createIssue(
    owner,
    intent!.title,
    key,
    {
      id: intent!.window_id,
      timezone: recap.timezone,
      startAt: Date.parse(recap.startAt),
      endAt: Date.parse(recap.endAt),
    },
    JSON.parse(intent!.saved_ids) as string[]
  );
}
