export type CollectorSource = {
  type: 'FOLLOWING' | 'FAVORITES' | 'LIST';
  id: string;
  name: string;
  url: string;
};

export function resolveCollectorSource(input: {
  type?: string;
  id?: string;
  name?: string;
  url?: string;
}): CollectorSource {
  const type = (input.type ?? 'FOLLOWING').toUpperCase();
  if (type !== 'FOLLOWING' && type !== 'FAVORITES' && type !== 'LIST') {
    throw new Error('--source-type must be FOLLOWING, FAVORITES, or LIST');
  }

  if (type === 'FOLLOWING') {
    if (input.id && input.id !== 'following') {
      throw new Error('Following source id must be following');
    }
    if (input.url) {
      const sourceURL = new URL(input.url);
      if (
        sourceURL.protocol !== 'https:' ||
        !['x.com', 'www.x.com'].includes(sourceURL.hostname) ||
        sourceURL.pathname !== '/home'
      ) {
        throw new Error('Following source URL must be https://x.com/home');
      }
    }
    return {
      type,
      id: 'following',
      name: input.name ?? 'Following',
      url: 'https://x.com/home',
    };
  }

  if (!input.url) throw new Error('--source-url is required for list sources');
  const sourceURL = new URL(input.url);
  if (sourceURL.protocol !== 'https:' || !['x.com', 'www.x.com'].includes(sourceURL.hostname)) {
    throw new Error('--source-url must be an https://x.com/i/lists/<id> URL');
  }
  const match = sourceURL.pathname.match(/^\/i\/lists\/(\d+)\/?$/);
  if (!match) throw new Error('--source-url must be an https://x.com/i/lists/<id> URL');
  const id = `x-list:${match[1]}`;
  if (input.id && input.id !== id) {
    throw new Error(`--source-id must match the list URL (${id})`);
  }
  return {
    type,
    id,
    name: input.name ?? (type === 'FAVORITES' ? 'Favorites' : `List ${match[1]}`),
    url: `https://x.com/i/lists/${match[1]}`,
  };
}
