export interface VerificationLimits {
  ENVIRONMENT?: string;
  MCP_VERIFICATION_LIMITER?: Pick<RateLimit, 'limit'>;
}

function unavailable() {
  return Response.json(
    { error: 'VERIFICATION_UNAVAILABLE' },
    { status: 503, headers: { 'Retry-After': '5', 'Cache-Control': 'no-store' } }
  );
}

/** Before opaque-token verification, never keyed by attacker-controlled tokens. */
export async function throttleVerification(
  request: Request,
  env: VerificationLimits
): Promise<Response | null> {
  const limiter = env.MCP_VERIFICATION_LIMITER;
  if (!limiter) return env.ENVIRONMENT === 'production' ? unavailable() : null;
  // Cloudflare overwrites this header at the public edge. Production must have
  // no alternate non-Cloudflare origin. Never trust X-Forwarded-For as fallback.
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip || !/^[0-9a-fA-F:.]{3,45}$/.test(ip)) return unavailable();
  try {
    const result = await limiter.limit({ key: `mcp-verify:${ip.toLowerCase()}` });
    if (result.success === true) return null;
    if (result.success !== false) return unavailable();
    return Response.json(
      { error: 'RATE_LIMITED' },
      { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } }
    );
  } catch {
    // Do not log upstream messages, tokens, request URLs or the client address.
    return unavailable();
  }
}
