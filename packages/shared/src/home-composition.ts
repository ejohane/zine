import { z } from 'zod';

const id = z.string().trim().min(1).max(128);
export const HomeCompositionSchema = z
  .object({
    version: z.literal(1),
    sections: z
      .array(
        z
          .object({
            id,
            title: z
              .string()
              .trim()
              .min(1)
              .max(60)
              .regex(/^[^\r\n]+$/)
              .optional(),
            layout: z.enum(['single', 'horizontal', 'two_column', 'vertical']),
            card: z.enum(['featured', 'landscape', 'cover', 'compact', 'tile', 'row', 'grid']),
            itemIds: z.array(id).min(1).max(20),
          })
          .strict()
      )
      .max(12),
  })
  .strict()
  .superRefine((composition, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (new Set(composition.sections.map((s) => s.id)).size !== composition.sections.length)
      fail('Section IDs must be unique');
    if (composition.sections.reduce((n, s) => n + s.itemIds.length, 0) > 100)
      fail('At most 100 item placements');
    for (const s of composition.sections) {
      if (new Set(s.itemIds).size !== s.itemIds.length) fail('No duplicate items within a section');
      if (s.layout === 'single' && s.itemIds.length !== 1)
        fail('Single layouts require exactly one item');
      if (['landscape', 'cover'].includes(s.card) && s.layout !== 'horizontal')
        fail('Landscape and cover cards use horizontal rails');
      if (s.card === 'grid' && s.layout !== 'two_column') fail('Grid cards use two_column');
      if (s.card === 'featured' && s.layout !== 'single')
        fail('Featured cards use a single layout');
      if (s.card === 'row' && s.layout !== 'vertical') fail('Rows use a vertical layout');
      if (s.card === 'tile' && !['two_column', 'vertical'].includes(s.layout))
        fail('Tiles use two_column or vertical layouts');
      if (s.card === 'compact' && !['horizontal', 'vertical'].includes(s.layout))
        fail('Compact cards use horizontal or vertical layouts');
    }
  });
export type HomeComposition = z.infer<typeof HomeCompositionSchema>;
export const HOME_NATIVE_COMPONENTS = {
  version: 1,
  cards: ['featured', 'landscape', 'cover', 'compact', 'tile', 'row', 'grid'],
  layouts: ['single', 'horizontal', 'two_column', 'vertical'],
  rules: [
    'Home Lab has one persisted arrangement. Sections are its current custom collections, not permanent Library collections. Publishing replaces the whole arrangement; removed collections do not accumulate. An empty sections array clears Home Lab without deleting saved items.',
    'Compose real Zine inbox/library user-item IDs. The server supplies current titles, covers, creators and metadata.',
    'Only short optional section headings are authored. No editorial stories, summaries, paragraphs, HTML, CSS or actions.',
    'Landscape and cover cards use horizontal; grid cards use two_column. Featured cards display articles and use single; rows use vertical; tiles use two_column or vertical; compact cards use horizontal or vertical.',
    'Use up to 12 sections and 100 item placements. Repeating an item across different sections is allowed, as on Home.',
    'Completed, archived, deleted and unavailable items disappear automatically. Native Home owns navigation and appearance.',
  ],
};
