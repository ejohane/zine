import { TokenToDOMigrator } from './token-to-do-migrator';
import type { Env } from '../types';

export interface MigrationCommand {
  action: 'migrate' | 'status' | 'rollback' | 'export' | 'import';
  options?: {
    dryRun?: boolean;
    userIds?: string[];
    batchSize?: number;
    statusFile?: string;
  };
}

export class MigrationCLI {
  private migrator: TokenToDOMigrator;

  constructor(env: Env, batchSize: number = 10) {
    this.migrator = new TokenToDOMigrator(env, batchSize);
  }

  async execute(command: MigrationCommand): Promise<void> {
    switch (command.action) {
      case 'migrate':
        await this.runMigration(command.options);
        break;
      case 'status':
        await this.showStatus();
        break;
      case 'rollback':
        await this.runRollback(command.options);
        break;
      case 'export':
        await this.exportStatus(command.options?.statusFile);
        break;
      case 'import':
        await this.importStatus(command.options?.statusFile);
        break;
      default:
        throw new Error(`Unknown command: ${command.action}`);
    }
  }

  private async runMigration(options?: MigrationCommand['options']): Promise<void> {
    console.log('Starting token migration to Durable Objects...');
    
    if (options?.dryRun) {
      console.log('Running in DRY RUN mode - no changes will be made');
    }

    const startTime = Date.now();
    const report = await this.migrator.migrate({
      dryRun: options?.dryRun || false,
      userIds: options?.userIds
    });

    const duration = Date.now() - startTime;
    
    console.log('\n=== Migration Report ===');
    console.log(`Total Users: ${report.totalUsers}`);
    console.log(`Total Tokens: ${report.totalTokens}`);
    console.log(`Successfully Migrated: ${report.migrated}`);
    console.log(`Failed: ${report.failed}`);
    console.log(`In Progress: ${report.inProgress}`);
    console.log(`Pending: ${report.pending}`);
    console.log(`Duration: ${(duration / 1000).toFixed(2)}s`);
    
    if (report.errors.length > 0) {
      console.log('\n=== Errors ===');
      for (const error of report.errors) {
        console.error(`User ${error.userId} (${error.provider}): ${error.error}`);
      }
    }

    if (report.migrated > 0 && !options?.dryRun) {
      console.log('\n✅ Migration completed successfully!');
      console.log('Next steps:');
      console.log('1. Monitor DO health metrics');
      console.log('2. Enable feature flag for dual-mode operation');
      console.log('3. Verify token refresh in DOs');
    }
  }

  private async runRollback(options?: MigrationCommand['options']): Promise<void> {
    console.log('Starting rollback of token migration...');
    
    const confirm = options?.dryRun ? 'dry-run' : 'CONFIRM';
    if (confirm !== 'CONFIRM' && confirm !== 'dry-run') {
      console.error('Rollback cancelled - must confirm with CONFIRM or use --dry-run');
      return;
    }

    const report = await this.migrator.migrate({
      rollback: true,
      userIds: options?.userIds
    });

    console.log('\n=== Rollback Report ===');
    console.log(`Total Users Rolled Back: ${report.migrated}`);
    console.log(`Failed Rollbacks: ${report.failed}`);
    
    if (report.errors.length > 0) {
      console.log('\n=== Errors ===');
      for (const error of report.errors) {
        console.error(`User ${error.userId}: ${error.error}`);
      }
    }
  }

  private async showStatus(): Promise<void> {
    const summary = await this.migrator.getMigrationSummary();
    const status = await this.migrator.getMigrationStatus();
    
    console.log('\n=== Migration Status ===');
    console.log(`Total Tracked Migrations: ${summary.total}`);
    
    console.log('\nBy Status:');
    for (const [statusName, count] of Object.entries(summary.byStatus)) {
      console.log(`  ${statusName}: ${count}`);
    }
    
    console.log('\nBy Provider:');
    for (const [provider, count] of Object.entries(summary.byProvider)) {
      console.log(`  ${provider}: ${count}`);
    }
    
    // Show recent failures
    const failures = Array.from(status.values())
      .filter(s => s.status === 'failed')
      .sort((a, b) => (b.lastAttemptAt?.getTime() || 0) - (a.lastAttemptAt?.getTime() || 0))
      .slice(0, 10);
    
    if (failures.length > 0) {
      console.log('\nRecent Failures:');
      for (const failure of failures) {
        console.log(`  User ${failure.userId} (${failure.provider}): ${failure.error}`);
        console.log(`    Attempts: ${failure.attemptCount}, Last: ${failure.lastAttemptAt}`);
      }
    }
  }

  private async exportStatus(filename?: string): Promise<void> {
    const statusJson = await this.migrator.exportStatus();
    const file = filename || `migration-status-${Date.now()}.json`;
    
    // In a real implementation, this would write to a file
    // For Cloudflare Workers, we'll just log it
    console.log(`\n=== Export Status to ${file} ===`);
    console.log(statusJson);
  }

  private async importStatus(filename?: string): Promise<void> {
    if (!filename) {
      throw new Error('Status file required for import');
    }
    
    // In a real implementation, this would read from a file
    // For Cloudflare Workers, this would need to be passed as a string
    console.log(`Importing status from ${filename}...`);
    // this.migrator.importStatus(statusJson);
  }
}

// Helper function to run migration from scheduled event or HTTP endpoint
export async function runMigration(env: Env, request?: Request): Promise<Response> {
  const cli = new MigrationCLI(env);
  
  try {
    // Parse command from request if provided
    let command: MigrationCommand = { action: 'migrate' };
    
    if (request) {
      const url = new URL(request.url);
      const action = url.searchParams.get('action') || 'migrate';
      const dryRun = url.searchParams.get('dryRun') === 'true';
      const userIds = url.searchParams.get('userIds')?.split(',').filter(Boolean);
      const batchSize = parseInt(url.searchParams.get('batchSize') || '10');
      
      command = {
        action: action as MigrationCommand['action'],
        options: { dryRun, userIds, batchSize }
      };
    }
    
    // Capture console output
    const output: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    
    console.log = (...args) => output.push(args.join(' '));
    console.error = (...args) => output.push('ERROR: ' + args.join(' '));
    
    await cli.execute(command);
    
    // Restore console
    console.log = originalLog;
    console.error = originalError;
    
    return new Response(output.join('\n'), {
      headers: { 'Content-Type': 'text/plain' }
    });
  } catch (error) {
    return new Response(
      `Migration failed: ${error.message}`,
      { status: 500, headers: { 'Content-Type': 'text/plain' } }
    );
  }
}