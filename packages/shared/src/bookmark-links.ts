/** Account-scoped destinations: possession of a link does not grant access. */
export function bookmarkLinks(bookmarkId: string) {
  const id = encodeURIComponent(bookmarkId);
  return {
    zineUrl: `https://myzine.app/item/${id}`,
    nativeUrl: `zine://item/${id}`,
  };
}
