import { drizzle } from 'drizzle-orm/d1';
import { eq, and, isNull, not, or } from 'drizzle-orm';
import { userAccounts, users, tokenMigrationStatus } from '../schema';
import type { Env } from '../types';
import { nanoid } from 'nanoid';

export interface MigrationStatus {
  userId: string;
  provider: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  error?: string;
  attemptCount: number;
  lastAttemptAt?: Date;
  completedAt?: Date;
}

export interface MigrationReport {
  totalUsers: number;
  totalTokens: number;
  migrated: number;
  failed: number;
  inProgress: number;
  pending: number;
  errors: Array<{ userId: string; provider: string; error: string }>;
}

export class TokenToDOMigrator {
  private db: ReturnType<typeof drizzle>;
  private env: Env;
  private batchSize: number;
  private maxRetries: number = 3;

  constructor(env: Env, batchSize: number = 10) {
    this.env = env;
    this.db = drizzle(env.DB);
    this.batchSize = batchSize;
  }

  /**
   * Main migration entry point
   */
  async migrate(options: {
    dryRun?: boolean;
    userIds?: string[];
    rollback?: boolean;
  } = {}): Promise<MigrationReport> {
    if (options.rollback) {
      return this.rollback(options.userIds);
    }

    const usersToMigrate = await this.getUsersToMigrate(options.userIds);
    const report: MigrationReport = {
      totalUsers: usersToMigrate.length,
      totalTokens: 0,
      migrated: 0,
      failed: 0,
      inProgress: 0,
      pending: usersToMigrate.length,
      errors: []
    };

    // Count total tokens
    for (const user of usersToMigrate) {
      const accounts = await this.getUserAccounts(user.id);
      report.totalTokens += accounts.length;
    }

    if (options.dryRun) {
      console.log('DRY RUN - Would migrate:', report);
      return report;
    }

    // Process users in batches
    for (let i = 0; i < usersToMigrate.length; i += this.batchSize) {
      const batch = usersToMigrate.slice(i, i + this.batchSize);
      await this.processBatch(batch, report);
    }

    return report;
  }

  /**
   * Process a batch of users
   */
  private async processBatch(users: Array<{ id: string }>, report: MigrationReport): Promise<void> {
    const promises = users.map(user => this.migrateUser(user.id, report));
    await Promise.allSettled(promises);
  }

