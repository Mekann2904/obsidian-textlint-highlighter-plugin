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
import { EditorExtension } from './editor/EditorExtension';
import { TextlintView } from './views/TextlintView';
import { TextlintSettingTab } from './settings/TextlintSettingTab';

export class TextlintHighlightPlugin extends Plugin {
  private kernel: TextlintKernel;
  settings: TextlintPluginSettings;
  private ruleLoader: RuleLoader;
  private contentCache: Cache<string>;
  private resultCache: Cache<TextlintMessage[]>;
  private editorExtension: EditorExtension;
  
  // Performance tracking
  private debounceTimer: NodeJS.Timeout | null = null;
  private lastProcessedFile: string | null = null;
  private lastContentHash: string | null = null;
  private performanceStats = {
    cacheHits: 0,
    cacheMisses: 0,
    totalLintTime: 0,
    totalRequests: 0
  };

  async onload() {
    console.log('Textlint Highlighter Plugin: 最適化版を読み込み中...');
    
    // 設定の読み込み
    await this.loadSettings();
    
    // 依存関係の初期化
    await this.initializeDependencies();
    
    // UI コンポーネントの設定
    this.setupUI();
    
    // イベントリスナーの設定
    this.setupEventListeners();
    
    console.log('Textlint Highlighter Plugin: 読み込み完了');
  }

  onunload() {
    console.log('Textlint Highlighter Plugin: アンロード中');
    this.cleanup();
  }

