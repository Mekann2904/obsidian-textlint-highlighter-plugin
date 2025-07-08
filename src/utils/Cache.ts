import { CacheEntry } from '../types';

export class Cache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly ttl: number; // Time to live in milliseconds

  constructor(ttl: number = 5 * 60 * 1000) { // Default 5 minutes
    this.ttl = ttl;
  }

  set(key: string, value: T, hash?: string): void {
    this.cache.set(key, {
      data: value,
      timestamp: Date.now(),
      hash
    });
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if cache entry has expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check if cache entry has expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  // Check if content hash matches cached version
  isValidByHash(key: string, currentHash: string): boolean {
    const entry = this.cache.get(key);
    if (!entry || !entry.hash) return false;
    
    // Check if cache entry has expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return false;
    }

    return entry.hash === currentHash;
  }

  // Get cache statistics for debugging
  getStats(): { size: number, keys: string[] } {
    this.cleanup(); // Clean expired entries first
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  // Clean up expired entries
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * 効率的なハッシュ関数 - SHA-256ベース
 */
export async function generateContentHash(content: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(content);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      console.warn('Failed to use crypto.subtle, falling back to simple hash');
    }
  }
  
  // Fallback to a better simple hash function
  return generateSimpleHash(content);
}

/**
 * シンプルなハッシュ関数（フォールバック用）
 */
export function generateSimpleHash(content: string): string {
  let hash = 0;
  if (content.length === 0) return hash.toString();
  
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Include content length to reduce hash collisions
  return `${hash}_${content.length}`;
} 