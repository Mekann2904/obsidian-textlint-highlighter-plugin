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
    for (let i = 0; i < count && this.tail; i++) {
      const key = this.tail.key;
      this.remove(key);
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }

  private getMemoryInfo(): { heapUsed: number; heapTotal: number; external: number } {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return {
        heapUsed: usage.heapUsed / (1024 * 1024),
        heapTotal: usage.heapTotal / (1024 * 1024),
        external: usage.external / (1024 * 1024)
      };
    }
    
    // ブラウザ環境のフォールバック
    return { heapUsed: 0, heapTotal: 0, external: 0 };
  }
}

/**
 * メモリ管理とパフォーマンス最適化を行うクラス
 */
export class MemoryManager {
  private static instance: MemoryManager;
  private gcTimer: NodeJS.Timeout | null = null;
  private performanceMetrics = {
    startTime: Date.now(),
    totalOperations: 0,
    memoryUsage: {
      peak: 0,
      current: 0,
      lastGc: Date.now()
    }
  };

  private constructor() {}

  public static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  /**
   * 処理を非同期にチャンク分割して実行する
   */
  public async processInChunks<T>(
    items: T[],
    processor: (item: T) => Promise<void> | void,
    chunkSize: number = 10,
    delayMs: number = 1
  ): Promise<void> {
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      
      await Promise.all(chunk.map(item => processor(item)));
      
      // 次のチャンクまで短時間待機（UIのブロッキングを防ぐ）
      if (i + chunkSize < items.length) {
        await this.sleep(delayMs);
      }
    }
  }

  /**
   * requestIdleCallbackを使用してアイドル時間に処理を実行
   */
  public runWhenIdle(callback: () => void, timeout: number = 5000): void {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(
        (deadline) => {
          if (deadline.timeRemaining() > 0) {
            callback();
          } else {
            // アイドル時間がない場合は通常のsetTimeoutで実行
            setTimeout(callback, 0);
          }
        },
        { timeout }
      );
    } else {
      // フォールバック
      setTimeout(callback, 0);
    }
  }

  /**
   * デバウンス処理の最適化版
   */
  public createOptimizedDebouncer(
    callback: () => void,
    delay: number = 300
  ): () => void {
    let timeoutId: NodeJS.Timeout | null = null;
    let lastCallTime = 0;

    return () => {
      const now = Date.now();
      const timeSinceLastCall = now - lastCallTime;

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // 頻繁な呼び出しの場合は遅延を少し増やす
      const adaptiveDelay = timeSinceLastCall < 100 ? delay * 1.5 : delay;

      timeoutId = setTimeout(() => {
        lastCallTime = Date.now();
        callback();
        timeoutId = null;
      }, adaptiveDelay);
    };
  }

  /**
   * スロットリング処理（一定間隔でのみ実行）
   */
  public createThrottler(
    callback: () => void,
    interval: number = 100
  ): () => void {
    let lastExecution = 0;
    let timeoutId: NodeJS.Timeout | null = null;

    return () => {
      const now = Date.now();
      const timeSinceLastExecution = now - lastExecution;

      if (timeSinceLastExecution >= interval) {
        lastExecution = now;
        callback();
      } else if (!timeoutId) {
        const remainingTime = interval - timeSinceLastExecution;
        timeoutId = setTimeout(() => {
          lastExecution = Date.now();
          callback();
          timeoutId = null;
        }, remainingTime);
      }
    };
  }

  /**
   * メモリ使用量を監視
   */
  public monitorMemoryUsage(): void {
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      const memory = (performance as any).memory;
      this.performanceMetrics.memoryUsage.current = memory.usedJSHeapSize;
      
      if (memory.usedJSHeapSize > this.performanceMetrics.memoryUsage.peak) {
        this.performanceMetrics.memoryUsage.peak = memory.usedJSHeapSize;
      }
    }
  }

  /**
   * 定期的なガベージコレクション促進
   */
  public scheduleGarbageCollection(intervalMs: number = 30000): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
    }

    this.gcTimer = setInterval(() => {
      this.performGarbageCollection();
    }, intervalMs);
  }

  /**
   * ガベージコレクションの促進
   */
  private performGarbageCollection(): void {
    if (typeof global !== 'undefined' && global.gc) {
      global.gc();
      this.performanceMetrics.memoryUsage.lastGc = Date.now();
    }
  }

  /**
   * バッチ処理用のキュー
   */
  public createBatchProcessor<T>(
    processor: (items: T[]) => Promise<void> | void,
    batchSize: number = 50,
    maxWaitMs: number = 100
  ) {
    let queue: T[] = [];
    let timeoutId: NodeJS.Timeout | null = null;

    const processBatch = async () => {
      if (queue.length === 0) return;

      const batch = queue.splice(0, batchSize);
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      try {
        await processor(batch);
      } catch (error) {
        console.error('Batch processing error:', error);
      }

      // まだキューに項目がある場合は続行
      if (queue.length > 0) {
        timeoutId = setTimeout(processBatch, 1);
      }
    };

    return {
      add: (item: T) => {
        queue.push(item);

        if (queue.length >= batchSize) {
          // バッチサイズに達した場合は即座に処理
          processBatch();
        } else if (!timeoutId) {
          // 最大待機時間後に処理
          timeoutId = setTimeout(processBatch, maxWaitMs);
        }
      },
      flush: () => processBatch(),
      size: () => queue.length
    };
  }

  /**
   * sleep関数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * パフォーマンス統計の取得
   */
  public getPerformanceStats() {
    const uptime = Date.now() - this.performanceMetrics.startTime;
    const memoryStats = this.performanceMetrics.memoryUsage;

    return {
      uptime,
      totalOperations: this.performanceMetrics.totalOperations,
      operationsPerSecond: this.performanceMetrics.totalOperations / (uptime / 1000),
      memory: {
        current: memoryStats.current,
        peak: memoryStats.peak,
        timeSinceLastGc: Date.now() - memoryStats.lastGc
      }
    };
  }

  /**
   * リソースのクリーンアップ
   */
  public cleanup(): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
  }

  /**
   * 操作カウンターのインクリメント
   */
  public incrementOperationCount(): void {
    this.performanceMetrics.totalOperations++;
    this.monitorMemoryUsage();
  }
} 