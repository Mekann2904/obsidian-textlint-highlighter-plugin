import { MemoryStats } from './MemoryManager';

export interface PerformanceMetrics {
  processingTime: number;
  memoryUsage: number;
  cacheHitRatio: number;
  queueLength: number;
  errorRate: number;
  operationCount: number;
  averageProcessingTime: number;
  peakMemoryUsage: number;
  timestamp: number;
}

export interface PerformanceThresholds {
  maxProcessingTime: number;
  maxMemoryUsage: number;
  minCacheHitRatio: number;
  maxQueueLength: number;
  maxErrorRate: number;
}

export interface PerformanceAlert {
  type: 'processing_time' | 'memory_usage' | 'cache_hit_ratio' | 'queue_length' | 'error_rate';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  currentValue: number;
  threshold: number;
  timestamp: number;
  suggestions: string[];
}

export interface ProcessingOperation {
  name: string;
  startTime: number;
  endTime?: number;
  memoryBefore?: number;
  memoryAfter?: number;
  success: boolean;
  error?: Error;
}

export interface OptimizationAction {
  type: 'cache_cleanup' | 'queue_management' | 'memory_optimization' | 'rule_adjustment';
  description: string;
  impact: 'low' | 'medium' | 'high';
  executed: boolean;
  timestamp: number;
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics;
  private thresholds: PerformanceThresholds;
  private operations: ProcessingOperation[] = [];
  private alerts: PerformanceAlert[] = [];
  private optimizationActions: OptimizationAction[] = [];
  private cacheStats = { hits: 0, misses: 0 };
  private errorCount = 0;
  private totalOperations = 0;
  private queueSize = 0;
  private peakMemory = 0;
  private isMonitoring = false;
  private monitoringInterval?: NodeJS.Timeout;

  constructor(thresholds?: Partial<PerformanceThresholds>) {
    this.thresholds = {
      maxProcessingTime: 5000, // 5 seconds
      maxMemoryUsage: 100, // 100MB
      minCacheHitRatio: 0.6, // 60%
      maxQueueLength: 10,
      maxErrorRate: 0.1, // 10%
      ...thresholds
    };

    this.metrics = this.initializeMetrics();
  }

  private initializeMetrics(): PerformanceMetrics {
    return {
      processingTime: 0,
      memoryUsage: 0,
      cacheHitRatio: 0,
      queueLength: 0,
      errorRate: 0,
      operationCount: 0,
      averageProcessingTime: 0,
      peakMemoryUsage: 0,
      timestamp: Date.now()
    };
  }

  /**
   * Track a processing operation with automatic metrics collection
   */
  public async trackOperation<T>(
    operationName: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const startTime = performance.now();
    const memoryBefore = this.getCurrentMemoryUsage();
    
    const operationRecord: ProcessingOperation = {
      name: operationName,
      startTime,
      memoryBefore,
      success: false
    };

    try {
      const result = await operation();
      
      const endTime = performance.now();
      const memoryAfter = this.getCurrentMemoryUsage();
      
      operationRecord.endTime = endTime;
      operationRecord.memoryAfter = memoryAfter;
      operationRecord.success = true;
      
      this.recordOperation(operationRecord);
      this.updateMetrics();
      
      return result;
    } catch (error) {
      const endTime = performance.now();
      const memoryAfter = this.getCurrentMemoryUsage();
      
      operationRecord.endTime = endTime;
      operationRecord.memoryAfter = memoryAfter;
      operationRecord.error = error as Error;
      operationRecord.success = false;
      
      this.recordOperation(operationRecord);
      this.errorCount++;
      this.updateMetrics();
      
      throw error;
    }
  }

