function isPrivateOrLoopbackIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map((segment) => Number.parseInt(segment, 10));

  if (octets.length !== 4 || octets.some((octet) => Number.isNaN(octet))) {
    return false;
  }

  const [first, second] = octets;

  if (first === 10 || first === 127) return true;
  if (first === 169 && second === 254) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;

  // Tailscale uses CGNAT space (100.64.0.0/10).
  if (first === 100 && second >= 64 && second <= 127) return true;

  return false;
}

export function isDevelopmentOrigin(origin: string): boolean {
  let url: URL;

  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  if (url.protocol !== 'http:') {
    return false;
  }

  const hostname = url.hostname.toLowerCase();

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '10.0.2.2') {
    return true;
  }

  if (hostname === '::1' || hostname === '[::1]') {
    return true;
  }

  if (
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.ts.net')
  ) {
    return true;
  }

  return isPrivateOrLoopbackIpv4(hostname);
}

export function resolveCorsOrigin(origin: string, environment?: string): string | null {
  const resolvedEnvironment = environment || 'development';

  if (resolvedEnvironment === 'development' && isDevelopmentOrigin(origin)) {
    return origin;
  }

  if (origin === 'https://myzine.app') return origin;
  if (origin === 'https://www.myzine.app') return origin;

  return null;
}
