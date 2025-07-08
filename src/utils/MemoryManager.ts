export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  cacheSize: number;
  totalEntries: number;
}

export interface LRUCacheOptions {
  maxSize: number;
  maxMemoryMB: number;
  ttl: number;
  cleanupInterval: number;
}

class LRUNode<T> {
  key: string;
  value: T;
  size: number;
  timestamp: number;
  hash?: string;
  prev?: LRUNode<T>;
  next?: LRUNode<T>;

  constructor(key: string, value: T, size: number, hash?: string) {
    this.key = key;
    this.value = value;
    this.size = size;
    this.hash = hash;
    this.timestamp = Date.now();
  }
}

export class LRUCache<T> {
  private maxSize: number;
  private maxMemoryMB: number;
  private ttl: number;
  private cleanupInterval: number;
  private cache = new Map<string, LRUNode<T>>();
  private head?: LRUNode<T>;
  private tail?: LRUNode<T>;
  private currentSize = 0;
  private currentMemoryMB = 0;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(options: LRUCacheOptions) {
    this.maxSize = options.maxSize;
    this.maxMemoryMB = options.maxMemoryMB;
    this.ttl = options.ttl;
    this.cleanupInterval = options.cleanupInterval;
    
    this.startCleanupTimer();
  }

  set(key: string, value: T, hash?: string): void {
    const size = this.calculateSize(value);
    
    // 既存のエントリをチェック
    if (this.cache.has(key)) {
      this.remove(key);
    }

    const node = new LRUNode(key, value, size, hash);
    
    // メモリとサイズの制限をチェック
    this.evictIfNecessary(size);
    
    // 新しいノードを追加
    this.addToHead(node);
    this.cache.set(key, node);
    this.currentSize++;
    this.currentMemoryMB += size;
  }

  get(key: string): T | null {
    const node = this.cache.get(key);
    if (!node) return null;

    // TTLチェック
    if (Date.now() - node.timestamp > this.ttl) {
      this.remove(key);
      return null;
    }

    // 最近使用したノードとして移動
    this.moveToHead(node);
    return node.value;
  }

  has(key: string): boolean {
    const node = this.cache.get(key);
    if (!node) return false;

    // TTLチェック
    if (Date.now() - node.timestamp > this.ttl) {
      this.remove(key);
      return false;
    }

    return true;
  }

  remove(key: string): void {
    const node = this.cache.get(key);
    if (!node) return;

    this.removeNode(node);
    this.cache.delete(key);
    this.currentSize--;
    this.currentMemoryMB -= node.size;
  }

  clear(): void {
    this.cache.clear();
    this.head = undefined;
    this.tail = undefined;
    this.currentSize = 0;
    this.currentMemoryMB = 0;
  }

  getStats(): MemoryStats {
    const memInfo = this.getMemoryInfo();
    return {
      heapUsed: memInfo.heapUsed,
      heapTotal: memInfo.heapTotal,
      external: memInfo.external,
      cacheSize: this.currentMemoryMB,
      totalEntries: this.currentSize
    };
  }

  get size(): number {
    return this.currentSize;
  }

  keys(): IterableIterator<string> {
    return this.cache.keys();
  }

  values(): IterableIterator<T> {
    const values: T[] = [];
    for (const node of this.cache.values()) {
      values.push(node.value);
    }
    return values[Symbol.iterator]();
  }

  entries(): IterableIterator<[string, T]> {
    const entries: [string, T][] = [];
    for (const [key, node] of this.cache.entries()) {
      entries.push([key, node.value]);
    }
    return entries[Symbol.iterator]();
  }

  delete(key: string): boolean {
    const existed = this.cache.has(key);
    this.remove(key);
    return existed;
  }

  isValidByHash(key: string, currentHash: string): boolean {
    const node = this.cache.get(key);
    if (!node || !node.hash) return false;
    
    // TTLチェック
    if (Date.now() - node.timestamp > this.ttl) {
      this.remove(key);
      return false;
    }

    return node.hash === currentHash;
  }

  cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, node] of this.cache) {
      if (now - node.timestamp > this.ttl) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.remove(key);
    }

    // メモリプレッシャーがある場合の追加クリーンアップ
    if (this.currentMemoryMB > this.maxMemoryMB * 0.8) {
      this.evictLRU(Math.floor(this.currentSize * 0.2)); // 20%削除
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.clear();
  }

  private calculateSize(value: T): number {
    if (typeof value === 'string') {
      return value.length * 2 / (1024 * 1024); // 文字列サイズをMBで概算
    } else if (Array.isArray(value)) {
      return value.length * 0.1 / 1024; // 配列サイズをMBで概算
    } else if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value).length * 2 / (1024 * 1024); // オブジェクトサイズをMBで概算
    }
    return 0.001; // デフォルト1KB
  }

  private addToHead(node: LRUNode<T>): void {
    if (!this.head) {
      this.head = this.tail = node;
    } else {
      node.next = this.head;
      this.head.prev = node;
      this.head = node;
    }
  }

  private removeNode(node: LRUNode<T>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
  }

  private moveToHead(node: LRUNode<T>): void {
    this.removeNode(node);
    this.addToHead(node);
  }

  private evictIfNecessary(newSize: number): void {
    // サイズ制限チェック
    while (this.currentSize >= this.maxSize) {
      this.evictLRU(1);
    }

    // メモリ制限チェック
    while (this.currentMemoryMB + newSize > this.maxMemoryMB) {
      this.evictLRU(1);
    }
  }

  public evictLRU(count: number): void {
    for (let i = 0; i < count; i++) {
      if (this.tail) {
        this.remove(this.tail.key);
      }
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => this.cleanup(), this.cleanupInterval);
  }

  private getMemoryInfo(): { heapUsed: number; heapTotal: number; external: number } {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const mu = process.memoryUsage();
      return {
        heapUsed: mu.heapUsed / 1024 / 1024,
        heapTotal: mu.heapTotal / 1024 / 1024,
        external: mu.external / 1024 / 1024
      };
    }
    return { heapUsed: 0, heapTotal: 0, external: 0 };
  }
}

export class MemoryManager {
  private static instance: MemoryManager;
  private performanceMetrics = {
    totalOperations: 0,
    totalProcessingTime: 0,
    idleTasksExecuted: 0
  };

  private constructor() {}

  public static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  public async processInChunks<T>(
    items: T[],
    processor: (item: T) => Promise<void> | void,
    chunkSize: number = 10,
    delayMs: number = 1
  ): Promise<void> {
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      await Promise.all(chunk.map(processor));
      if (delayMs > 0) {
        await this.sleep(delayMs);
      }
    }
  }

  public runWhenIdle(callback: () => void, timeout: number = 5000): void {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(
        () => {
          callback();
          this.performanceMetrics.idleTasksExecuted++;
        },
        { timeout }
      );
    } else {
      setTimeout(() => {
        callback();
        this.performanceMetrics.idleTasksExecuted++;
      }, 200); // フォールバック
    }
  }

  public createOptimizedDebouncer(
    callback: () => void,
    delay: number = 300
  ): () => void {
    let timeoutId: NodeJS.Timeout | null = null;
    let lastArgs: any[] | null = null;
    
    return (...args: any[]) => {
      lastArgs = args;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        callback.apply(null, lastArgs);
      }, delay);
    };
  }

  public createThrottler(
    callback: () => void,
    interval: number = 100
  ): () => void {
    let canRun = true;
    let queued = false;

    return () => {
      if (!canRun) {
        queued = true;
        return;
      }
      
      canRun = false;
      callback();
      
      setTimeout(() => {
        canRun = true;
        if (queued) {
          queued = false;
          callback();
        }
      }, interval);
    };
  }

  public createBatchProcessor<T>(
    processor: (items: T[]) => Promise<void> | void,
    batchSize: number = 50,
    maxWaitMs: number = 100
  ) {
    let batch: T[] = [];
    let timeout: NodeJS.Timeout | null = null;

    const processBatch = async () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      if (batch.length > 0) {
        const currentBatch = batch;
        batch = [];
        await processor(currentBatch);
      }
    };

    return {
      add: (item: T) => {
        batch.push(item);
        if (batch.length >= batchSize) {
          processBatch();
        } else if (!timeout) {
          timeout = setTimeout(processBatch, maxWaitMs);
        }
      },
      flush: processBatch
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public getPerformanceStats() {
    return {
      totalOperations: this.performanceMetrics.totalOperations,
      totalProcessingTime: this.performanceMetrics.totalProcessingTime,
      idleTasksExecuted: this.performanceMetrics.idleTasksExecuted,
    };
  }

  public cleanup(): void {
    this.performanceMetrics = {
      totalOperations: 0,
      totalProcessingTime: 0,
      idleTasksExecuted: 0
    };
  }

  public incrementOperationCount(): void {
    this.performanceMetrics.totalOperations++;
  }
} 