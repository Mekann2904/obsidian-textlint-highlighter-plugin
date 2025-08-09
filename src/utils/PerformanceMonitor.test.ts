import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PerformanceMonitor, PerformanceThresholds, PerformanceAlert } from './PerformanceMonitor';

// Mock global.gc for testing
const mockGc = vi.fn();
Object.defineProperty(global, 'gc', {
  value: mockGc,
  writable: true
});

// Mock process.memoryUsage for testing
const mockMemoryUsage = vi.fn(() => ({
  rss: 50 * 1024 * 1024, // 50MB
  heapTotal: 40 * 1024 * 1024, // 40MB
  heapUsed: 30 * 1024 * 1024, // 30MB
  external: 5 * 1024 * 1024, // 5MB
  arrayBuffers: 1 * 1024 * 1024 // 1MB
}));

Object.defineProperty(process, 'memoryUsage', {
  value: mockMemoryUsage,
  writable: true
});

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;
  let customThresholds: PerformanceThresholds;

  beforeEach(() => {
    customThresholds = {
      maxProcessingTime: 1000, // 1 second
      maxMemoryUsage: 50, // 50MB
      minCacheHitRatio: 0.7, // 70%
      maxQueueLength: 5,
      maxErrorRate: 0.05 // 5%
    };
    monitor = new PerformanceMonitor(customThresholds);
    vi.clearAllMocks();
  });

  afterEach(() => {
    monitor.stopMonitoring();
    monitor.reset();
  });

  describe('Initialization', () => {
    it('should initialize with default thresholds when none provided', () => {
      const defaultMonitor = new PerformanceMonitor();
      const metrics = defaultMonitor.getMetrics();
      
      expect(metrics.processingTime).toBe(0);
      expect(metrics.memoryUsage).toBeGreaterThanOrEqual(0);
      expect(metrics.cacheHitRatio).toBe(0);
      expect(metrics.queueLength).toBe(0);
      expect(metrics.errorRate).toBe(0);
    });

    it('should initialize with custom thresholds', () => {
      const metrics = monitor.getMetrics();
      
      expect(metrics.processingTime).toBe(0);
      expect(metrics.memoryUsage).toBeGreaterThanOrEqual(0);
      expect(metrics.cacheHitRatio).toBe(0);
      expect(metrics.queueLength).toBe(0);
      expect(metrics.errorRate).toBe(0);
    });
  });

  describe('Operation Tracking', () => {
    it('should track successful operations', async () => {
      const testOperation = vi.fn().mockResolvedValue('success');
      
      const result = await monitor.trackOperation('test-operation', testOperation);
      
      expect(result).toBe('success');
      expect(testOperation).toHaveBeenCalledOnce();
      
      const metrics = monitor.getMetrics();
      expect(metrics.operationCount).toBe(1);
      expect(metrics.errorRate).toBe(0);
      expect(metrics.averageProcessingTime).toBeGreaterThan(0);
    });

    it('should track failed operations', async () => {
      const testError = new Error('Test error');
      const testOperation = vi.fn().mockRejectedValue(testError);
      
      await expect(monitor.trackOperation('test-operation', testOperation)).rejects.toThrow('Test error');
      
      const metrics = monitor.getMetrics();
      expect(metrics.operationCount).toBe(1);
      expect(metrics.errorRate).toBe(1); // 100% error rate with 1 failed operation
    });

    it('should track multiple operations and calculate averages', async () => {
      const fastOperation = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('fast'), 10))
      );
      const slowOperation = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('slow'), 50))
      );
      
      await monitor.trackOperation('fast-op', fastOperation);
      await monitor.trackOperation('slow-op', slowOperation);
      
      const metrics = monitor.getMetrics();
      expect(metrics.operationCount).toBe(2);
      expect(metrics.averageProcessingTime).toBeGreaterThan(0);
      expect(metrics.errorRate).toBe(0);
    });
  });

  describe('Cache Statistics', () => {
    it('should track cache hits and misses', () => {
      monitor.recordCacheHit();
      monitor.recordCacheHit();
      monitor.recordCacheMiss();
      
      const metrics = monitor.getMetrics();
      expect(metrics.cacheHitRatio).toBeCloseTo(0.67, 2); // 2/3 = 0.67
    });

    it('should handle zero cache requests', () => {
      const metrics = monitor.getMetrics();
      expect(metrics.cacheHitRatio).toBe(0);
    });

    it('should calculate 100% hit ratio with only hits', () => {
      monitor.recordCacheHit();
      monitor.recordCacheHit();
      monitor.recordCacheHit();
      
      const metrics = monitor.getMetrics();
      expect(metrics.cacheHitRatio).toBe(1);
    });
  });

  describe('Queue Management', () => {
    it('should track queue size updates', () => {
      monitor.updateQueueSize(3);
      
      const metrics = monitor.getMetrics();
      expect(metrics.queueLength).toBe(3);
    });

    it('should update queue size dynamically', () => {
      monitor.updateQueueSize(5);
      expect(monitor.getMetrics().queueLength).toBe(5);
      
      monitor.updateQueueSize(2);
      expect(monitor.getMetrics().queueLength).toBe(2);
    });
  });

  describe('Threshold Checking', () => {
    it('should generate processing time alerts', async () => {
      // Create a slow operation that exceeds threshold
      const slowOperation = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('slow'), 1500)) // 1.5 seconds
      );
      
      await monitor.trackOperation('slow-operation', slowOperation);
      
      const alerts = monitor.checkThresholds();
      const processingAlert = alerts.find(alert => alert.type === 'processing_time');
      
      expect(processingAlert).toBeDefined();
      expect(processingAlert?.severity).toBeDefined();
      expect(processingAlert?.message).toContain('processing time');
      expect(processingAlert?.suggestions).toHaveLength(4);
    });

    it('should generate memory usage alerts', () => {
      // Mock high memory usage
      mockMemoryUsage.mockReturnValue({
        rss: 100 * 1024 * 1024, // 100MB
        heapTotal: 80 * 1024 * 1024, // 80MB
        heapUsed: 60 * 1024 * 1024, // 60MB (exceeds 50MB threshold)
        external: 10 * 1024 * 1024, // 10MB
        arrayBuffers: 5 * 1024 * 1024 // 5MB
      });
      
      const alerts = monitor.checkThresholds();
      const memoryAlert = alerts.find(alert => alert.type === 'memory_usage');
      
      expect(memoryAlert).toBeDefined();
      expect(memoryAlert?.message).toContain('Memory usage');
      expect(memoryAlert?.suggestions).toHaveLength(4);
    });

    it('should generate cache hit ratio alerts', () => {
      // Create poor cache hit ratio
      monitor.recordCacheHit();
      monitor.recordCacheMiss();
      monitor.recordCacheMiss();
      monitor.recordCacheMiss(); // 25% hit ratio, below 70% threshold
      
      const alerts = monitor.checkThresholds();
      const cacheAlert = alerts.find(alert => alert.type === 'cache_hit_ratio');
      
      expect(cacheAlert).toBeDefined();
      expect(cacheAlert?.message).toContain('Cache hit ratio');
      expect(cacheAlert?.suggestions).toHaveLength(4);
    });

    it('should generate queue length alerts', () => {
      monitor.updateQueueSize(10); // Exceeds threshold of 5
      
      const alerts = monitor.checkThresholds();
      const queueAlert = alerts.find(alert => alert.type === 'queue_length');
      
      expect(queueAlert).toBeDefined();
      expect(queueAlert?.message).toContain('Queue length');
      expect(queueAlert?.suggestions).toHaveLength(4);
    });

    it('should generate error rate alerts', async () => {
      // Create operations with high error rate
      const errorOperation = vi.fn().mockRejectedValue(new Error('Test error'));
      const successOperation = vi.fn().mockResolvedValue('success');
      
      try { await monitor.trackOperation('error-op-1', errorOperation); } catch {}
      try { await monitor.trackOperation('error-op-2', errorOperation); } catch {}
      await monitor.trackOperation('success-op', successOperation);
      // Error rate: 2/3 = 66.7%, exceeds 5% threshold
      
      const alerts = monitor.checkThresholds();
      const errorAlert = alerts.find(alert => alert.type === 'error_rate');
      
      expect(errorAlert).toBeDefined();
      expect(errorAlert?.message).toContain('Error rate');
      expect(errorAlert?.suggestions).toHaveLength(4);
    });

    it('should not generate alerts when thresholds are not exceeded', async () => {
      // Create normal operations
      const normalOperation = vi.fn().mockResolvedValue('success');
      await monitor.trackOperation('normal-op', normalOperation);
      
      monitor.recordCacheHit();
      monitor.recordCacheHit();
      monitor.recordCacheHit(); // 100% hit ratio
      
      monitor.updateQueueSize(2); // Below threshold
      
      const alerts = monitor.checkThresholds();
      expect(alerts).toHaveLength(0);
    });
  });

  describe('Alert Severity Classification', () => {
    it('should classify alert severity correctly', async () => {
      // Create operation that significantly exceeds threshold
      const verySlowOperation = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('very-slow'), 3000)) // 3 seconds, 3x threshold
      );
      
      await monitor.trackOperation('very-slow-operation', verySlowOperation);
      
      const alerts = monitor.checkThresholds();
      const processingAlert = alerts.find(alert => alert.type === 'processing_time');
      
      expect(processingAlert?.severity).toBe('critical'); // 3x threshold should be critical
    });
  });

  describe('Automatic Optimization', () => {
    it('should execute memory optimization for high memory alerts', async () => {
      // Mock high memory usage
      mockMemoryUsage.mockReturnValue({
        rss: 200 * 1024 * 1024, // 200MB
        heapTotal: 150 * 1024 * 1024, // 150MB
        heapUsed: 120 * 1024 * 1024, // 120MB (significantly exceeds threshold)
        external: 20 * 1024 * 1024, // 20MB
        arrayBuffers: 10 * 1024 * 1024 // 10MB
      });
      
      const actions = await monitor.optimizeAutomatically();
      const memoryAction = actions.find(action => action.type === 'memory_optimization');
      
      expect(memoryAction).toBeDefined();
      expect(memoryAction?.executed).toBe(true);
      expect(memoryAction?.impact).toBe('high');
      expect(mockGc).toHaveBeenCalled();
    });

    it('should execute cache optimization for low hit ratio', async () => {
      // Create poor cache hit ratio
      monitor.recordCacheHit();
      for (let i = 0; i < 10; i++) {
        monitor.recordCacheMiss();
      }
      
      const actions = await monitor.optimizeAutomatically();
      const cacheAction = actions.find(action => action.type === 'cache_cleanup');
      
      expect(cacheAction).toBeDefined();
      expect(cacheAction?.executed).toBe(true);
    });

    it('should execute queue optimization for high queue length', async () => {
      monitor.updateQueueSize(20); // Significantly exceeds threshold
      
      const actions = await monitor.optimizeAutomatically();
      const queueAction = actions.find(action => action.type === 'queue_management');
      
      expect(queueAction).toBeDefined();
      expect(queueAction?.executed).toBe(true);
      expect(queueAction?.impact).toBe('high');
    });

    it('should execute processing optimization for slow operations', async () => {
      const verySlowOperation = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('very-slow'), 2500))
      );
      
      await monitor.trackOperation('very-slow-operation', verySlowOperation);
      
      const actions = await monitor.optimizeAutomatically();
      const processingAction = actions.find(action => action.type === 'rule_adjustment');
      
      expect(processingAction).toBeDefined();
      expect(processingAction?.executed).toBe(true);
    });
  });

  describe('Continuous Monitoring', () => {
    it('should start and stop monitoring', () => {
      expect(monitor['isMonitoring']).toBe(false);
      
      monitor.startMonitoring(100); // 100ms interval for testing
      expect(monitor['isMonitoring']).toBe(true);
      
      monitor.stopMonitoring();
      expect(monitor['isMonitoring']).toBe(false);
    });

    it('should not start monitoring if already monitoring', () => {
      monitor.startMonitoring(100);
      const firstInterval = monitor['monitoringInterval'];
      
      monitor.startMonitoring(200); // Try to start again
      const secondInterval = monitor['monitoringInterval'];
      
      expect(firstInterval).toBe(secondInterval); // Should be the same interval
      
      monitor.stopMonitoring();
    });

    it('should trigger automatic optimization for critical alerts during monitoring', async () => {
      const optimizeSpy = vi.spyOn(monitor, 'optimizeAutomatically');
      
      // Mock critical memory usage
      mockMemoryUsage.mockReturnValue({
        rss: 300 * 1024 * 1024,
        heapTotal: 250 * 1024 * 1024,
        heapUsed: 200 * 1024 * 1024, // Critical level
        external: 30 * 1024 * 1024,
        arrayBuffers: 20 * 1024 * 1024
      });
      
      monitor.startMonitoring(50); // Very short interval for testing
      
      // Wait for monitoring cycle
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(optimizeSpy).toHaveBeenCalled();
      
      monitor.stopMonitoring();
    });
  });

  describe('History and Data Management', () => {
    it('should provide performance history', async () => {
      const testOperation = vi.fn().mockResolvedValue('success');
      await monitor.trackOperation('test-operation', testOperation);
      
      monitor.recordCacheHit();
      monitor.updateQueueSize(3);
      
      const alerts = monitor.checkThresholds();
      const actions = await monitor.optimizeAutomatically();
      
      const history = monitor.getHistory();
      
      expect(history.operations).toHaveLength(1);
      expect(history.alerts).toHaveLength(alerts.length);
      expect(history.optimizations).toHaveLength(actions.length);
    });

    it('should limit operation history to prevent memory leaks', async () => {
      const testOperation = vi.fn().mockResolvedValue('success');
      
      // Create more than 1000 operations
      for (let i = 0; i < 1100; i++) {
        await monitor.trackOperation(`test-operation-${i}`, testOperation);
      }
      
      const history = monitor.getHistory();
      expect(history.operations.length).toBeLessThanOrEqual(1000);
    });

    it('should limit alert history to prevent memory leaks', () => {
      // Mock conditions that generate alerts
      monitor.updateQueueSize(10);
      
      // Generate more than 100 alerts
      for (let i = 0; i < 110; i++) {
        monitor.checkThresholds();
      }
      
      const history = monitor.getHistory();
      expect(history.alerts.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset all metrics and history', async () => {
      const testOperation = vi.fn().mockResolvedValue('success');
      await monitor.trackOperation('test-operation', testOperation);
      
      monitor.recordCacheHit();
      monitor.updateQueueSize(5);
      monitor.checkThresholds();
      
      // Verify data exists
      expect(monitor.getMetrics().operationCount).toBe(1);
      expect(monitor.getHistory().operations).toHaveLength(1);
      
      monitor.reset();
      
      // Verify reset
      const metrics = monitor.getMetrics();
      expect(metrics.operationCount).toBe(0);
      expect(metrics.cacheHitRatio).toBe(0);
      expect(metrics.queueLength).toBe(0);
      expect(metrics.errorRate).toBe(0);
      
      const history = monitor.getHistory();
      expect(history.operations).toHaveLength(0);
      expect(history.alerts).toHaveLength(0);
      expect(history.optimizations).toHaveLength(0);
    });
  });

  describe('Threshold Updates', () => {
    it('should update thresholds dynamically', () => {
      const newThresholds = {
        maxProcessingTime: 2000,
        maxMemoryUsage: 100
      };
      
      monitor.updateThresholds(newThresholds);
      
      // Test that new thresholds are applied
      monitor.updateQueueSize(8); // Should not trigger alert with default threshold (10)
      const alerts = monitor.checkThresholds();
      
      // Should still use old queue threshold (5), so this should trigger alert
      const queueAlert = alerts.find(alert => alert.type === 'queue_length');
      expect(queueAlert).toBeDefined();
    });
  });

  describe('Memory Usage Calculation', () => {
    it('should handle missing process.memoryUsage gracefully', () => {
      // Temporarily remove process.memoryUsage
      const originalMemoryUsage = process.memoryUsage;
      delete (process as any).memoryUsage;
      
      const testMonitor = new PerformanceMonitor();
      const metrics = testMonitor.getMetrics();
      
      expect(metrics.memoryUsage).toBe(0);
      
      // Restore process.memoryUsage
      process.memoryUsage = originalMemoryUsage;
    });
  });

  describe('Error Handling in Optimization', () => {
    it('should handle garbage collection errors gracefully', async () => {
      // Mock gc to throw an error
      mockGc.mockImplementation(() => {
        throw new Error('GC failed');
      });
      
      // Mock high memory usage to trigger optimization
      mockMemoryUsage.mockReturnValue({
        rss: 200 * 1024 * 1024,
        heapTotal: 150 * 1024 * 1024,
        heapUsed: 120 * 1024 * 1024,
        external: 20 * 1024 * 1024,
        arrayBuffers: 10 * 1024 * 1024
      });
      
      const actions = await monitor.optimizeAutomatically();
      const memoryAction = actions.find(action => action.type === 'memory_optimization');
      
      expect(memoryAction).toBeDefined();
      expect(memoryAction?.executed).toBe(false);
      expect(memoryAction?.description).toContain('Failed');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero processing time operations', async () => {
      const instantOperation = vi.fn().mockResolvedValue('instant');
      
      await monitor.trackOperation('instant-operation', instantOperation);
      
      const metrics = monitor.getMetrics();
      expect(metrics.averageProcessingTime).toBeGreaterThanOrEqual(0);
      expect(metrics.operationCount).toBe(1);
    });

    it('should handle operations with undefined return values', async () => {
      const undefinedOperation = vi.fn().mockResolvedValue(undefined);
      
      const result = await monitor.trackOperation('undefined-operation', undefinedOperation);
      
      expect(result).toBeUndefined();
      expect(monitor.getMetrics().operationCount).toBe(1);
    });

    it('should handle concurrent operations correctly', async () => {
      const operation1 = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('op1'), 100))
      );
      const operation2 = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('op2'), 150))
      );
      
      const [result1, result2] = await Promise.all([
        monitor.trackOperation('concurrent-op-1', operation1),
        monitor.trackOperation('concurrent-op-2', operation2)
      ]);
      
      expect(result1).toBe('op1');
      expect(result2).toBe('op2');
      expect(monitor.getMetrics().operationCount).toBe(2);
    });
  });
});