export function isPublicPath(pathname: string) {
  return /^\/(p|i)(\/|$)/.test(pathname);
}
