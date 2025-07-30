/**
 * Circuit Breaker Pattern
 * 
 * Prevents cascading failures by stopping calls to failing services.
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is failing, requests are rejected
 * - HALF_OPEN: Testing if service has recovered
 */

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  /**
   * Number of failures before opening the circuit
   */
  failureThreshold: number;
  
  /**
   * Time window in ms for counting failures
   */
  failureWindow: number;
  
  /**
   * Time in ms to wait before attempting recovery
   */
  recoveryTimeout: number;
  
  /**
   * Number of successful calls in HALF_OPEN before closing
   */
  successThreshold: number;
  
  /**
   * Optional name for logging
   */
  name?: string;
  
  /**
   * Function to determine if an error should count as failure
   */
  isFailure?: (error: any) => boolean;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: number;
  lastStateChange: number;
  totalCalls: number;
  rejectedCalls: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime?: number;
  private lastStateChange: number = Date.now();
  private failureTimestamps: number[] = [];
  private metrics = {
    totalCalls: 0,
    rejectedCalls: 0,
  };
  
  constructor(private options: CircuitBreakerOptions) {
    // Default isFailure function
    if (!this.options.isFailure) {
      this.options.isFailure = () => true;
    }
  }
  
  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.metrics.totalCalls++;
    
    // Check if circuit should transition from OPEN to HALF_OPEN
    if (this.state === CircuitState.OPEN) {
      const timeSinceLastFailure = Date.now() - (this.lastFailureTime || 0);
      if (timeSinceLastFailure >= this.options.recoveryTimeout) {
        this.transition(CircuitState.HALF_OPEN);
      }
    }
    
    // Reject if circuit is OPEN
    if (this.state === CircuitState.OPEN) {
      this.metrics.rejectedCalls++;
      throw new Error(
        `Circuit breaker is OPEN${this.options.name ? ` for ${this.options.name}` : ''}`,
      );
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      if (this.options.isFailure!(error)) {
        this.onFailure();
      }
      throw error;
    }
  }
  
  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      
      // Close circuit if success threshold reached
      if (this.successes >= this.options.successThreshold) {
        this.transition(CircuitState.CLOSED);
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in CLOSED state
      this.failures = 0;
      this.failureTimestamps = [];
    }
  }
  
  /**
   * Handle failed execution
   */
  private onFailure(): void {
    const now = Date.now();
    this.lastFailureTime = now;
    
    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in HALF_OPEN reopens the circuit
      this.transition(CircuitState.OPEN);
    } else if (this.state === CircuitState.CLOSED) {
      // Track failures within the time window
      this.failureTimestamps.push(now);
      
      // Remove old failures outside the window
      const cutoff = now - this.options.failureWindow;
      this.failureTimestamps = this.failureTimestamps.filter(ts => ts > cutoff);
      
      this.failures = this.failureTimestamps.length;
      
      // Open circuit if threshold reached
      if (this.failures >= this.options.failureThreshold) {
        this.transition(CircuitState.OPEN);
      }
    }
  }
  
  /**
   * Transition to a new state
   */
  private transition(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();
    
    // Reset counters on state change
    if (newState === CircuitState.CLOSED) {
      this.failures = 0;
      this.successes = 0;
      this.failureTimestamps = [];
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successes = 0;
    }
    
    console.log(
      `Circuit breaker${this.options.name ? ` ${this.options.name}` : ''} ` +
      `transitioned from ${oldState} to ${newState}`,
    );
  }
  
  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }
  
  /**
   * Get metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange,
      totalCalls: this.metrics.totalCalls,
      rejectedCalls: this.metrics.rejectedCalls,
    };
  }
  
  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.transition(CircuitState.CLOSED);
  }
  
  /**
   * Check if circuit is allowing requests
   */
  isOpen(): boolean {
    return this.state === CircuitState.OPEN;
  }
}

/**
 * Circuit breaker manager for multiple services
 */
export class CircuitBreakerManager {
  private breakers = new Map<string, CircuitBreaker>();
  
  /**
   * Get or create a circuit breaker for a service
   */
  getBreaker(
    name: string,
    options?: Partial<CircuitBreakerOptions>,
  ): CircuitBreaker {
    if (!this.breakers.has(name)) {
      const defaultOptions: CircuitBreakerOptions = {
        failureThreshold: 5,
        failureWindow: 60000, // 1 minute
        recoveryTimeout: 30000, // 30 seconds
        successThreshold: 3,
        name,
        ...options,
      };
      
      this.breakers.set(name, new CircuitBreaker(defaultOptions));
    }
    
    return this.breakers.get(name)!;
  }
  
  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(
    name: string,
    fn: () => Promise<T>,
    options?: Partial<CircuitBreakerOptions>,
  ): Promise<T> {
    const breaker = this.getBreaker(name, options);
    return breaker.execute(fn);
  }
  
  /**
   * Get all circuit breaker metrics
   */
  getAllMetrics(): Map<string, CircuitBreakerMetrics> {
    const metrics = new Map<string, CircuitBreakerMetrics>();
    
    this.breakers.forEach((breaker, name) => {
      metrics.set(name, breaker.getMetrics());
    });
    
    return metrics;
  }
  
  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.breakers.forEach(breaker => breaker.reset());
  }
  
  /**
   * Reset a specific circuit breaker
   */
  reset(name: string): void {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.reset();
    }
  }
}

// Global circuit breaker manager instance
export const circuitBreakerManager = new CircuitBreakerManager();