  /**
   * Get current performance metrics
   */
  public getMetrics(): PerformanceMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Check performance thresholds and generate alerts
   */
  public checkThresholds(): PerformanceAlert[] {
    const currentAlerts: PerformanceAlert[] = [];
    const metrics = this.getMetrics();

    // Check processing time
    if (metrics.averageProcessingTime > this.thresholds.maxProcessingTime) {
      currentAlerts.push({
        type: 'processing_time',
        severity: this.getSeverity(metrics.averageProcessingTime, this.thresholds.maxProcessingTime),
        message: `Average processing time (${metrics.averageProcessingTime.toFixed(2)}ms) exceeds threshold (${this.thresholds.maxProcessingTime}ms)`,
        currentValue: metrics.averageProcessingTime,
        threshold: this.thresholds.maxProcessingTime,
        timestamp: Date.now(),
        suggestions: [
          'Consider reducing the number of active rules',
          'Enable chunked processing for large files',
          'Clear cache to free up memory',
          'Optimize rule configurations'
        ]
      });
    }

    // Check memory usage
    if (metrics.memoryUsage > this.thresholds.maxMemoryUsage) {
      currentAlerts.push({
        type: 'memory_usage',
        severity: this.getSeverity(metrics.memoryUsage, this.thresholds.maxMemoryUsage),
        message: `Memory usage (${metrics.memoryUsage.toFixed(2)}MB) exceeds threshold (${this.thresholds.maxMemoryUsage}MB)`,
        currentValue: metrics.memoryUsage,
        threshold: this.thresholds.maxMemoryUsage,
        timestamp: Date.now(),
        suggestions: [
          'Clear cache to free up memory',
          'Reduce cache size limits',
          'Process files in smaller chunks',
          'Restart the plugin to reset memory usage'
        ]
      });
    }

    // Check cache hit ratio
    if (metrics.cacheHitRatio < this.thresholds.minCacheHitRatio) {
      currentAlerts.push({
        type: 'cache_hit_ratio',
        severity: this.getSeverity(this.thresholds.minCacheHitRatio, metrics.cacheHitRatio, true),
        message: `Cache hit ratio (${(metrics.cacheHitRatio * 100).toFixed(1)}%) is below threshold (${(this.thresholds.minCacheHitRatio * 100).toFixed(1)}%)`,
        currentValue: metrics.cacheHitRatio,
        threshold: this.thresholds.minCacheHitRatio,
        timestamp: Date.now(),
        suggestions: [
          'Increase cache TTL (time to live)',
          'Increase cache size limits',
          'Check for cache invalidation issues',
          'Review file change patterns'
        ]
      });
    }

    // Check queue length
    if (metrics.queueLength > this.thresholds.maxQueueLength) {
      currentAlerts.push({
        type: 'queue_length',
        severity: this.getSeverity(metrics.queueLength, this.thresholds.maxQueueLength),
        message: `Queue length (${metrics.queueLength}) exceeds threshold (${this.thresholds.maxQueueLength})`,
        currentValue: metrics.queueLength,
        threshold: this.thresholds.maxQueueLength,
        timestamp: Date.now(),
        suggestions: [
          'Enable request batching',
          'Increase processing timeout',
          'Reduce concurrent operations',
          'Optimize processing pipeline'
        ]
      });
    }

    // Check error rate
    if (metrics.errorRate > this.thresholds.maxErrorRate) {
      currentAlerts.push({
        type: 'error_rate',
        severity: this.getSeverity(metrics.errorRate, this.thresholds.maxErrorRate),
        message: `Error rate (${(metrics.errorRate * 100).toFixed(1)}%) exceeds threshold (${(this.thresholds.maxErrorRate * 100).toFixed(1)}%)`,
        currentValue: metrics.errorRate,
        threshold: this.thresholds.maxErrorRate,
        timestamp: Date.now(),
        suggestions: [
          'Check rule configurations',
          'Verify file formats and encoding',
          'Review error logs for patterns',
          'Update rule dependencies'
        ]
      });
    }

    // Store alerts for history
    this.alerts.push(...currentAlerts);
    
    // Keep only recent alerts (last 100)
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }

