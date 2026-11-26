export interface Env {
  /** Optional deployment-time usage policy. */
  USAGE_LIMITS_JSON?: string;
  /** Internal request marker; never caller-controlled or a deployed binding. */
  OPERATION_USAGE_OWNER?: string;
  OPERATION_EPOCH?: { owner: string; generation: number };
  RELEASE_SHA?: string;
  DEPLOYMENT?: WorkerVersionMetadata;
  DB: D1Database;
  ARTIFACTS: R2Bucket;
  JOBS: Queue<{ jobId: string }>;
  VECTORS?: VectorizeIndex;
  AI?: Ai;
  ENVIRONMENT: string;
  AUTH_ISSUER: string;
  AUTH_AUDIENCE: string;
  AUTH_JWKS_URL?: string;
  AUTH_AUTHORIZED_PARTIES?: string;
  CLERK_PUBLISHABLE_KEY?: string;
  ALLOWED_ORIGINS: string;
  EMBEDDING_MODEL: string;
  CREDENTIAL_KEY?: string;
  YOUTUBE_API_KEY?: string;
  SPOTIFY_CLIENT_ID?: string;
  SPOTIFY_CLIENT_SECRET?: string;
  X_BEARER_TOKEN?: string;
  X_CLIENT_ID?: string;
  X_CLIENT_SECRET?: string;
}

export interface Principal {
  userId: string;
  contributor: string;
  tokenId?: string;
  scopes?: string[];
}

export type AppEnv = {
  Bindings: Env;
  Variables: { principal: Principal; requestId: string };
};

export interface PersonalRow {
  id: string;
  owner_id: string;
  content_id: string;
  status: 'received' | 'saved' | 'dismissed' | 'deleted';
  archived: number;
  created_at: string;
  ingested_at: string | null;
  saved_at: string | null;
  updated_at: string;
  revision: number;
  generation: number;
  content_type: string | null;
  decision_at: string | null;
  decision_origin: 'explicit' | 'automatic';
}

export type SqlValue = string | number | null;
