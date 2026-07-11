import type { CitedText, DailyEdition } from '@zine/editorial-schema';

export function renderEditionMarkdown(edition: DailyEdition): string {
  const sourceNumbers = new Map(edition.sources.map((source, index) => [source.id, index + 1]));
  const claims = new Map(edition.claims.map((claim) => [claim.id, claim]));
  const cite = (value: CitedText) => {
    const numbers = new Set<number>();
    for (const claimId of value.claimIds) {
      for (const sourceId of claims.get(claimId)?.sourceIds ?? []) {
        const number = sourceNumbers.get(sourceId);
        if (number) numbers.add(number);
      }
    }
    const suffix = [...numbers]
      .sort((a, b) => a - b)
      .map((number) => `[${number}]`)
      .join('');
    return `${value.text}${suffix ? ` ${suffix}` : ''}`;
  };

  const lines = [`# ${edition.headline}`, '', edition.dek, '', `_${edition.editionDate}_`, ''];
  for (const paragraph of edition.briefing) lines.push(cite(paragraph), '');

  lines.push('## The stories', '');
  for (const story of [...edition.stories].sort((a, b) => a.rank - b.rank)) {
    lines.push(`### ${story.rank}. ${story.title}`, '');
    lines.push(cite(story.lede), '');
    lines.push(`**What happened:** ${cite(story.whatHappened)}`, '');
    lines.push(`**Why it matters:** ${cite(story.whyItMatters)}`, '');
    lines.push(`**The conversation:** ${cite(story.conversation)}`, '');
    lines.push(`**Editor’s analysis:** ${cite(story.editorialAnalysis)}`, '');
  }

  if (edition.recommendations.length > 0) {
    lines.push('## What to read, watch, and listen to', '');
    for (const recommendation of edition.recommendations) {
      const source = edition.sources.find((value) => value.id === recommendation.sourceId);
      lines.push(
        `- **${recommendation.priority.replace('_', ' ')} · ${recommendation.format}:** [${recommendation.title}](${source?.canonicalUrl ?? '#'}) — ${recommendation.reason}${recommendation.estimatedMinutes ? ` (${recommendation.estimatedMinutes} min)` : ''}`
      );
    }
    lines.push('');
  }

  if (edition.emergingSignals.length > 0) {
    lines.push('## Emerging signals', '');
    for (const signal of edition.emergingSignals) {
      lines.push(
        `### ${signal.title}`,
        '',
        cite(signal.summary),
        '',
        `**Why watch:** ${cite(signal.whyWatch)}`,
        ''
      );
    }
  }

  lines.push('## The bigger picture', '', cite(edition.bigPicture), '');
  if (edition.coverageNotes.length > 0) {
    lines.push('## Coverage notes', '');
    for (const note of edition.coverageNotes) lines.push(`- ${note}`);
    lines.push('');
  }

  lines.push('## Sources', '');
  edition.sources.forEach((source, index) => {
    const label = source.title ?? source.creator ?? source.canonicalUrl;
    lines.push(`${index + 1}. [${label}](${source.canonicalUrl})`);
  });
  lines.push('');
  return lines.join('\n');
}
