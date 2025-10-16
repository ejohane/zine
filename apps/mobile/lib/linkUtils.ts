const URL_REGEX = /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/gi;

export interface TextSegment {
  text: string;
  isLink: boolean;
}

export function parseTextWithLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  const matches = text.matchAll(URL_REGEX);

  for (const match of matches) {
    const url = match[0];
    const startIndex = match.index ?? 0;

    if (startIndex > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, startIndex),
        isLink: false,
      });
    }

    segments.push({
      text: url,
      isLink: true,
    });

    lastIndex = startIndex + url.length;
  }

  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      isLink: false,
    });
  }

  return segments;
}
