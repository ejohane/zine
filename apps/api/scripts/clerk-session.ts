/** Real password authentication through Clerk FAPI; no bypass or minted identity. */
export async function realSession(origin = 'https://api-next.myzine.app') {
  if (!['https://api-next.myzine.app', 'https://api-next-staging.myzine.app'].includes(origin))
    throw new Error('Use an approved independent API origin');
  const email = process.env.ZINE_TEST_USER_EMAIL;
  const password = process.env.ZINE_TEST_USER_PASSWORD;
  if (!email || !password)
    throw new Error('Use secretsctl run zine.test to inject the existing login credentials');
  const issuer = 'https://clerk.myzine.app';
  const cookies = new Map<string, string>();
  async function call(path: string, body?: Record<string, string>) {
    const response = await fetch(`${issuer}/v1${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        origin,
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
        ...(cookies.size
          ? { cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; ') }
          : {}),
      },
      body: body ? new URLSearchParams(body) : undefined,
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const first = cookie.split(';')[0];
      const equal = first.indexOf('=');
      if (equal > 0) cookies.set(first.slice(0, equal), first.slice(equal + 1));
    }
    const value = (await response.json()) as {
      response?: Record<string, unknown>;
      client?: Record<string, unknown>;
      jwt?: string;
      errors?: { code?: string }[];
    };
    if (!response.ok)
      throw new Error(
        `Clerk HTTP ${response.status}: ${value.errors?.[0]?.code ?? 'request_failed'}`
      );
    return value;
  }
  await call('/client');
  const signIn = await call('/client/sign_ins', {
    identifier: email,
    password,
    strategy: 'password',
  });
  const attempt = signIn.response;
  if (attempt?.status !== 'complete' || typeof attempt.created_session_id !== 'string')
    throw new Error(
      `Clerk sign-in requires ${String(attempt?.status ?? 'additional_verification')}`
    );
  const sessionId = attempt.created_session_id;
  let cachedToken: string | undefined;
  let expiresAt = 0;
  async function getToken() {
    if (cachedToken && expiresAt > Date.now() + 15000) return cachedToken;
    const response = await call(`/client/sessions/${sessionId}/tokens`, {});
    const jwt = response.response?.jwt ?? response.jwt;
    if (typeof jwt !== 'string') throw new Error('Clerk did not return a session token');
    const claims = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
    cachedToken = jwt;
    expiresAt = Number(claims.exp) * 1000;
    return jwt;
  }
  return {
    getToken,
    async close() {
      await call(`/client/sessions/${sessionId}/remove`, {});
      cookies.clear();
    },
  };
}
