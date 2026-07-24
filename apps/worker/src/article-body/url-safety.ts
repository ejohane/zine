function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  return (
    parts[0] === 0 ||
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] >= 224
  );
}

export function isSafePublicArticleUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
      return false;
    }
    const hostname = url.hostname.toLocaleLowerCase().replace(/^\[|\]$/g, '');
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      isPrivateIpv4(hostname) ||
      hostname === '::1' ||
      (hostname.includes(':') &&
        (hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80:')))
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
