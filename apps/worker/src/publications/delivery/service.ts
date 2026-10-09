import { fanoutPendingPublications } from './fanout';
import { processDailyDigests } from './digests';
import { enqueuePushJobs, processPushJobs, publicationDeliveryHealth } from './outbox';
import { createApnsProvider, apnsConfigured, type ApnsConfig } from './apns';
export interface DeliveryEnvironment extends ApnsConfig {
  DB: D1Database;
}
export async function runPublicationDelivery(env: DeliveryEnvironment, now = Date.now()) {
  await fanoutPendingPublications(env.DB, now);
  await processDailyDigests(env.DB, now);
  await enqueuePushJobs(env.DB, now);
  await processPushJobs(env.DB, apnsConfigured(env) ? createApnsProvider(env) : undefined, now);
  return publicationDeliveryHealth(env.DB);
}
export { fanoutPendingPublications };