  private async initializeDependencies() {
    // TextlintKernelの初期化
    this.kernel = new TextlintKernel();
    
    // RuleLoaderの初期化（シングルトン）
    this.ruleLoader = RuleLoader.getInstance();
    this.ruleLoader.setDebugMode(this.settings.enableDebugLog);
    
    // キャッシュの初期化
    this.contentCache = new Cache<string>(5 * 60 * 1000); // 5分
    this.resultCache = new Cache<TextlintMessage[]>(10 * 60 * 1000); // 10分
    
    // エディタ拡張の初期化
    this.editorExtension = new EditorExtension(this.app);
    this.editorExtension.setDebugMode(this.settings.enableDebugLog);
    
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

  private setupEventListeners() {
    // レイアウト準備完了時
    this.app.workspace.onLayoutReady(async () => {
      if (this.settings.enableDebugLog) {
        console.log('Workspace layout ready, running initial lint');
      }
      this.debouncedLintCurrentFile();
    });

    // アクティブなリーフ変更時（新しいメモを開いた時）
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => {
        if (this.settings.enableDebugLog) {
          console.log('Active leaf changed:', leaf?.view?.getViewType());
        }
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
          // 新しいファイルの場合は少し遅延して実行
          setTimeout(() => {
            this.debouncedLintCurrentFile();
          }, 250);
        }
      })
    );

    // ファイルを開いた時（確実な検知）
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (file && file instanceof TFile && file.extension === 'md') {
          if (this.settings.enableDebugLog) {
            console.log('File opened:', file.path);
          }
          // ファイルオープン時は確実に実行
          setTimeout(() => {
            this.lintCurrentFileImmediately();
          }, 300);
        }
      })
    );

    // エディタ変更時（メイン）
    this.registerEvent(
      this.app.workspace.on('editor-change', () => {
        if (this.app.workspace.getActiveViewOfType(MarkdownView)) {
          this.debouncedLintCurrentFile();
        }
      })
    );

    // ファイル修正時（即座実行）
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView && activeView.file === file) {
          this.debouncedLintCurrentFile();
        }
      })
    );

    // ファイル作成時
    this.registerEvent(
      this.app.vault.on('create', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          if (this.settings.enableDebugLog) {
            console.log('New markdown file created:', file.path);
          }
          setTimeout(() => {
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView && activeView.file === file) {
              this.lintCurrentFileImmediately();
            }
          }, 500);
        }
      })
    );

    // エディタペースト時
    this.registerEvent(
      this.app.workspace.on('editor-paste', () => {
        if (this.app.workspace.getActiveViewOfType(MarkdownView)) {
          this.debouncedLintCurrentFile();
        }
      })
    );

    // レイアウト変更時（タブ切り替えなど）
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        if (this.app.workspace.getActiveViewOfType(MarkdownView)) {
          setTimeout(() => {
            this.debouncedLintCurrentFile();
          }, 100);
        }
      })
    );

    // キーボードショートカット検知（Ctrl+S, Cmd+S）
    this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
      if ((evt.ctrlKey || evt.metaKey) && evt.key === 's') {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
          // 保存直後に実行するため少し遅延
          setTimeout(() => {
            this.lintCurrentFileImmediately();
          }, 100);
        }
      }
    });

    // フォーカス変更時（ウィンドウ切り替え時）
    this.registerDomEvent(window, 'focus', () => {
      if (this.app.workspace.getActiveViewOfType(MarkdownView)) {
        setTimeout(() => {
          this.debouncedLintCurrentFile();
        }, 200);
      }
    });

    // 定期的なチェック（バックアップとして5秒に短縮）
    this.registerInterval(window.setInterval(() => {
      if (this.app.workspace.getActiveViewOfType(MarkdownView)) {
        this.debouncedLintCurrentFile();
      }
    }, 5000));
  }

  private cleanup() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
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
    
    // 設定変更時にキャッシュクリア
    this.clearCache();
    
    // RuleLoaderにデバッグモードを設定
    if (this.ruleLoader) {
      this.ruleLoader.setDebugMode(this.settings.enableDebugLog);
    }
    
    if (this.editorExtension) {
      this.editorExtension.setDebugMode(this.settings.enableDebugLog);
    }
  }

  /**
   * デバウンス機能付きのlint実行
   */
  debouncedLintCurrentFile() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    this.debounceTimer = setTimeout(() => {
      this.lintCurrentFile();
    }, 200);
  }

  /**
   * 手動実行用（即座に実行）
   */
  lintCurrentFileImmediately() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.lintCurrentFile();
  }

  async lintCurrentFile() {
    const startTime = performance.now();
    this.performanceStats.totalRequests++;
    
    if (this.settings.enableDebugLog) {
      console.log('=== Textlint Debug: 最適化版lint開始 ===');
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
      const content = await this.app.vault.read(file);
      const contentHash = await generateContentHash(content);
      
      // 重複実行のチェック（高速化）
      if (this.lastProcessedFile === file.path && this.lastContentHash === contentHash) {
        if (this.settings.enableDebugLog) {
          console.log('コンテンツが変更されていないため、スキップ');
        }
        this.performanceStats.cacheHits++;
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
          this.applyResults(cachedResult, file);
          return;
        }
      }

      this.performanceStats.cacheMisses++;
      
      // キャッシュを更新
      this.lastProcessedFile = file.path;
      this.lastContentHash = contentHash;
      
      // ルールの読み込み（キャッシュ済み）
      const rules = await this.ruleLoader.loadRules(this.settings);
      
      if (this.settings.enableDebugLog) {
        console.log('ファイル処理:', file.path);
        console.log('ルール数:', rules.length);
        console.log('コンテンツハッシュ:', contentHash.substring(0, 8) + '...');
      }
      
      // textlintの設定を生成
      const lintConfig = this.ruleLoader.generateLintConfig(rules);
      
      if (this.settings.enableDebugLog) {
        console.log('Textlintを実行中...');
      }
      
      const result = await this.kernel.lintText(content, lintConfig);
      
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
    // 既存のハイライトをクリア
    this.editorExtension.clearHighlights();
    
    // 新しいハイライトを追加
    if (messages.length > 0) {
      this.editorExtension.addHighlights(messages);
    }

    // ビューを更新
    this.updateTextlintView(messages, file);
  }

  private updateTextlintView(messages: TextlintMessage[], file: TFile) {
    try {
      const views = this.app.workspace.getLeavesOfType(VIEW_TYPE_TEXTLINT);
      
      if (views.length === 0) {
        if (this.settings.enableDebugLog) {
          console.log('TextlintView not found, skipping update');
        }
        return;
      }

      const view = views[0].view as any;
      
      // より厳密な型チェック
      if (view && typeof view.updateMessages === 'function') {
        (view as TextlintView).updateMessages(messages, file);
      } else {
        if (this.settings.enableDebugLog) {
          console.warn('TextlintView updateMessages method not found:', {
            viewExists: !!view,
            viewType: typeof view,
            hasUpdateMessages: view && typeof view.updateMessages === 'function',
            viewConstructor: view?.constructor?.name
          });
        }
        
        // ビューを再作成を試みる
        this.recreateTextlintView(messages, file);
      }
    } catch (error) {
      console.error('Error updating TextlintView:', error);
      if (this.settings.enableDebugLog) {
        console.error('TextlintView update error details:', error);
      }
    }
  }

  private async recreateTextlintView(messages: TextlintMessage[], file: TFile) {
    try {
      // 既存のビューを閉じる
      const existingViews = this.app.workspace.getLeavesOfType(VIEW_TYPE_TEXTLINT);
      for (const leaf of existingViews) {
        leaf.detach();
      }

      // 新しいビューを作成
      const leaf = this.app.workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: VIEW_TYPE_TEXTLINT,
          active: false,
        });

        // 少し待ってからメッセージを更新
        setTimeout(() => {
          const view = leaf.view as any;
          if (view && typeof view.updateMessages === 'function') {
            (view as TextlintView).updateMessages(messages, file);
          }
        }, 100);
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
    this.ruleLoader.clearCache();
    
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
    return {
      content: this.contentCache.getStats(),
      results: this.resultCache.getStats(),
      rules: this.ruleLoader.getCacheStats().rules,
      config: this.ruleLoader.getCacheStats().config,
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