import AsyncStorage from '@react-native-async-storage/async-storage';
import { queryClient } from '../contexts/query';
import { asyncStoragePersister } from './persistor';
import { getCacheSize, formatCacheSize } from './cacheUtils';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration?: number;
  details?: any;
}

export class PersistenceTestSuite {
  private results: TestResult[] = [];

  async runAllTests(): Promise<TestResult[]> {
    console.log('🧪 Starting Persistence Test Suite...\n');
    
    await this.testCacheStorage();
    await this.testCacheRestoration();
    await this.testCacheSize();
    await this.testQueryPersistence();
    await this.testCacheInvalidation();
    
    this.printResults();
    return this.results;
  }

  private async testCacheStorage(): Promise<void> {
    try {
      console.log('📦 Test 1: Cache Storage Functionality');
      const startTime = Date.now();

      const testKey = 'ZINE_QUERY_CACHE';
      const testData = {
        clientState: {
          queries: [],
          mutations: [],
        },
        timestamp: Date.now(),
      };

      await AsyncStorage.setItem(testKey, JSON.stringify(testData));
      const retrieved = await AsyncStorage.getItem(testKey);
      const parsed = retrieved ? JSON.parse(retrieved) : null;

      const passed = parsed !== null && parsed.timestamp === testData.timestamp;
      const duration = Date.now() - startTime;

      this.results.push({
        name: 'Cache Storage',
        passed,
        message: passed 
          ? `✅ Cache storage working (${duration}ms)` 
          : '❌ Cache storage failed',
        duration,
        details: { testData, retrieved: parsed },
      });

      console.log(this.results[this.results.length - 1].message);
    } catch (error) {
      this.results.push({
        name: 'Cache Storage',
        passed: false,
        message: `❌ Cache storage error: ${error}`,
      });
      console.log(this.results[this.results.length - 1].message);
    }
  }

  private async testCacheRestoration(): Promise<void> {
    try {
      console.log('\n🔄 Test 2: Cache Restoration Speed');
      const startTime = Date.now();

      const cacheData = await AsyncStorage.getItem('ZINE_QUERY_CACHE');
      const duration = Date.now() - startTime;

      const passed = duration < 100;

      this.results.push({
        name: 'Cache Restoration Speed',
        passed,
        message: passed 
          ? `✅ Cache restoration fast (${duration}ms < 100ms target)` 
          : `⚠️  Cache restoration slow (${duration}ms >= 100ms target)`,
        duration,
        details: { cacheExists: cacheData !== null },
      });

      console.log(this.results[this.results.length - 1].message);
    } catch (error) {
      this.results.push({
        name: 'Cache Restoration Speed',
        passed: false,
        message: `❌ Cache restoration error: ${error}`,
      });
      console.log(this.results[this.results.length - 1].message);
    }
  }

  private async testCacheSize(): Promise<void> {
    try {
      console.log('\n📊 Test 3: Cache Size Monitoring');
      
      const sizeInBytes = await getCacheSize();
      const sizeInMB = sizeInBytes / (1024 * 1024);
      const formattedSize = formatCacheSize(sizeInBytes);
      const passed = sizeInMB < 10;

      this.results.push({
        name: 'Cache Size',
        passed,
        message: passed 
          ? `✅ Cache size acceptable (${formattedSize} < 10MB)` 
          : `⚠️  Cache size large (${formattedSize} >= 10MB)`,
        details: { 
          sizeInBytes, 
          sizeInMB: sizeInMB.toFixed(2),
          formatted: formattedSize,
        },
      });

      console.log(this.results[this.results.length - 1].message);
    } catch (error) {
      this.results.push({
        name: 'Cache Size',
        passed: false,
        message: `❌ Cache size check error: ${error}`,
      });
      console.log(this.results[this.results.length - 1].message);
    }
  }

  private async testQueryPersistence(): Promise<void> {
    try {
      console.log('\n💾 Test 4: Query Persistence');

      const cacheState = queryClient.getQueryCache().getAll();
      const successfulQueries = cacheState.filter(
        (query) => query.state.status === 'success'
      );

      const passed = cacheState.length > 0;

      this.results.push({
        name: 'Query Persistence',
        passed,
        message: passed 
          ? `✅ Queries persisted (${successfulQueries.length}/${cacheState.length} successful)` 
          : '⚠️  No queries in cache',
        details: {
          totalQueries: cacheState.length,
          successfulQueries: successfulQueries.length,
          queryKeys: cacheState.map((q) => q.queryKey),
        },
      });

      console.log(this.results[this.results.length - 1].message);
    } catch (error) {
      this.results.push({
        name: 'Query Persistence',
        passed: false,
        message: `❌ Query persistence check error: ${error}`,
      });
      console.log(this.results[this.results.length - 1].message);
    }
  }

  private async testCacheInvalidation(): Promise<void> {
    try {
      console.log('\n🗑️  Test 5: Cache Invalidation');

      const beforeClear = await AsyncStorage.getItem('ZINE_QUERY_CACHE');
      
      await asyncStoragePersister.removeClient();
      
      const afterClear = await AsyncStorage.getItem('ZINE_QUERY_CACHE');

      const passed = beforeClear !== null && afterClear === null;

      if (passed) {
        const testData = {
          clientState: {
            queries: [],
            mutations: [],
          },
          timestamp: Date.now(),
        };
        await AsyncStorage.setItem('ZINE_QUERY_CACHE', JSON.stringify(testData));
      }

      this.results.push({
        name: 'Cache Invalidation',
        passed,
        message: passed 
          ? '✅ Cache invalidation working' 
          : '⚠️  Cache invalidation issues',
        details: {
          hadCacheBefore: beforeClear !== null,
          clearedSuccessfully: afterClear === null,
        },
      });

      console.log(this.results[this.results.length - 1].message);
    } catch (error) {
      this.results.push({
        name: 'Cache Invalidation',
        passed: false,
        message: `❌ Cache invalidation error: ${error}`,
      });
      console.log(this.results[this.results.length - 1].message);
    }
  }

  private printResults(): void {
    console.log('\n' + '='.repeat(50));
    console.log('📋 Test Results Summary');
    console.log('='.repeat(50));

    const passed = this.results.filter((r) => r.passed).length;
    const total = this.results.length;
    const percentage = ((passed / total) * 100).toFixed(0);

    console.log(`\nTests Passed: ${passed}/${total} (${percentage}%)`);
    
    console.log('\nDetailed Results:');
    this.results.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.name}`);
      console.log(`   ${result.message}`);
      if (result.duration !== undefined) {
        console.log(`   Duration: ${result.duration}ms`);
      }
    });

    console.log('\n' + '='.repeat(50));
  }

  getResults(): TestResult[] {
    return this.results;
  }

  getSummary(): { passed: number; total: number; percentage: number } {
    const passed = this.results.filter((r) => r.passed).length;
    const total = this.results.length;
    const percentage = (passed / total) * 100;
    return { passed, total, percentage };
  }
}

export async function runPersistenceTests(): Promise<void> {
  const suite = new PersistenceTestSuite();
  await suite.runAllTests();
  
  const summary = suite.getSummary();
  
  if (summary.percentage === 100) {
    console.log('\n✅ All tests passed! Persistence layer is working correctly.');
  } else if (summary.percentage >= 80) {
    console.log('\n⚠️  Most tests passed. Review failed tests above.');
  } else {
    console.log('\n❌ Multiple tests failed. Persistence layer needs attention.');
  }
}
