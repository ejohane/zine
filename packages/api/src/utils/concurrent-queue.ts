/**
 * Concurrent Queue System
 * 
 * Manages concurrent execution of tasks with configurable concurrency levels,
 * priority handling, and progress tracking.
 */

export interface QueueTask<T> {
  id: string;
  priority: number;
  execute: () => Promise<T>;
  metadata?: any;
}

export interface QueueOptions {
  /**
   * Maximum number of concurrent tasks
   */
  concurrency: number;
  
  /**
   * Whether to process high priority tasks first
   */
  priorityQueue?: boolean;
  
  /**
   * Callback for progress updates
   */
  onProgress?: (completed: number, total: number) => void;
  
  /**
   * Callback for individual task errors
   */
  onTaskError?: (task: QueueTask<any>, error: Error) => void;
  
  /**
   * Callback for individual task completion
   */
  onTaskComplete?: (task: QueueTask<any>, result: any) => void;
}

export interface QueueMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  activeTasks: number;
  queuedTasks: number;
  averageExecutionTime: number;
  throughput: number; // tasks per second
}

export interface TaskResult<T> {
  taskId: string;
  success: boolean;
  result?: T;
  error?: Error;
  executionTime: number;
}

export class ConcurrentQueue<T = any> {
  private queue: QueueTask<T>[] = [];
  private activeCount = 0;
  private results: Map<string, TaskResult<T>> = new Map();
  private startTime: number = 0;
  private totalExecutionTime: number = 0;
  private completedCount: number = 0;
  private failedCount: number = 0;
  private isPaused: boolean = false;
  
  constructor(private options: QueueOptions) {}
  
  /**
   * Add a single task to the queue
   */
  add(task: QueueTask<T>): void {
    if (this.options.priorityQueue) {
      // Insert in priority order (higher priority first)
      const insertIndex = this.queue.findIndex(t => t.priority < task.priority);
      if (insertIndex === -1) {
        this.queue.push(task);
      } else {
        this.queue.splice(insertIndex, 0, task);
      }
    } else {
      this.queue.push(task);
    }
    
    this.processNext();
  }
  
  /**
   * Add multiple tasks to the queue
   */
  addBatch(tasks: QueueTask<T>[]): void {
    tasks.forEach(task => this.add(task));
  }
  
  /**
   * Process the next task in the queue
   */
  private async processNext(): Promise<void> {
    if (this.isPaused || this.activeCount >= this.options.concurrency || this.queue.length === 0) {
      return;
    }
    
    const task = this.queue.shift()!;
    this.activeCount++;
    
    if (this.startTime === 0) {
      this.startTime = Date.now();
    }
    
    const taskStartTime = Date.now();
    
    try {
      const result = await task.execute();
      const executionTime = Date.now() - taskStartTime;
      
      this.completedCount++;
      this.totalExecutionTime += executionTime;
      
      const taskResult: TaskResult<T> = {
        taskId: task.id,
        success: true,
        result,
        executionTime,
      };
      
      this.results.set(task.id, taskResult);
      
      if (this.options.onTaskComplete) {
        this.options.onTaskComplete(task, result);
      }
      
      this.updateProgress();
    } catch (error) {
      const executionTime = Date.now() - taskStartTime;
      this.failedCount++;
      
      const taskResult: TaskResult<T> = {
        taskId: task.id,
        success: false,
        error: error as Error,
        executionTime,
      };
      
      this.results.set(task.id, taskResult);
      
      if (this.options.onTaskError) {
        this.options.onTaskError(task, error as Error);
      }
      
      this.updateProgress();
    } finally {
      this.activeCount--;
      
      // Process next task
      this.processNext();
    }
  }
  
  /**
   * Update progress callback
   */
  private updateProgress(): void {
    if (this.options.onProgress) {
      const total = this.results.size + this.queue.length + this.activeCount;
      const completed = this.results.size;
      this.options.onProgress(completed, total);
    }
  }
  
  /**
   * Wait for all tasks to complete
   */
  async waitForCompletion(): Promise<TaskResult<T>[]> {
    // Wait for queue to be empty and no active tasks
    while (this.queue.length > 0 || this.activeCount > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return Array.from(this.results.values());
  }
  
  /**
   * Pause queue processing
   */
  pause(): void {
    this.isPaused = true;
  }
  
  /**
   * Resume queue processing
   */
  resume(): void {
    this.isPaused = false;
    
    // Process up to concurrency limit
    const tasksToStart = Math.min(this.options.concurrency - this.activeCount, this.queue.length);
    for (let i = 0; i < tasksToStart; i++) {
      this.processNext();
    }
  }
  
  /**
   * Clear the queue (doesn't stop active tasks)
   */
  clear(): void {
    this.queue = [];
  }
  
  /**
   * Get current metrics
   */
  getMetrics(): QueueMetrics {
    const elapsedSeconds = this.startTime ? (Date.now() - this.startTime) / 1000 : 0;
    const throughput = elapsedSeconds > 0 ? this.completedCount / elapsedSeconds : 0;
    
    return {
      totalTasks: this.results.size + this.queue.length + this.activeCount,
      completedTasks: this.completedCount,
      failedTasks: this.failedCount,
      activeTasks: this.activeCount,
      queuedTasks: this.queue.length,
      averageExecutionTime: this.completedCount > 0 ? this.totalExecutionTime / this.completedCount : 0,
      throughput,
    };
  }
  
  /**
   * Get results for specific task IDs
   */
  getResults(taskIds?: string[]): TaskResult<T>[] {
    if (!taskIds) {
      return Array.from(this.results.values());
    }
    
    return taskIds
      .map(id => this.results.get(id))
      .filter((result): result is TaskResult<T> => result !== undefined);
  }
}

/**
 * Create a queue task from a function
 */
export function createTask<T>(
  id: string,
  execute: () => Promise<T>,
  priority: number = 0,
  metadata?: any,
): QueueTask<T> {
  return {
    id,
    priority,
    execute,
    metadata,
  };
}

/**
 * Batch processor using concurrent queue
 */
export async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options: {
    concurrency: number;
    onProgress?: (completed: number, total: number) => void;
    getPriority?: (item: T, index: number) => number;
  },
): Promise<Map<number, R | Error>> {
  const queue = new ConcurrentQueue<R>({
    concurrency: options.concurrency,
    onProgress: options.onProgress,
  });
  
  // Create tasks
  const tasks = items.map((item, index) => 
    createTask(
      index.toString(),
      () => processor(item),
      options.getPriority ? options.getPriority(item, index) : 0,
    )
  );
  
  // Add all tasks
  queue.addBatch(tasks);
  
  // Wait for completion
  const results = await queue.waitForCompletion();
  
  // Map results by index
  const resultMap = new Map<number, R | Error>();
  results.forEach(result => {
    const index = parseInt(result.taskId);
    if (result.success && result.result !== undefined) {
      resultMap.set(index, result.result);
    } else if (result.error) {
      resultMap.set(index, result.error);
    }
  });
  
  return resultMap;
}