  /**
   * Migrate a single user's tokens to their DO
   */
  private async migrateUser(userId: string, report: MigrationReport): Promise<void> {
    try {
      report.pending--;
      report.inProgress++;

      // Get user's OAuth accounts
      const accounts = await this.getUserAccounts(userId);
      if (accounts.length === 0) {
        report.inProgress--;
        report.migrated++;
        return;
      }

      // Get or create user's DO
      const doId = this.env.USER_SUBSCRIPTION_MANAGER.idFromString(userId);
      const doStub = this.env.USER_SUBSCRIPTION_MANAGER.get(doId);

      // Initialize DO with user ID
      const initResponse = await doStub.fetch(
        new Request('https://do.internal/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId })
        })
      );

      if (!initResponse.ok) {
        throw new Error(`Failed to initialize DO: ${await initResponse.text()}`);
      }

      // Migrate each account's tokens
      for (const account of accounts) {
        const status = await this.getOrCreateStatus(userId, account.providerId);
        
        // Update status to in_progress
        await this.updateMigrationStatus(userId, account.providerId, {
          status: 'in_progress',
          startedAt: new Date()
        });

        try {
          await this.migrateAccountToken(doStub, account);
          
          // Update status to completed
          await this.updateMigrationStatus(userId, account.providerId, {
            status: 'completed',
            completedAt: new Date()
          });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          const newAttemptCount = status.attemptCount + 1;
          
          // Update status to failed
          await this.updateMigrationStatus(userId, account.providerId, {
            status: 'failed',
            error: errorMsg,
            attemptCount: newAttemptCount,
            lastAttemptAt: new Date()
          });
          
          if (newAttemptCount < this.maxRetries) {
            // Retry later
            setTimeout(() => this.retryMigration(userId, account.providerId, report), 5000 * newAttemptCount);
          } else {
            report.errors.push({
              userId,
              provider: account.providerId,
              error: errorMsg
            });
          }
          throw error;
        }
      }

      // Update user record with DO ID
      await this.db.update(users)
        .set({ durableObjectId: doId.toString() } as any)
        .where(eq(users.id, userId))
        .execute();

      report.inProgress--;
      report.migrated++;
    } catch (error) {
      report.inProgress--;
      report.failed++;
      console.error(`Failed to migrate user ${userId}:`, error);
    }
  }

  /**
   * Migrate a single account token to DO
   */
  private async migrateAccountToken(doStub: any, account: any): Promise<void> {
    const tokenData = {
      provider: account.providerId,
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      expiresAt: account.expiresAt ? new Date(account.expiresAt) : undefined
    };

    const response = await doStub.fetch(
      new Request('https://do.internal/update-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tokenData)
      })
    );

    if (!response.ok) {
      throw new Error(`Failed to update token in DO: ${await response.text()}`);
    }
  }

  /**
   * Retry failed migration
   */
  private async retryMigration(userId: string, provider: string, report: MigrationReport): Promise<void> {
    const status = await this.getOrCreateStatus(userId, provider);
    if (status.attemptCount >= this.maxRetries) {
      return;
    }

    try {
      const accounts = await this.getUserAccounts(userId);
      const account = accounts.find(a => a.providerId === provider);
      if (!account) return;

      const doId = this.env.USER_SUBSCRIPTION_MANAGER.idFromString(userId);
      const doStub = this.env.USER_SUBSCRIPTION_MANAGER.get(doId);

      await this.migrateAccountToken(doStub, account);
      
      await this.updateMigrationStatus(userId, provider, {
        status: 'completed',
        completedAt: new Date()
      });
      
      report.migrated++;
      report.failed--;
    } catch (error) {
      const newAttemptCount = status.attemptCount + 1;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      
      await this.updateMigrationStatus(userId, provider, {
        attemptCount: newAttemptCount,
        lastAttemptAt: new Date(),
        error: errorMsg
      });
      
      if (newAttemptCount < this.maxRetries) {
        setTimeout(() => this.retryMigration(userId, provider, report), 5000 * newAttemptCount);
      }
    }
  }

  /**
   * Rollback migration for specified users
   */
  private async rollback(userIds?: string[]): Promise<MigrationReport> {
    const report: MigrationReport = {
      totalUsers: 0,
      totalTokens: 0,
      migrated: 0,
      failed: 0,
      inProgress: 0,
      pending: 0,
      errors: []
    };

    const whereClause = userIds 
      ? and(users.durableObjectId !== null, users.id in userIds)
      : users.durableObjectId !== null;

    const usersToRollback = await this.db.select()
      .from(users)
      .where(whereClause as any)
      .execute();

    report.totalUsers = usersToRollback.length;

    for (const user of usersToRollback) {
      try {
        // Export tokens from DO back to database
        const doId = this.env.USER_SUBSCRIPTION_MANAGER.idFromString(user.id);
        const doStub = this.env.USER_SUBSCRIPTION_MANAGER.get(doId);

        const tokensResponse = await doStub.fetch(
          new Request('https://do.internal/export-tokens')
        );

        if (tokensResponse.ok) {
          const tokens = await tokensResponse.json() as any;
          
          // Update tokens in database
          for (const [provider, tokenData] of Object.entries(tokens)) {
            await this.db.update(userAccounts)
              .set({
                accessToken: (tokenData as any).accessToken,
                refreshToken: (tokenData as any).refreshToken,
                expiresAt: (tokenData as any).expiresAt ? new Date((tokenData as any).expiresAt) : null,
                updatedAt: new Date()
              })
              .where(and(
                eq(userAccounts.userId, user.id),
                eq(userAccounts.providerId, provider)
              ))
              .execute();
          }
        }

        // Clear DO ID from user record
        await this.db.update(users)
          .set({ durableObjectId: null } as any)
          .where(eq(users.id, user.id))
          .execute();

        report.migrated++;
      } catch (error) {
        report.failed++;
        report.errors.push({
          userId: user.id,
          provider: 'all',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return report;
  }

  /**
   * Get users that need migration
   */
  private async getUsersToMigrate(userIds?: string[]): Promise<Array<{ id: string }>> {
    if (userIds && userIds.length > 0) {
      return this.db.select({ id: users.id })
        .from(users)
        .where(and(
          users.id in userIds,
          isNull(users.durableObjectId as any)
        ))
        .execute();
    }

    return this.db.select({ id: users.id })
      .from(users)
      .where(isNull(users.durableObjectId as any))
      .execute();
  }

  /**
   * Get user's OAuth accounts
   */
  private async getUserAccounts(userId: string): Promise<any[]> {
    return this.db.select()
      .from(userAccounts)
      .where(eq(userAccounts.userId, userId))
      .execute();
  }

  /**
   * Get or create migration status from database
   */
  private async getOrCreateStatus(userId: string, provider: string): Promise<MigrationStatus> {
    // Try to find existing status
    const existing = await this.db.select()
      .from(tokenMigrationStatus)
      .where(and(
        eq(tokenMigrationStatus.userId, userId),
        eq(tokenMigrationStatus.provider, provider)
      ))
      .execute();

    if (existing.length > 0) {
      const record = existing[0];
      return {
        userId: record.userId,
        provider: record.provider,
        status: record.status as any,
        attemptCount: record.attemptCount,
        error: record.error || undefined,
        lastAttemptAt: record.lastAttemptAt || undefined,
        completedAt: record.completedAt || undefined
      };
    }

    // Create new status
    const id = nanoid();
    await this.db.insert(tokenMigrationStatus)
      .values({
        id,
        userId,
        provider,
        status: 'pending',
        attemptCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .execute();

    return {
      userId,
      provider,
      status: 'pending',
      attemptCount: 0
    };
  }

  /**
   * Update migration status in database
   */
  private async updateMigrationStatus(
    userId: string, 
    provider: string, 
    updates: Partial<MigrationStatus>
  ): Promise<void> {
    await this.db.update(tokenMigrationStatus)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(and(
        eq(tokenMigrationStatus.userId, userId),
        eq(tokenMigrationStatus.provider, provider)
      ))
      .execute();
  }

  /**
   * Get migration status report from database
   */
  async getMigrationStatus(): Promise<Map<string, MigrationStatus>> {
    const statuses = await this.db.select()
      .from(tokenMigrationStatus)
      .execute();
    
    const statusMap = new Map<string, MigrationStatus>();
    for (const record of statuses) {
      const key = `${record.userId}:${record.provider}`;
      statusMap.set(key, {
        userId: record.userId,
        provider: record.provider,
        status: record.status as any,
        attemptCount: record.attemptCount,
        error: record.error || undefined,
        lastAttemptAt: record.lastAttemptAt || undefined,
        completedAt: record.completedAt || undefined
      });
    }
    
    return statusMap;
  }

  /**
   * Export migration status for persistence
   */
  async exportStatus(): Promise<string> {
    const statuses = await this.db.select()
      .from(tokenMigrationStatus)
      .execute();
    
    return JSON.stringify(statuses, null, 2);
  }

  /**
   * Get migration summary
   */
  async getMigrationSummary(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byProvider: Record<string, number>;
  }> {
    const statuses = await this.db.select()
      .from(tokenMigrationStatus)
      .execute();
    
    const summary = {
      total: statuses.length,
      byStatus: {} as Record<string, number>,
      byProvider: {} as Record<string, number>
    };
    
    for (const status of statuses) {
      // Count by status
      summary.byStatus[status.status] = (summary.byStatus[status.status] || 0) + 1;
      
      // Count by provider
      summary.byProvider[status.provider] = (summary.byProvider[status.provider] || 0) + 1;
    }
    
    return summary;
  }
}