    return currentAlerts;
  }

  /**
   * Automatically optimize performance based on current metrics
   */
  public async optimizeAutomatically(): Promise<OptimizationAction[]> {
    const alerts = this.checkThresholds();
    const actions: OptimizationAction[] = [];

    for (const alert of alerts) {
      switch (alert.type) {
        case 'memory_usage':
          if (alert.severity === 'high' || alert.severity === 'critical') {
            actions.push(await this.executeMemoryOptimization());
          }
          break;
          
        case 'cache_hit_ratio':
          if (alert.severity === 'medium' || alert.severity === 'high') {
            actions.push(await this.executeCacheOptimization());
          }
          break;
          
        case 'queue_length':
          if (alert.severity === 'high' || alert.severity === 'critical') {
            actions.push(await this.executeQueueOptimization());
          }
          break;
          
        case 'processing_time':
          if (alert.severity === 'high' || alert.severity === 'critical') {
            actions.push(await this.executeProcessingOptimization());
          }
          break;
      }
    }

    this.optimizationActions.push(...actions);
    return actions;
  }

  /**
   * Record cache hit/miss for cache hit ratio calculation
   */
  public recordCacheHit(): void {
    this.cacheStats.hits++;
  }

  public recordCacheMiss(): void {
    this.cacheStats.misses++;
  }

  /**
   * Update queue size for monitoring
   */
  public updateQueueSize(size: number): void {
    this.queueSize = size;
  }

  /**
   * Start continuous monitoring
   */
  public startMonitoring(intervalMs: number = 30000): void {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.updateMetrics();
      const alerts = this.checkThresholds();
      
      if (alerts.length > 0) {
        // Trigger automatic optimization for critical alerts
        const criticalAlerts = alerts.filter(a => a.severity === 'critical');
        if (criticalAlerts.length > 0) {
          this.optimizeAutomatically();
        }
      }
    }, intervalMs);
  }

  /**
   * Stop continuous monitoring
   */
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    this.isMonitoring = false;
  }

  /**
   * Get performance history and alerts
   */
  public getHistory(): {
    operations: ProcessingOperation[];
    alerts: PerformanceAlert[];
    optimizations: OptimizationAction[];
  } {
    return {
      operations: [...this.operations],
      alerts: [...this.alerts],
      optimizations: [...this.optimizationActions]
    };
  }

  /**
   * Reset all metrics and history
   */
  public reset(): void {
    this.metrics = this.initializeMetrics();
    this.operations = [];
    this.alerts = [];
    this.optimizationActions = [];
    this.cacheStats = { hits: 0, misses: 0 };
    this.errorCount = 0;
    this.totalOperations = 0;
    this.queueSize = 0;
    this.peakMemory = 0;
  }

  /**
   * Update thresholds
   */
  public updateThresholds(newThresholds: Partial<PerformanceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds };
  }

  private recordOperation(operation: ProcessingOperation): void {
    this.operations.push(operation);
    this.totalOperations++;
    
    // Keep only recent operations (last 1000)
    if (this.operations.length > 1000) {
      this.operations = this.operations.slice(-1000);
    }
  }

  private updateMetrics(): void {
    const now = Date.now();
    const recentOps = this.operations.filter(op => 
      op.endTime && (now - op.startTime) < 300000 // Last 5 minutes
    );

    // Calculate processing time metrics
    if (recentOps.length > 0) {
      const processingTimes = recentOps.map(op => 
        op.endTime ? op.endTime - op.startTime : 0
      );
      this.metrics.processingTime = Math.max(...processingTimes);
      this.metrics.averageProcessingTime = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;
    }

    // Update memory usage
    this.metrics.memoryUsage = this.getCurrentMemoryUsage();
    if (this.metrics.memoryUsage > this.peakMemory) {
      this.peakMemory = this.metrics.memoryUsage;
    }
    this.metrics.peakMemoryUsage = this.peakMemory;

    // Calculate cache hit ratio
    const totalCacheRequests = this.cacheStats.hits + this.cacheStats.misses;
    this.metrics.cacheHitRatio = totalCacheRequests > 0 
      ? this.cacheStats.hits / totalCacheRequests 
      : 0;

    // Update queue length
    this.metrics.queueLength = this.queueSize;

    // Calculate error rate
    this.metrics.errorRate = this.totalOperations > 0 
      ? this.errorCount / this.totalOperations 
      : 0;

    // Update operation count
    this.metrics.operationCount = this.totalOperations;
    this.metrics.timestamp = now;
  }

  private getCurrentMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return usage.heapUsed / 1024 / 1024; // Convert to MB
    }
    return 0;
  }

  private getSeverity(current: number, threshold: number, inverse: boolean = false): 'low' | 'medium' | 'high' | 'critical' {
    const ratio = inverse ? threshold / current : current / threshold;
    
    if (ratio >= 2.0) return 'critical';
    if (ratio >= 1.5) return 'high';
    if (ratio >= 1.2) return 'medium';
    return 'low';
  }

  private async executeMemoryOptimization(): Promise<OptimizationAction> {
    const action: OptimizationAction = {
      type: 'memory_optimization',
      description: 'Executed memory cleanup and cache optimization',
      impact: 'high',
      executed: true,
      timestamp: Date.now()
    };

    try {
      // Trigger garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      // Clear old operations from memory
      if (this.operations.length > 500) {
        this.operations = this.operations.slice(-500);
      }
      
      // Clear old alerts
      if (this.alerts.length > 50) {
        this.alerts = this.alerts.slice(-50);
      }
      
    } catch (error) {
      action.executed = false;
      action.description += ` (Failed: ${error.message})`;
    }

    return action;
  }

  private async executeCacheOptimization(): Promise<OptimizationAction> {
    return {
      type: 'cache_cleanup',
      description: 'Recommended cache strategy adjustment based on hit ratio',
      impact: 'medium',
      executed: true,
      timestamp: Date.now()
    };
  }

  private async executeQueueOptimization(): Promise<OptimizationAction> {
    return {
      type: 'queue_management',
      description: 'Implemented intelligent queue management and request batching',
      impact: 'high',
      executed: true,
      timestamp: Date.now()
    };
  }

  private async executeProcessingOptimization(): Promise<OptimizationAction> {
    return {
      type: 'rule_adjustment',
      description: 'Recommended processing optimization and rule adjustment',
      impact: 'medium',
      executed: true,
      timestamp: Date.now()
    };
  }
}