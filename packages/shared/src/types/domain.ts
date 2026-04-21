import type { JsonObject } from '../json';

export enum ContentType {
  VIDEO = 'VIDEO',
  PODCAST = 'PODCAST',
  ARTICLE = 'ARTICLE',
  POST = 'POST',
}

export enum Provider {
  YOUTUBE = 'YOUTUBE',
  SPOTIFY = 'SPOTIFY',
  GMAIL = 'GMAIL',
  RSS = 'RSS',
  SUBSTACK = 'SUBSTACK',
  WEB = 'WEB',
  X = 'X',
}

export enum UserItemState {
  INBOX = 'INBOX',
  BOOKMARKED = 'BOOKMARKED',
  ARCHIVED = 'ARCHIVED',
}

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  DISCONNECTED = 'DISCONNECTED',
  UNSUBSCRIBED = 'UNSUBSCRIBED',
}

export enum ProviderConnectionStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
}

export type ContentTypeValue = `${ContentType}`;
export type ProviderValue = `${Provider}`;
export type UserItemStateValue = `${UserItemState}`;
export type SubscriptionStatusValue = `${SubscriptionStatus}`;
export type ProviderConnectionStatusValue = `${ProviderConnectionStatus}`;
export type OAuthProvider = Extract<ProviderValue, 'YOUTUBE' | 'SPOTIFY' | 'GMAIL'>;
export type SubscriptionSource = OAuthProvider | 'RSS';
export interface Item {
  id: string;
  contentType: ContentType;
  provider: Provider;
  providerId: string;
  canonicalUrl: string;
  title: string;
  summary?: string;
  // Joined from creators; not stored on items.
  creator: string;
  // Joined from creators; not stored on items.
  creatorImageUrl?: string;
  creatorId?: string;
  publisher?: string;
  publishedAt?: string;
  thumbnailUrl?: string;
  duration?: number;
  wordCount?: number;
  readingTimeMinutes?: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserItem {
  id: string;
  // Required for D1 multi-tenant queries.
  userId: string;
  itemId: string;
  state: UserItemState;
  ingestedAt: string;
  bookmarkedAt?: string;
  archivedAt?: string;
  isFinished: boolean;
  finishedAt?: string;
  progressPosition?: number;
  progressDuration?: number;
  progressUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Source {
  id: string;
  // Required for D1 multi-tenant queries.
  userId: string;
  provider: Provider;
  providerId: string;
  feedUrl: string;
  name: string;
  config?: JsonObject;
  createdAt: string;
  updatedAt: string;
  // Soft delete so unsubscribe can preserve history.
  deletedAt?: string;
}
export function isContentType(value: unknown): value is ContentType {
  return Object.values(ContentType).includes(value as ContentType);
}

export function isProvider(value: unknown): value is Provider {
  return Object.values(Provider).includes(value as Provider);
}

export function isUserItemState(value: unknown): value is UserItemState {
  return Object.values(UserItemState).includes(value as UserItemState);
}

export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return Object.values(SubscriptionStatus).includes(value as SubscriptionStatus);
}

export function isProviderConnectionStatus(value: unknown): value is ProviderConnectionStatus {
  return Object.values(ProviderConnectionStatus).includes(value as ProviderConnectionStatus);
}
export interface Creator {
  id: string;
  provider: Provider;
  providerCreatorId: string;
  name: string;
  // Lowercase, trimmed name used for deduplication.
  normalizedName: string;
  imageUrl?: string;
  description?: string;
  externalUrl?: string;
  handle?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreatorWithSubscription extends Creator {
  isSubscribed: boolean;
  subscriptionId?: string;
}
