import { App, MarkdownView, Notice, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { TextlintKernel } from '@textlint/kernel';
import { 
  TextlintPluginSettings, 
  DEFAULT_SETTINGS, 
  TextlintMessage, 
  TextlintKernelMessage, 
  VIEW_TYPE_TEXTLINT 
} from './types';
import { RuleLoader } from './rules/RuleLoader';
import { Cache, generateContentHash } from './utils/Cache';
import { AdaptiveProcessor } from './utils/AdaptiveProcessor';
import { EditorExtension } from './editor/EditorExtension';
import { TextlintView } from './views/TextlintView';
import { TextlintSettingTab } from './settings/TextlintSettingTab';
import { MemoryManager } from './utils/MemoryManager';

export class TextlintHighlightPlugin extends Plugin {
  private kernel: TextlintKernel;
  settings: TextlintPluginSettings;
  private ruleLoader: RuleLoader | null = null;
  private contentCache: Cache<string>;
  private resultCache: Cache<TextlintMessage[]>;
  private editorExtension: EditorExtension;
  private memoryManager: MemoryManager;
  
  // Performance tracking - 最適化されたデバウンス処理
  private optimizedDebouncer: (() => void) | null = null;
  private throttledLinter: (() => void) | null = null;
  private lastProcessedFile: string | null = null;
  private lastContentHash: string | null = null;
  private performanceStats = {
    cacheHits: 0,
    cacheMisses: 0,
    totalLintTime: 0,
    totalRequests: 0
  };

  async onload() {
    console.log('Textlint Highlighter Plugin: 高速読み込み開始...');
    
    // メモリマネージャーの初期化
    this.memoryManager = MemoryManager.getInstance();
    
    // 設定の読み込み（軽量）
    await this.loadSettings();
    
    // 軽量な依存関係の初期化のみ
    this.initializeBasicDependencies();
    
    // UI コンポーネントの設定
    this.setupUI();
    
    // 最適化されたイベントリスナーの設定
    this.setupOptimizedEventListeners();
    
    console.log('Textlint Highlighter Plugin: 高速読み込み完了');
  }

  onunload() {
    console.log('Textlint Highlighter Plugin: アンロード中');
    this.cleanup();
  }

  private initializeBasicDependencies() {
    // 軽量な初期化のみ（同期処理）
    // キャッシュの初期化
    this.contentCache = new Cache<string>(5 * 60 * 1000); // 5分
    this.resultCache = new Cache<TextlintMessage[]>(10 * 60 * 1000); // 10分
    
    // エディタ拡張の初期化
    this.editorExtension = new EditorExtension(this.app);
    this.editorExtension.setDebugMode(this.settings.enableDebugLog);

    // 最適化されたデバウンサーとスロットラーの作成
    this.optimizedDebouncer = this.memoryManager.createOptimizedDebouncer(
      () => this.lintCurrentFileImmediately(),
      500 // 統一された遅延時間
    );

    this.throttledLinter = this.memoryManager.createThrottler(
      () => this.lintCurrentFileImmediately(),
      200 // スロットリング間隔
    );
  }

  private async initializeHeavyDependencies() {
    // 重い処理は実際に必要になってから初期化
    if (!this.kernel) {
      this.kernel = new TextlintKernel();
    }
    
    if (!this.ruleLoader) {
      this.ruleLoader = RuleLoader.getInstance();
      if (this.ruleLoader) {
        this.ruleLoader.setDebugMode(this.settings.enableDebugLog);
      }
    }
    
    // Kuromoji辞書パスの設定
    this.setupKuromojiDictPath();
  }

  private setupUI() {
    // エディタ拡張の登録
    this.registerEditorExtension(this.editorExtension.getExtensions());
    
    // 設定タブの追加
    this.addSettingTab(new TextlintSettingTab(this.app, this));
    
    // ビューの登録
    this.registerView(
      VIEW_TYPE_TEXTLINT,
      (leaf) => new TextlintView(leaf, this)
    );
  }

  private setupOptimizedEventListeners() {
    // レイアウト準備完了時（アイドル時実行に変更）
    this.app.workspace.onLayoutReady(async () => {
      if (this.settings.enableDebugLog) {
        console.log('Workspace layout ready, scheduling initial lint');
      }
      
      // アイドル時間に初期lintを実行
      this.memoryManager.runWhenIdle(() => {
        this.optimizedDebouncer?.();
      }, 2000);
    });

    // アクティブなリーフ変更時（統一されたデバウンサー使用）
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => {
        if (this.settings.enableDebugLog) {
          console.log('Active leaf changed:', leaf?.view?.getViewType());
        }
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
          this.optimizedDebouncer?.();
        }
      })
    );

    // ファイルを開いた時（即座実行）
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (file && file instanceof TFile && file.extension === 'md') {
          if (this.settings.enableDebugLog) {
            console.log('File opened:', file.path);
          }
          
          // ファイルオープン時は即座に実行（スロットリング使用）
          this.throttledLinter?.();
        }
      })
    );

    // エディタ変更時（メイン - 最適化されたデバウンサー使用）
    this.registerEvent(
      this.app.workspace.on('editor-change', () => {
        if (this.app.workspace.getActiveViewOfType(MarkdownView)) {
          this.optimizedDebouncer?.();
        }
      })
    );

    // ファイル修正時（デバウンス処理）
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView && activeView.file === file) {
          this.optimizedDebouncer?.();
        }
      })
    );

    // ファイル作成時（アイドル時実行）
    this.registerEvent(
      this.app.vault.on('create', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          if (this.settings.enableDebugLog) {
            console.log('New markdown file created:', file.path);
          }
          
          this.memoryManager.runWhenIdle(() => {
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView && activeView.file === file) {
              this.lintCurrentFileImmediately();
            }
          });
        }
      })
    );

    // エディタペースト時（デバウンス処理）
    this.registerEvent(
      this.app.workspace.on('editor-paste', () => {
        if (this.app.workspace.getActiveViewOfType(MarkdownView)) {
          this.optimizedDebouncer?.();
        }
      })
    );

    // レイアウト変更時（軽量化 - アイドル時実行）
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        if (this.app.workspace.getActiveViewOfType(MarkdownView)) {
          this.memoryManager.runWhenIdle(() => {
            this.optimizedDebouncer?.();
          });
        }
      })
    );

    // キーボードショートカット検知（保存時は即座実行）
    this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
      if ((evt.ctrlKey || evt.metaKey) && evt.key === 's') {
        // 保存時は即座にlintを実行
        this.throttledLinter?.();
      }
    });
  }

  private cleanup() {
    // メモリマネージャーのクリーンアップ
    this.memoryManager.cleanup();
    
    // キャッシュクリア
    this.contentCache.clear();
    this.resultCache.clear();
    
    if (this.settings.enableDebugLog) {
      console.log('パフォーマンス統計:', this.performanceStats);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    
    // 設定変更時はキャッシュをクリア
    this.contentCache.clear();
    this.resultCache.clear();
    
    // RuleLoaderのキャッシュをクリアして、ルールの再読み込みを強制する
    if (this.ruleLoader) {
      this.ruleLoader.clearCache();
    }
    
    // 設定変更を即時反映
    this.lintCurrentFileImmediately();
  }

  // デバウンス処理を削除（MemoryManagerの最適化されたデバウンサーを使用）
  debouncedLintCurrentFile() {
    // 統一されたデバウンサーに委譲
    this.optimizedDebouncer?.();
  }

  lintCurrentFileImmediately() {
    // アイドル時間に実行するように変更
    this.memoryManager.runWhenIdle(() => {
      this.lintCurrentFile();
    });
  }

  async lintCurrentFile() {
    const startTime = performance.now();
    this.performanceStats.totalRequests++;
    
    if (this.settings.enableDebugLog) {
      console.log('=== Textlint Debug: 高速lint開始 ===');
    }
    
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      if (this.settings.enableDebugLog) {
        console.log('アクティブなMarkdownViewが見つかりません');
      }
      return;
    }

    const file = activeView.file;
    if (!file) {
      if (this.settings.enableDebugLog) {
        console.log('ファイルが見つかりません');
      }
      return;
    }

    try {
      // 重い依存関係を必要に応じて初期化
      await this.initializeHeavyDependencies();
      const content = await this.app.vault.read(file);
      const contentHash = await generateContentHash(content);
      
      // 適応的処理戦略を取得
      const strategy = AdaptiveProcessor.getOptimalStrategy(content);
      const optimizedSettings = AdaptiveProcessor.getOptimizedRuleSet(content, this.settings);
      
      if (this.settings.enableDebugLog) {
        console.log('適応的処理戦略:', strategy);
        console.log('最適化された設定:', optimizedSettings);
      }
      
      // 重複実行のチェック（高速化）
      if (this.lastProcessedFile === file.path && this.lastContentHash === contentHash) {
        if (this.settings.enableDebugLog) {
          console.log('コンテンツが変更されていないため、キャッシュから結果を取得');
        }
        
        // キャッシュから結果を取得してハイライトを適用
        const cacheKey = `${file.path}_${contentHash}`;
        const cachedResult = this.resultCache.get(cacheKey);
        if (cachedResult) {
          this.performanceStats.cacheHits++;
          this.applyResults(cachedResult, file);
          if (this.settings.enableDebugLog) {
            console.log('重複実行チェックでキャッシュから結果を適用:', cachedResult.length, '個の問題');
          }
        } else {
          // キャッシュが無い場合は空の結果を適用
          this.applyResults([], file);
        }
        return;
      }

      // 結果キャッシュをチェック
      const cacheKey = `${file.path}_${contentHash}`;
      if (this.resultCache.isValidByHash(cacheKey, contentHash)) {
        const cachedResult = this.resultCache.get(cacheKey);
        if (cachedResult) {
          if (this.settings.enableDebugLog) {
            console.log('キャッシュから結果を取得:', cachedResult.length, '個の問題');
          }
          this.performanceStats.cacheHits++;
          
          // キャッシュを更新（重複実行チェックのため）
          this.lastProcessedFile = file.path;
          this.lastContentHash = contentHash;
          
          this.applyResults(cachedResult, file);
          return;
        }
      }

      this.performanceStats.cacheMisses++;
      
      // キャッシュを更新
      this.lastProcessedFile = file.path;
      this.lastContentHash = contentHash;
      
      // 最適化されたルールの読み込み
      if (!this.ruleLoader) {
        throw new Error('RuleLoaderが初期化されていません');
      }
      
      const rules = await this.ruleLoader.loadRules(optimizedSettings);
      
      if (this.settings.enableDebugLog) {
        console.log('ファイル処理:', file.path);
        console.log('ルール数:', rules.length);
        console.log('コンテンツハッシュ:', contentHash.substring(0, 8) + '...');
        console.log('処理戦略:', strategy.maxFileSize < 1000 ? 'フル処理' : '軽量処理');
      }
      
      // textlintの設定を生成
      const lintConfig = this.ruleLoader.generateLintConfig(rules);
      
      if (this.settings.enableDebugLog) {
        console.log('Textlintを実行中（タイムアウト:', strategy.processingTimeout, 'ms）...');
      }
      
      // Kuromoji最適化付きでtextlintを実行
      const result = await AdaptiveProcessor.processWithKuromojiOptimization(
        content,
        (textContent) => this.kernel.lintText(textContent, lintConfig),
        strategy
      );
      
      const messages: TextlintMessage[] = result.messages.map((msg: TextlintKernelMessage) => ({
        line: msg.line,
        column: msg.column,
        endLine: msg.endLine,
        endColumn: msg.endColumn,
        message: msg.message,
        ruleId: msg.ruleId || 'unknown',
        severity: msg.severity,
        fix: msg.fix
      }));

      // 結果をキャッシュに保存
      this.resultCache.set(cacheKey, messages, contentHash);
      
      if (this.settings.enableDebugLog) {
        console.log(`Textlintで${messages.length}個の問題を発見`);
      }

      this.applyResults(messages, file);

    } catch (error) {
      console.error("Textlintエラー:", error);
      new Notice("Textlint エラーが発生しました: " + error.message);
    } finally {
      const endTime = performance.now();
      this.performanceStats.totalLintTime += endTime - startTime;
      
      if (this.settings.enableDebugLog) {
        console.log(`処理時間: ${(endTime - startTime).toFixed(2)}ms`);
        console.log('=== Textlint Debug: lint完了 ===');
      }
    }
  }

  private applyResults(messages: TextlintMessage[], file: TFile) {
    // 1つのトランザクションでハイライトを更新
    this.editorExtension.updateHighlights(messages);

    // ビューを更新
    this.updateTextlintView(messages, file);
  }

  private updateTextlintView(messages: TextlintMessage[], file: TFile) {
    try {
      const views = this.app.workspace.getLeavesOfType(VIEW_TYPE_TEXTLINT);
      
      if (views.length === 0) {
        if (this.settings.enableDebugLog) {
          console.log('TextlintView not found, creating new view');
        }
        // ビューが存在しない場合は作成
        this.recreateTextlintView(messages, file);
        return;
      }

      const leaf = views[0];
      const view = leaf.view;
      
      // より柔軟な型チェック
      if (view && view.getViewType() === VIEW_TYPE_TEXTLINT && 'updateMessages' in view) {
        try {
          (view as any).updateMessages(messages, file);
          if (this.settings.enableDebugLog) {
            console.log(`TextlintView updated with ${messages.length} messages`);
          }
        } catch (updateError) {
          console.error('Error calling updateMessages:', updateError);
          this.recreateTextlintView(messages, file);
        }
      } else {
        if (this.settings.enableDebugLog) {
          console.warn('TextlintView is not properly initialized, recreating...');
        }
        this.recreateTextlintView(messages, file);
      }
    } catch (error) {
      console.error('Error in updateTextlintView:', error);
      // エラーが発生した場合でも処理を続行
      try {
        this.recreateTextlintView(messages, file);
      } catch (recreateError) {
        console.error('Failed to recreate view:', recreateError);
      }
    }
  }

  private async recreateTextlintView(messages: TextlintMessage[], file: TFile) {
    try {
      if (this.settings.enableDebugLog) {
        console.log('Recreating TextlintView...');
      }

      // 既存のビューを閉じる
      const existingViews = this.app.workspace.getLeavesOfType(VIEW_TYPE_TEXTLINT);
      for (const leaf of existingViews) {
        leaf.detach();
      }

      // 右サイドバーにビューを作成
      const leaf = this.app.workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: VIEW_TYPE_TEXTLINT,
          active: false,
        });

        // ビューの初期化を待つ
        const maxRetries = 10;
        let retries = 0;
        
        const attemptUpdate = () => {
          const view = leaf.view;
          if (view && view.getViewType() === VIEW_TYPE_TEXTLINT && 'updateMessages' in view) {
            try {
              (view as any).updateMessages(messages, file);
              if (this.settings.enableDebugLog) {
                console.log('TextlintView successfully recreated and updated');
              }
              return true;
            } catch (error) {
              console.error('Error updating recreated view:', error);
              return false;
            }
          }
          return false;
        };

        // 即座に試行
        if (attemptUpdate()) {
          return;
        }

        // リトライ機構
        const retryInterval = setInterval(() => {
          retries++;
          if (attemptUpdate() || retries >= maxRetries) {
            clearInterval(retryInterval);
            if (retries >= maxRetries && this.settings.enableDebugLog) {
              console.warn('Failed to update TextlintView after recreation');
            }
          }
        }, 50); // 50ms間隔でリトライ
      }
    } catch (error) {
      console.error('Failed to recreate TextlintView:', error);
    }
  }

  /**
   * Kuromoji辞書パスの設定
   */
  private setupKuromojiDictPath() {
    if (this.settings.useKuromoji && typeof window !== 'undefined') {
      if (!(window as any).kuromojin) {
        (window as any).kuromojin = {};
      }
      
      (window as any).kuromojin.dicPath = 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict';
      
      if (this.settings.enableDebugLog) {
        console.log('Kuromoji辞書パスを設定:', (window as any).kuromojin.dicPath);
      }
    }
  }

  /**
   * ビューの表示
   */
  async activateView() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_TEXTLINT);

    const rightLeaf = this.app.workspace.getRightLeaf(false);
    if (rightLeaf) {
      await rightLeaf.setViewState({
        type: VIEW_TYPE_TEXTLINT,
        active: true,
      });

      this.app.workspace.revealLeaf(
        this.app.workspace.getLeavesOfType(VIEW_TYPE_TEXTLINT)[0]
      );
    }
  }

  /**
   * キャッシュクリア
   */
  clearCache() {
    this.contentCache.clear();
    this.resultCache.clear();
    if (this.ruleLoader) {
      this.ruleLoader.clearCache();
    }
    
    this.lastProcessedFile = null;
    this.lastContentHash = null;
    
    if (this.settings.enableDebugLog) {
      console.log('すべてのキャッシュをクリアしました');
    }
  }

  /**
   * キャッシュ統計を取得
   */
  getCacheStats() {
    const ruleStats = this.ruleLoader ? this.ruleLoader.getCacheStats() : { rules: {}, config: {} };
    return {
      content: this.contentCache.getStats(),
      results: this.resultCache.getStats(),
      rules: ruleStats.rules,
      config: ruleStats.config,
      performance: this.performanceStats
    };
  }

  /**
   * パフォーマンス統計をリセット
   */
  resetPerformanceStats() {
    this.performanceStats = {
      cacheHits: 0,
      cacheMisses: 0,
      totalLintTime: 0,
      totalRequests: 0
    };
  }
} 