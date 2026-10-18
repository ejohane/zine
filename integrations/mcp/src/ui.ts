import template from './ui/library.html';
import { SemanticColorRoles } from '../../../packages/design-system/src/foundations';

export const LIBRARY_UI_URI = 'ui://zine/saved-library-v5.html';
// Only established public artwork CDNs. Other artwork gets a text-first card;
// the component never fetches arbitrary saved URLs or sends OAuth credentials.
export const ARTWORK_ORIGINS = [
  'https://i.ytimg.com',
  'https://i.scdn.co',
  'https://pbs.twimg.com',
  'https://substackcdn.com',
  'https://substack-post-media.s3.amazonaws.com',
  // Existing shared card-fixture artwork (including its image redirect origin).
  'https://picsum.photos',
  'https://fastly.picsum.photos',
];

const variables = (mode: 'light' | 'dark') =>
  Object.entries(SemanticColorRoles[mode])
    .map(([name, value]) => `--${name}:${value}`)
    .join(';');

export const libraryHtml = template
  .replace(
    '/* THEME_TOKENS */',
    `:root{${variables('light')}} :root[data-theme="dark"]{${variables('dark')}} @media(prefers-color-scheme:dark){:root:not([data-theme="light"]){${variables('dark')}}}`
  )
  .replace('/* ARTWORK_ORIGINS */ []', JSON.stringify(ARTWORK_ORIGINS));
