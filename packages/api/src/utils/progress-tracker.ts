/**
 * Progress Tracking System
 * 
 * Provides real-time progress updates and detailed metrics collection
 * for feed polling operations.
 */

export interface ProgressUpdate {
  taskId: string;
  status: 'started' | 'completed' | 'failed';
  timestamp: number;
  metadata?: any;
  error?: Error;
}

export interface ProgressMetrics {
  startTime: number;
  endTime?: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  inProgressTasks: number;
  averageTaskDuration: number;
  estimatedTimeRemaining: number;
  tasksPerSecond: number;
  successRate: number;
}

export interface TaskMetrics {
  taskId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'in_progress' | 'completed' | 'failed';
  error?: Error;
  metadata?: any;
}

export type ProgressCallback = (update: ProgressUpdate, metrics: ProgressMetrics) => void;

export class ProgressTracker {
  private tasks = new Map<string, TaskMetrics>();
  private startTime?: number;
  private endTime?: number;
  private callbacks: ProgressCallback[] = [];
  private completedCount = 0;
  private failedCount = 0;
  private totalDuration = 0;
  
  constructor(private totalTasks: number) {}
  
  /**
   * Register a callback for progress updates
   */
  onProgress(callback: ProgressCallback): void {
    this.callbacks.push(callback);
  }
  
  /**
   * Start tracking overall progress
   */
  start(): void {
    this.startTime = Date.now();
  }
  
  /**
   * Mark a task as started
   */
  taskStarted(taskId: string, metadata?: any): void {
    const now = Date.now();
    
    if (!this.startTime) {
      this.start();
    }
    
    this.tasks.set(taskId, {
      taskId,
      startTime: now,
      status: 'in_progress',
      metadata,
    });
    
    this.notifyProgress({
      taskId,
      status: 'started',
      timestamp: now,
      metadata,
    });
  }
  
  /**
   * Mark a task as completed
   */
  taskCompleted(taskId: string, metadata?: any): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    
    const now = Date.now();
    const duration = now - task.startTime;
    
    task.endTime = now;
    task.duration = duration;
    task.status = 'completed';
    task.metadata = { ...task.metadata, ...metadata };
    
    this.completedCount++;
    this.totalDuration += duration;
    
    this.notifyProgress({
      taskId,
      status: 'completed',
      timestamp: now,
      metadata,
    });
    
