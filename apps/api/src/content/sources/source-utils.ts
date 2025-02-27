export enum Source {
  Spotify = "spotify",
  Youtube = "youtube",
  X = "x",
  Unknown = "unknown",
}

export const isSourceType = (str: string | undefined): str is Source =>
  Object.values(Source).includes(str as Source);
