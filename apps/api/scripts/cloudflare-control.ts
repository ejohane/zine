/** Control-plane calls use the existing process credential; responses/errors never log secrets. */
export const accountId = '887513bb1f71a8ef2029e2f9bd3086b2';
export const environments = {
  production: {
    worker: 'zine-api-next',
    databaseId: '0e55836b-07de-426b-9977-b783b0ea6652',
    bucket: 'zine-api-next-artifacts',
    config: 'wrangler.jsonc',
    origin: 'https://api-next.myzine.app',
  },
  staging: {
    worker: 'zine-api-next-staging',
    databaseId: 'f467b228-5f55-447b-8dbc-006edea2f727',
    bucket: 'zine-api-next-staging-artifacts',
    config: 'wrangler.staging.jsonc',
    origin: 'https://api-next-staging.myzine.app',
  },
} as const;
export async function cloudflare<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('Cloudflare credential missing');
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/${path}`,
    {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(60000),
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }
  );
  const value = (await response.json()) as {
    success: boolean;
    result: T;
    errors?: { code: number }[];
  };
  if (!response.ok || !value.success)
    throw new Error(
      `Cloudflare control request failed (${response.status}; codes=${value.errors?.map((e) => e.code).join(',') ?? 'none'}); response details suppressed`
    );
  return value.result;
}
