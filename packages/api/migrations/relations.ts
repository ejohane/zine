import { relations } from "drizzle-orm/relations";
import { users, bookmarks, subscriptionProviders, userAccounts, subscriptions, userSubscriptions, feedItems, userFeedItems, tokenMigrationStatus } from "./schema";

export const bookmarksRelations = relations(bookmarks, ({one, many}) => ({
	user: one(users, {
		fields: [bookmarks.userId],
		references: [users.id]
	}),
	userFeedItems: many(userFeedItems),
}));

export const usersRelations = relations(users, ({many}) => ({
	bookmarks: many(bookmarks),
	userAccounts: many(userAccounts),
	userSubscriptions: many(userSubscriptions),
	userFeedItems: many(userFeedItems),
	tokenMigrationStatuses: many(tokenMigrationStatus),
}));

export const userAccountsRelations = relations(userAccounts, ({one}) => ({
	subscriptionProvider: one(subscriptionProviders, {
		fields: [userAccounts.providerId],
		references: [subscriptionProviders.id]
	}),
	user: one(users, {
		fields: [userAccounts.userId],
		references: [users.id]
	}),
}));

export const subscriptionProvidersRelations = relations(subscriptionProviders, ({many}) => ({
	userAccounts: many(userAccounts),
	subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(subscriptions, ({one, many}) => ({
	subscriptionProvider: one(subscriptionProviders, {
		fields: [subscriptions.providerId],
		references: [subscriptionProviders.id]
	}),
	userSubscriptions: many(userSubscriptions),
	feedItems: many(feedItems),
}));

export const userSubscriptionsRelations = relations(userSubscriptions, ({one}) => ({
	subscription: one(subscriptions, {
		fields: [userSubscriptions.subscriptionId],
		references: [subscriptions.id]
	}),
	user: one(users, {
		fields: [userSubscriptions.userId],
		references: [users.id]
	}),
}));

export const feedItemsRelations = relations(feedItems, ({one, many}) => ({
	subscription: one(subscriptions, {
		fields: [feedItems.subscriptionId],
		references: [subscriptions.id]
	}),
	userFeedItems: many(userFeedItems),
}));

export const userFeedItemsRelations = relations(userFeedItems, ({one}) => ({
	bookmark: one(bookmarks, {
		fields: [userFeedItems.bookmarkId],
		references: [bookmarks.id]
	}),
	feedItem: one(feedItems, {
		fields: [userFeedItems.feedItemId],
		references: [feedItems.id]
	}),
	user: one(users, {
		fields: [userFeedItems.userId],
		references: [users.id]
	}),
}));

export const tokenMigrationStatusRelations = relations(tokenMigrationStatus, ({one}) => ({
	user: one(users, {
		fields: [tokenMigrationStatus.userId],
		references: [users.id]
	}),
}));