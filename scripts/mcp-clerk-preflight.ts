/** Read-only OAuth readiness inspection. Never registers clients or creates grants. */
const issuer = 'https://clerk.myzine.app';
const settingsUrl = 'https://api.clerk.com/v1/instance/oauth_application_settings';
const settingNames = [
  'aud_claim_enabled',
  'aud_claim_refresh_backfill_enabled',
  'oauth_jwt_access_tokens',
  'pkce_required',
  'client_id_metadata_documents_advertised',
  'dynamic_oauth_client_registration',
  'client_id_metadata_documents_only_allow_pre_registered_clients',
] as const;

export async function inspectClerk(fetcher: typeof fetch = fetch, secret?: string) {
  const discovery = await fetcher(`${issuer}/.well-known/oauth-authorization-server`, {
    redirect: 'error',
  });
  if (!discovery.ok) throw new Error('Public discovery could not be read');
  const metadata = (await discovery.json()) as Record<string, unknown>;
  if (metadata.issuer !== issuer) throw new Error('Unexpected issuer');
  const report: Record<string, unknown> = {
    issuer,
    authorization_endpoint: metadata.authorization_endpoint,
    token_endpoint: metadata.token_endpoint,
    jwks_uri: metadata.jwks_uri,
    supported_scopes: metadata.scopes_supported,
    s256_advertised:
      Array.isArray(metadata.code_challenge_methods_supported) &&
      metadata.code_challenge_methods_supported.includes('S256'),
    issuer_response_advertised: metadata.authorization_response_iss_parameter_supported === true,
    cimd_advertised: metadata.client_id_metadata_document_supported === true,
    dcr_advertised: typeof metadata.registration_endpoint === 'string',
    private_settings: 'NOT_INSPECTED_NO_APPROVED_SECRET',
  };
  if (secret) {
    const response = await fetcher(settingsUrl, {
      method: 'GET',
      redirect: 'error',
      headers: { Authorization: `Bearer ${secret}`, 'Clerk-API-Version': '2026-05-12' },
    });
    if (!response.ok)
      throw new Error(
        `Private settings inspection failed (HTTP ${response.status}); response not logged`
      );
    const settings = (await response.json()) as Record<string, unknown>;
    report.private_settings = Object.fromEntries(
      settingNames.map((name) => [name, settings[name] ?? 'NOT_RETURNED'])
    );
  }
  return report;
}

if (import.meta.main) {
  try {
    const withPrivateSettings = process.argv.includes('--with-private-settings');
    if (withPrivateSettings && !process.env.MCP_CLERK_SECRET_KEY)
      throw new Error(
        'An approved existing Clerk secret is required for private settings inspection'
      );
    console.log(
      JSON.stringify(
        await inspectClerk(
          fetch,
          withPrivateSettings ? process.env.MCP_CLERK_SECRET_KEY : undefined
        ),
        null,
        2
      )
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Preflight failed');
    process.exitCode = 1;
  }
}
