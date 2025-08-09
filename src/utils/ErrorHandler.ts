import { Notice } from 'obsidian';

// Error classification enums
export enum ErrorSeverity {
  LOW = 'low',        // Non-critical, continue operation
  MEDIUM = 'medium',  // Degraded functionality, notify user
  HIGH = 'high',      // Major feature broken, offer alternatives
  CRITICAL = 'critical' // Plugin unusable, require intervention
}

export enum ErrorCategory {
  RULE_LOADING = 'rule_loading',
  PROCESSING = 'processing',
  MEMORY = 'memory',
  NETWORK = 'network',
  CONFIGURATION = 'configuration',
  UI = 'ui'
}

// Error context interface
export interface ErrorContext {
  operation: string;
  file?: string;
  timestamp: number;
  stackTrace?: string;
  userAction?: string;
  additionalData?: Record<string, any>;
}

// Error recovery strategy interface
export interface ErrorRecoveryStrategy {
  canRecover: boolean;
  fallbackAction: () => Promise<void>;
  userMessage: string;
  retryOptions?: {
    maxRetries: number;
    backoffMs: number;
  };
  severity: ErrorSeverity;
  category: ErrorCategory;
}

// Memory statistics interface
export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  cacheSize: number;
  totalEntries: number;
}

// Error log entry interface
export interface ErrorLogEntry {
  id: string;
  timestamp: number;
  severity: ErrorSeverity;
  category: ErrorCategory;
  message: string;
  context: ErrorContext;
  resolved: boolean;
  recoveryAttempts: number;
}

/**
 * Centralized error handling system for the Textlint plugin
 * Provides error classification, recovery strategies, and logging
 */
