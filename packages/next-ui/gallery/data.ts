import samples from '../../../apps/next-web/src/data/DevSamples.json';
import type { CardItem, ItemKind } from '../src/types';

interface Sample {
  id: string;
  section: string;
  title: string;
  author: string;
  note: string;
  duration: string;
  url: string;
  image?: string;
}

const KIND: Record<string, ItemKind> = {
  Articles: 'article',
  Podcasts: 'podcast',
  Videos: 'video',
  Posts: 'post',
};
const DAY = 86_400_000;
export const NOW = new Date('2026-11-25T12:00:00Z');

/** The repo's sample saves, mapped onto the card model. Save dates are invented; the samples have none. */
export const items: CardItem[] = (samples as Sample[]).map((sample, index) => {
  const kind = KIND[sample.section];
  const handle = sample.author.match(/\((@[^)]+)\)$/)?.[1];
  const minutes = Number(sample.duration.match(/^(\d+) min/)?.[1]);
  const picture = sample.image
    ? { url: `artwork/${sample.image}.jpg`, width: 16, height: kind === 'podcast' ? 16 : 9 }
    : undefined;
  return {
    id: sample.id,
    kind,
    url: sample.url,
    title: sample.title,
    creator: { name: sample.author.replace(/ \(@[^)]+\)$/, ''), handle },
    description: kind === 'post' ? undefined : sample.note,
    body: kind === 'post' || !picture ? sample.note : undefined,
    picture,
    durationMinutes: minutes || undefined,
    savedAt: new Date(NOW.getTime() - (index + 1) * 1.7 * DAY).toISOString(),
  };
});

export const find = (start: string): CardItem => {
  const item = items.find((candidate) => candidate.title?.startsWith(start));
  if (!item) throw new Error(`No sample starts with "${start}"`);
  return item;
};

const saved = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

/** Invented posts for the cases the samples lack: media, a quote and a link. Pictures are borrowed sample artwork. */
export const posts: Record<'text' | 'wide' | 'tall' | 'quote' | 'link', CardItem> = {
  text: {
    id: 'post-text',
    kind: 'post',
    url: 'https://example.test/post/text',
    creator: { name: 'Mara Lind', handle: '@mara' },
    body: 'The best tools disappear into the work. You stop noticing them the moment they start being good.\nMost of what we call polish is removing the moments where the tool reminds you it is there.\nThat is slow, unglamorous work, and nobody thanks you for it, which is exactly how you know it worked.',
    savedAt: saved(0.1),
  },
  wide: {
    id: 'post-wide',
    kind: 'post',
    url: 'https://example.test/post/wide',
    creator: { name: 'Jonas Reed', handle: '@jonasreed' },
    body: 'No pull requests, no code review. We push to main.\nHere is how we make that safe:',
    picture: { url: 'artwork/Dev8f0124ab9225.jpg', width: 16, height: 9, isVideo: true },
    savedAt: saved(30),
  },
  tall: {
    id: 'post-tall',
    kind: 'post',
    url: 'https://example.test/post/tall',
    creator: { name: 'Ines Okafor', handle: '@ines' },
    body: 'Sharing a tool I have been using to build personal apps.\nIt is for trying layouts on an actual phone.\n1. Pick a screen\n2. Tweak sizes and tint',
    picture: { url: 'artwork/Devfeba96b0d3a1.jpg', width: 4, height: 5, isVideo: true },
    savedAt: saved(0.05),
  },
  quote: {
    id: 'post-quote',
    kind: 'post',
    url: 'https://example.test/post/quote',
    creator: { name: 'Peter Vale', handle: '@pvale' },
    body: 'What a year this has been. Time to reflect and write it up over the holidays.\nShipping reliable, free software is really hard, and I am glad the team is taking over most of it.',
    quote: {
      creator: { name: 'Atlas Weekly', handle: '@atlasweekly' },
      text: 'It is our one year anniversary.\nThe best part of building in the open has been seeing what you made with it.',
      picture: { url: 'artwork/Dev395d1f1a16ea.jpg', width: 1100, height: 577 },
    },
    savedAt: saved(0.005),
  },
  link: {
    id: 'post-link',
    kind: 'post',
    url: 'https://example.test/post/link',
    creator: { name: 'Dara Quinn', handle: '@daraquinn' },
    body: 'Today, we are announcing Recent.\nIt is here: example.test',
    link: 'example.test',
    savedAt: saved(31),
  },
};
