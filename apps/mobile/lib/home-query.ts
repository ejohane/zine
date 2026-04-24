import { ContentType } from '@zine/shared';

export const HOME_SECTION_LIMIT = 20;
export const HOME_JUMP_BACK_IN_LIMIT = 20;

export type HomeItemsOptions = {
  filter?: {
    contentType?: ContentType;
  };
};

export type HomeQueryInput = {
  filter?: {
    contentType?: ContentType;
  };
};

const HOME_FILTER_CONTENT_TYPES = Object.values(ContentType);

export function buildHomeItemsInput(options?: HomeItemsOptions): HomeQueryInput | undefined {
  const filter = options?.filter?.contentType
    ? { contentType: options.filter.contentType }
    : undefined;

  return filter ? { filter } : undefined;
}

export function matchesHomeQueryContentType(
  input: HomeQueryInput | undefined,
  contentType: ContentType
): boolean {
  return !input?.filter?.contentType || input.filter.contentType === contentType;
}

export function getAllHomeQueryInputs(): Array<HomeQueryInput | undefined> {
  return [
    undefined,
    ...HOME_FILTER_CONTENT_TYPES.map((contentType) => ({
      filter: { contentType },
    })),
  ];
}

export function getHomeQueryInputsForContentType(
  contentType?: ContentType
): Array<HomeQueryInput | undefined> {
  if (!contentType) {
    return [undefined];
  }

  return [undefined, { filter: { contentType } }];
}