export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorLog: ErrorLogEntry[] = [];
  private maxLogEntries = 100;
  private enableDebugLog = false;
  private retryAttempts = new Map<string, number>();

  private constructor() {}

  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  public setDebugMode(enabled: boolean): void {
    this.enableDebugLog = enabled;
  }

  /**
   * Handle rule loading errors with appropriate recovery strategies
   */
  public handleRuleLoadError(error: Error, ruleId: string): ErrorRecoveryStrategy {
    const context: ErrorContext = {
      operation: 'rule_loading',
      timestamp: Date.now(),
      stackTrace: error.stack,
      additionalData: { ruleId }
    };

    this.logError(error, context);

    // Determine recovery strategy based on error type
    if (error.message.includes('MODULE_NOT_FOUND') || error.message.includes('Cannot resolve')) {
      return {
        canRecover: true,
        fallbackAction: async () => {
          if (this.enableDebugLog) {
            console.warn(`Rule ${ruleId} not found, continuing with available rules`);
          }
        },
        userMessage: `Rule "${ruleId}" could not be loaded. Continuing with available rules.`,
        severity: ErrorSeverity.MEDIUM,
        category: ErrorCategory.RULE_LOADING
      };
    }

    if (error.message.includes('timeout') || error.message.includes('TIMEOUT')) {
      return {
        canRecover: true,
        fallbackAction: async () => {
          if (this.enableDebugLog) {
            console.warn(`Rule ${ruleId} loading timed out, skipping`);
          }
        },
        userMessage: `Rule "${ruleId}" loading timed out. Skipping this rule.`,
        retryOptions: {
          maxRetries: 2,
          backoffMs: 1000
        },
        severity: ErrorSeverity.MEDIUM,
        category: ErrorCategory.RULE_LOADING
      };
    }

    // Generic rule loading error
    return {
      canRecover: true,
      fallbackAction: async () => {
        if (this.enableDebugLog) {
          console.error(`Failed to load rule ${ruleId}:`, error);
        }
      },
      userMessage: `Failed to load rule "${ruleId}". Check console for details.`,
      severity: ErrorSeverity.HIGH,
      category: ErrorCategory.RULE_LOADING
    };
  }

  /**
   * Handle processing timeout errors
   */
  public handleProcessingTimeout(context: ErrorContext): ErrorRecoveryStrategy {
    this.logError(new Error('Processing timeout'), context);

    return {
      canRecover: true,
      fallbackAction: async () => {
        if (this.enableDebugLog) {
          console.warn('Processing timed out, offering chunked processing');
        }
      },
      userMessage: 'File processing timed out. Try enabling chunked processing for large files.',
      retryOptions: {
        maxRetries: 1,
        backoffMs: 2000
      },
      severity: ErrorSeverity.MEDIUM,
      category: ErrorCategory.PROCESSING
    };
  }

  /**
   * Handle memory pressure situations
   */
  public handleMemoryPressure(stats: MemoryStats): ErrorRecoveryStrategy {
    const context: ErrorContext = {
      operation: 'memory_management',
      timestamp: Date.now(),
      additionalData: { memoryStats: stats }
    };

    this.logError(new Error('Memory pressure detected'), context);

    const isHighPressure = stats.heapUsed > 100; // 100MB threshold

    return {
      canRecover: true,
      fallbackAction: async () => {
        if (this.enableDebugLog) {
          console.warn('Memory pressure detected, triggering cleanup');
        }
        // Trigger garbage collection if available
        if (global.gc) {
          global.gc();
        }
      },
      userMessage: isHighPressure 
        ? 'High memory usage detected. Cache will be cleared to free memory.'
        : 'Memory usage is elevated. Consider processing smaller files.',
      severity: isHighPressure ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM,
      category: ErrorCategory.MEMORY
    };
  }

  /**
   * Handle network-related errors
   */
  public handleNetworkError(error: Error): ErrorRecoveryStrategy {
    const context: ErrorContext = {
      operation: 'network_request',
      timestamp: Date.now(),
      stackTrace: error.stack
    };

    this.logError(error, context);

    const isConnectionError = error.message.includes('ENOTFOUND') || 
                             error.message.includes('ECONNREFUSED') ||
                             error.message.includes('timeout');

    return {
      canRecover: true,
      fallbackAction: async () => {
        if (this.enableDebugLog) {
          console.warn('Network error, switching to offline mode');
        }
      },
      userMessage: isConnectionError 
        ? 'Network connection failed. Using cached resources.'
        : 'Network error occurred. Some features may be limited.',
      retryOptions: {
        maxRetries: 3,
        backoffMs: 2000
      },
      severity: ErrorSeverity.MEDIUM,
      category: ErrorCategory.NETWORK
    };
  }

  /**
   * Handle configuration errors
   */
  public handleConfigurationError(error: Error, configKey?: string): ErrorRecoveryStrategy {
    const context: ErrorContext = {
      operation: 'configuration',
      timestamp: Date.now(),
      stackTrace: error.stack,
      additionalData: { configKey }
    };

    this.logError(error, context);

    return {
      canRecover: true,
      fallbackAction: async () => {
        if (this.enableDebugLog) {
          console.warn(`Configuration error for ${configKey}, using defaults`);
        }
      },
      userMessage: configKey 
        ? `Configuration error for "${configKey}". Using default settings.`
        : 'Configuration error detected. Using default settings.',
      severity: ErrorSeverity.MEDIUM,
      category: ErrorCategory.CONFIGURATION
    };
  }

  /**
   * Handle UI-related errors
   */
  public handleUIError(error: Error, component?: string): ErrorRecoveryStrategy {
    const context: ErrorContext = {
      operation: 'ui_operation',
      timestamp: Date.now(),
      stackTrace: error.stack,
      additionalData: { component }
    };

    this.logError(error, context);

    return {
      canRecover: true,
      fallbackAction: async () => {
        if (this.enableDebugLog) {
          console.error(`UI error in ${component}:`, error);
        }
      },
      userMessage: component 
        ? `Error in ${component}. Some UI features may not work correctly.`
        : 'UI error occurred. Please refresh the interface.',
      severity: ErrorSeverity.MEDIUM,
      category: ErrorCategory.UI
    };
  }

  /**
   * Execute error recovery with retry logic
   */
  public async executeRecovery(
    strategy: ErrorRecoveryStrategy, 
    errorKey: string
  ): Promise<boolean> {
    if (!strategy.canRecover) {
      return false;
    }

    const currentAttempts = this.retryAttempts.get(errorKey) || 0;
    const maxRetries = strategy.retryOptions?.maxRetries || 0;

    if (currentAttempts >= maxRetries) {
      if (this.enableDebugLog) {
        console.warn(`Max retry attempts reached for ${errorKey}`);
      }
      return false;
    }

    try {
      // Apply backoff delay if specified
      if (strategy.retryOptions?.backoffMs && currentAttempts > 0) {
        const delay = strategy.retryOptions.backoffMs * Math.pow(2, currentAttempts - 1);
        await this.sleep(delay);
      }

      await strategy.fallbackAction();
      
      // Reset retry count on success
      this.retryAttempts.delete(errorKey);
      
      // Mark error as resolved in log
      this.markErrorResolved(errorKey);
      
      return true;
    } catch (recoveryError) {
      this.retryAttempts.set(errorKey, currentAttempts + 1);
      
      if (this.enableDebugLog) {
        console.error(`Recovery failed for ${errorKey}:`, recoveryError);
      }
      
      return false;
    }
  }

  /**
   * Show user notification based on error severity
   */
  public notifyUser(strategy: ErrorRecoveryStrategy): void {
    switch (strategy.severity) {
      case ErrorSeverity.LOW:
        if (this.enableDebugLog) {
          console.info(strategy.userMessage);
        }
        break;
      
      case ErrorSeverity.MEDIUM:
        new Notice(strategy.userMessage, 5000);
        break;
      
      case ErrorSeverity.HIGH:
        new Notice(strategy.userMessage, 8000);
        break;
      
      case ErrorSeverity.CRITICAL:
        new Notice(`Critical Error: ${strategy.userMessage}`, 0); // Persistent notice
        break;
    }
  }

  /**
   * Log error with context information
   */
  public logError(error: Error, context: ErrorContext): void {
    const logEntry: ErrorLogEntry = {
      id: this.generateErrorId(),
      timestamp: context.timestamp,
      severity: this.classifyErrorSeverity(error),
      category: this.classifyErrorCategory(context.operation),
      message: error.message,
      context,
      resolved: false,
      recoveryAttempts: 0
    };

    this.errorLog.push(logEntry);

    // Maintain log size limit
    if (this.errorLog.length > this.maxLogEntries) {
      this.errorLog = this.errorLog.slice(-this.maxLogEntries);
    }

    if (this.enableDebugLog) {
      console.error(`[${logEntry.category}:${logEntry.severity}] ${error.message}`, {
        context,
        stack: error.stack
      });
    }
  }

  /**
   * Get error statistics
   */
  public getErrorStats(): {
    totalErrors: number;
    errorsBySeverity: Record<ErrorSeverity, number>;
    errorsByCategory: Record<ErrorCategory, number>;
    recentErrors: ErrorLogEntry[];
    unresolvedErrors: number;
  } {
    const errorsBySeverity = Object.values(ErrorSeverity).reduce((acc, severity) => {
      acc[severity] = this.errorLog.filter(e => e.severity === severity).length;
      return acc;
    }, {} as Record<ErrorSeverity, number>);

    const errorsByCategory = Object.values(ErrorCategory).reduce((acc, category) => {
      acc[category] = this.errorLog.filter(e => e.category === category).length;
      return acc;
    }, {} as Record<ErrorCategory, number>);

    const recentErrors = this.errorLog
      .filter(e => Date.now() - e.timestamp < 24 * 60 * 60 * 1000) // Last 24 hours
      .slice(-10); // Last 10 errors

    const unresolvedErrors = this.errorLog.filter(e => !e.resolved).length;

    return {
      totalErrors: this.errorLog.length,
      errorsBySeverity,
      errorsByCategory,
      recentErrors,
      unresolvedErrors
    };
  }

  /**
   * Clear error log
   */
  public clearErrorLog(): void {
    this.errorLog = [];
    this.retryAttempts.clear();
  }

  /**
   * Get full error log
   */
  public getErrorLog(): ErrorLogEntry[] {
    return [...this.errorLog];
  }

  // Private helper methods
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private classifyErrorSeverity(error: Error): ErrorSeverity {
    const message = error.message.toLowerCase();
    
    if (message.includes('critical') || message.includes('fatal')) {
      return ErrorSeverity.CRITICAL;
    }
    
    if (message.includes('timeout') || message.includes('memory') || message.includes('failed to load')) {
      return ErrorSeverity.HIGH;
    }
    
    if (message.includes('warning') || message.includes('deprecated')) {
      return ErrorSeverity.LOW;
    }
    
    return ErrorSeverity.MEDIUM;
  }

  private classifyErrorCategory(operation: string): ErrorCategory {
    if (operation.includes('rule') || operation.includes('loading')) {
      return ErrorCategory.RULE_LOADING;
    }
    
    if (operation.includes('process') || operation.includes('lint')) {
      return ErrorCategory.PROCESSING;
    }
    
    if (operation.includes('memory') || operation.includes('cache')) {
      return ErrorCategory.MEMORY;
    }
    
    if (operation.includes('network') || operation.includes('fetch')) {
      return ErrorCategory.NETWORK;
    }
    
    if (operation.includes('config') || operation.includes('setting')) {
      return ErrorCategory.CONFIGURATION;
    }
    
    if (operation.includes('ui') || operation.includes('view')) {
      return ErrorCategory.UI;
    }
    
    return ErrorCategory.PROCESSING;
  }

  private markErrorResolved(errorKey: string): void {
    const error = this.errorLog.find(e => e.id === errorKey);
    if (error) {
      error.resolved = true;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}