    // Check if all tasks are done
    if (this.completedCount + this.failedCount === this.totalTasks) {
      this.endTime = now;
    }
  }
  
  /**
   * Mark a task as failed
   */
  taskFailed(taskId: string, error: Error, metadata?: any): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    
    const now = Date.now();
    const duration = now - task.startTime;
    
    task.endTime = now;
    task.duration = duration;
    task.status = 'failed';
    task.error = error;
    task.metadata = { ...task.metadata, ...metadata };
    
    this.failedCount++;
    
    this.notifyProgress({
      taskId,
      status: 'failed',
      timestamp: now,
      metadata,
      error,
    });
    
    // Check if all tasks are done
    if (this.completedCount + this.failedCount === this.totalTasks) {
      this.endTime = now;
    }
  }
  
  /**
   * Notify all callbacks with progress update
   */
  private notifyProgress(update: ProgressUpdate): void {
    const metrics = this.getMetrics();
    this.callbacks.forEach(callback => {
      try {
        callback(update, metrics);
      } catch (error) {
        console.error('Progress callback error:', error);
      }
    });
  }
  
  /**
   * Get current metrics
   */
  getMetrics(): ProgressMetrics {
    const now = Date.now();
    const elapsed = this.startTime ? now - this.startTime : 0;
    const inProgress = Array.from(this.tasks.values()).filter(
      t => t.status === 'in_progress'
    ).length;
    
    const averageTaskDuration = this.completedCount > 0
      ? this.totalDuration / this.completedCount
      : 0;
    
    const remainingTasks = this.totalTasks - this.completedCount - this.failedCount;
    const estimatedTimeRemaining = remainingTasks * averageTaskDuration;
    
    const tasksPerSecond = elapsed > 0
      ? (this.completedCount + this.failedCount) / (elapsed / 1000)
      : 0;
    
    const successRate = (this.completedCount + this.failedCount) > 0
      ? this.completedCount / (this.completedCount + this.failedCount)
      : 0;
    
    return {
      startTime: this.startTime || now,
      endTime: this.endTime,
      totalTasks: this.totalTasks,
      completedTasks: this.completedCount,
      failedTasks: this.failedCount,
      inProgressTasks: inProgress,
      averageTaskDuration,
      estimatedTimeRemaining,
      tasksPerSecond,
      successRate,
    };
  }
  
  /**
   * Get detailed task metrics
   */
  getTaskMetrics(taskId?: string): TaskMetrics | TaskMetrics[] | undefined {
    if (taskId) {
      return this.tasks.get(taskId);
    }
    return Array.from(this.tasks.values());
  }
  
  /**
   * Get failed tasks
   */
  getFailedTasks(): TaskMetrics[] {
    return Array.from(this.tasks.values()).filter(t => t.status === 'failed');
  }
  
  /**
   * Reset the tracker
   */
  reset(totalTasks?: number): void {
    this.tasks.clear();
    this.startTime = undefined;
    this.endTime = undefined;
    this.completedCount = 0;
    this.failedCount = 0;
    this.totalDuration = 0;
    
    if (totalTasks !== undefined) {
      this.totalTasks = totalTasks;
    }
  }
  
  /**
   * Create a summary report
   */
  getSummary(): string {
    const metrics = this.getMetrics();
    const elapsed = metrics.endTime 
      ? metrics.endTime - metrics.startTime 
      : Date.now() - metrics.startTime;
    
    const lines = [
      `Progress Summary:`,
      `- Total Tasks: ${metrics.totalTasks}`,
      `- Completed: ${metrics.completedTasks} (${(metrics.successRate * 100).toFixed(1)}% success rate)`,
      `- Failed: ${metrics.failedTasks}`,
      `- In Progress: ${metrics.inProgressTasks}`,
      `- Duration: ${(elapsed / 1000).toFixed(1)}s`,
      `- Average Task Duration: ${(metrics.averageTaskDuration / 1000).toFixed(2)}s`,
      `- Throughput: ${metrics.tasksPerSecond.toFixed(2)} tasks/second`,
    ];
    
    if (!metrics.endTime && metrics.estimatedTimeRemaining > 0) {
      lines.push(`- Estimated Time Remaining: ${(metrics.estimatedTimeRemaining / 1000).toFixed(1)}s`);
    }
    
    return lines.join('\n');
  }
}

/**
 * Console progress reporter
 */
export class ConsoleProgressReporter {
  private lastUpdate = 0;
  private updateInterval = 1000; // Update every second
  
  constructor(private tracker: ProgressTracker) {
    this.tracker.onProgress(() => this.report());
  }
  
  private report(): void {
    const now = Date.now();
    if (now - this.lastUpdate < this.updateInterval) {
      return;
    }
    
    this.lastUpdate = now;
    const metrics = this.tracker.getMetrics();
    
    const progress = metrics.totalTasks > 0
      ? (metrics.completedTasks + metrics.failedTasks) / metrics.totalTasks * 100
      : 0;
    
    console.log(
      `Progress: ${progress.toFixed(1)}% | ` +
      `Completed: ${metrics.completedTasks}/${metrics.totalTasks} | ` +
      `Failed: ${metrics.failedTasks} | ` +
      `Speed: ${metrics.tasksPerSecond.toFixed(1)}/s | ` +
      `ETA: ${metrics.estimatedTimeRemaining > 0 
        ? `${(metrics.estimatedTimeRemaining / 1000).toFixed(0)}s` 
        : 'N/A'}`
    );
  }
  
  /**
   * Print final summary
   */
  printSummary(): void {
    console.log('\n' + this.tracker.getSummary());
  }
}