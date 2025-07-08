import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf, ItemView, editorLivePreviewField } from 'obsidian';
import { TextlintKernel } from '@textlint/kernel';
import { StateField, StateEffect, RangeSet, Range } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, hoverTooltip } from '@codemirror/view';

export const VIEW_TYPE_TEXTLINT = "textlint-view";

// シンプルな設定インターフェース
interface TextlintPluginSettings {
  useTechnicalWritingPreset: boolean;
  useSpacingPreset: boolean;
  useJtfStylePreset: boolean; // JTFスタイルガイドプリセット
  useCustomRules: boolean;
  enableDebugLog: boolean;
  useKuromoji: boolean; // Kuromojiを使用するかどうか
  // 個別ルール設定
  useNoDroppingI: boolean; // い抜き言葉
  useNoInsertDroppingSa: boolean; // さ入れ言葉
  useNoDoubledJoshi: boolean; // 助詞の重複
  useNoMixedZenkakuHankakuAlphabet: boolean; // 全角半角英字混在
  usePreferTariTari: boolean; // たりたり表現
}

const DEFAULT_SETTINGS: TextlintPluginSettings = {
  useTechnicalWritingPreset: true,
  useSpacingPreset: true,
  useJtfStylePreset: true,
  useCustomRules: true,
  enableDebugLog: true,
  useKuromoji: true,
  // 個別ルール設定（デフォルトは有効）
  useNoDroppingI: true,
  useNoInsertDroppingSa: true,
  useNoDoubledJoshi: true,
  useNoMixedZenkakuHankakuAlphabet: true,
  usePreferTariTari: true
};

interface TextlintMessage {
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  ruleId: string;
  severity: number;
  fix?: {
    range: readonly [number, number];
    text: string;
  };
}

interface TextlintKernelMessage {
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  ruleId?: string;
  severity: number;
  fix?: {
    range: readonly [number, number];
    text: string;
  };
}

class HighlightDecoration {
  create() {
    return null;
  }

  update(highlights: any, tr: any) {
    return highlights;
  }
}

class TextlintView extends ItemView {
  private messages: TextlintMessage[] = [];
  private currentFile: TFile | null = null;
  private highlightTimeout: NodeJS.Timeout | null = null;
  private plugin: TextlintHighlightPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: TextlintHighlightPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_TEXTLINT;
  }

  getDisplayText() {
    return "Textlint Issues";
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    
    // ヘッダー部分
    const headerEl = container.createEl("div", { cls: "textlint-header" });
    headerEl.createEl("h2", { text: "Textlint Issues" });
    
    // 実行ボタン
    const runBtn = headerEl.createEl("button", { 
      text: "現在のファイルをチェック",
      cls: "textlint-run-btn mod-cta"
    });
    runBtn.onclick = () => {
      this.plugin.lintCurrentFileImmediately();
      new Notice("Textlintを実行中...");
    };
    
    this.renderMessages(container as HTMLElement);
  }

  async onClose() {
    // クリーンアップ
  }

  updateMessages(messages: TextlintMessage[], file: TFile) {
    this.messages = messages;
    this.currentFile = file;
    
    // 既存のコンテンツをクリア
    const container = this.containerEl.children[1];
    container.empty();
    
    // ヘッダー部分
    const headerEl = container.createEl("div", { cls: "textlint-header" });
    headerEl.createEl("h2", { text: "Textlint Issues" });
    
    // 実行ボタン
    const runBtn = headerEl.createEl("button", { 
      text: "現在のファイルをチェック",
      cls: "textlint-run-btn mod-cta"
    });
    runBtn.onclick = () => {
      this.plugin.lintCurrentFileImmediately();
      new Notice("Textlintを実行中...");
    };
    
    this.renderMessages(container as HTMLElement);
  }

  private renderMessages(container: HTMLElement) {
    if (this.messages.length === 0) {
      container.createEl("p", { text: "問題は見つかりませんでした。" });
      return;
    }

    const issueContainer = container.createEl("div", { cls: "textlint-issues" });
    
    this.messages.forEach((message, index) => {
      const issueEl = issueContainer.createEl("div", { 
        cls: "textlint-issue textlint-issue-clickable",
        attr: { "data-line": message.line.toString() }
      });
      
      // カード全体をクリックしてジャンプ
      issueEl.onclick = () => this.jumpToLine(message.line, message.column, message.endLine, message.endColumn);
      issueEl.style.cursor = "pointer";
      
      const headerEl = issueEl.createEl("div", { cls: "textlint-issue-header" });
      
      headerEl.createEl("span", { 
        text: `行 ${message.line}:${message.column}`,
        cls: "textlint-issue-location"
      });
      
      headerEl.createEl("span", { 
        text: message.ruleId,
        cls: "textlint-issue-rule"
      });
      
      const messageEl = issueEl.createEl("div", { 
        text: message.message,
        cls: "textlint-issue-message"
      });
      

    });
  }



  private async jumpToLine(line: number, column: number, endLine?: number, endColumn?: number) {
    if (!this.currentFile) return;
    
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(this.currentFile);
    
    const view = leaf.view;
    if (view instanceof MarkdownView) {
      const editor = view.editor;
      
      // ジャンプ
      const pos = { line: line - 1, ch: column - 1 };
      editor.setCursor(pos);
      editor.scrollIntoView({ from: pos, to: pos }, true);
      
      // ハイライト
      if (endLine && endColumn) {
        const endPos = { line: endLine - 1, ch: endColumn - 1 };
        editor.setSelection(pos, endPos);
      }
    }
  }
}

class TextlintSettingTab extends PluginSettingTab {
  plugin: TextlintHighlightPlugin;

  constructor(app: App, plugin: TextlintHighlightPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Textlint 設定' });

    // 技術文書プリセット
    containerEl.createEl('h3', { 
      text: '技術文書プリセット', 
      attr: { style: 'color: var(--text-accent); border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 8px; margin-bottom: 16px;' }
    });

    new Setting(containerEl)
      .setName('技術文書向けプリセット')
      .setDesc('textlint-rule-preset-ja-technical-writing：文章の長さ、文体統一、冗長表現をチェック（推奨）')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.useTechnicalWritingPreset)
        .onChange(async (value) => {
          this.plugin.settings.useTechnicalWritingPreset = value;
          await this.plugin.saveSettings();
        }));

    // スペース・句読点プリセット
    containerEl.createEl('h3', { 
      text: 'スペース・句読点プリセット', 
      attr: { style: 'color: var(--text-accent); border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 8px; margin-bottom: 16px; margin-top: 24px;' }
    });

    new Setting(containerEl)
      .setName('スペース・句読点プリセット')
      .setDesc('textlint-rule-preset-ja-spacing：全角半角スペース、句読点の使い方をチェック（推奨）')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.useSpacingPreset)
        .onChange(async (value) => {
          this.plugin.settings.useSpacingPreset = value;
          await this.plugin.saveSettings();
        }));

    // AI文章プリセット
    containerEl.createEl('h3', { 
      text: 'AI文章プリセット', 
      attr: { style: 'color: var(--text-accent); border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 8px; margin-bottom: 16px; margin-top: 24px;' }
    });

    new Setting(containerEl)
      .setName('AI文章向けプリセット')
      .setDesc('@textlint-ja/textlint-rule-preset-ai-writing：AI生成文章の不自然な表現をチェック')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.useCustomRules)
        .onChange(async (value) => {
          this.plugin.settings.useCustomRules = value;
          await this.plugin.saveSettings();
        }));

    // JTFスタイルプリセット
    containerEl.createEl('h3', { 
      text: 'JTFスタイルプリセット', 
      attr: { style: 'color: var(--text-accent); border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 8px; margin-bottom: 16px; margin-top: 24px;' }
    });

    new Setting(containerEl)
      .setName('JTFスタイルガイドプリセット')
      .setDesc('textlint-rule-preset-jtf-style：翻訳品質向上のための専門的なスタイルチェック')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.useJtfStylePreset)
        .onChange(async (value) => {
          this.plugin.settings.useJtfStylePreset = value;
          await this.plugin.saveSettings();
        }));

    // 個別ルール
    containerEl.createEl('h3', { 
      text: '個別ルール', 
      attr: { style: 'color: var(--text-accent); border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 8px; margin-bottom: 16px; margin-top: 24px;' }
    });

    new Setting(containerEl)
      .setName('い抜き言葉の検出')
      .setDesc('@textlint-ja/textlint-rule-no-dropping-i：「見れる」→「見られる」')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.useNoDroppingI)
        .onChange(async (value) => {
          this.plugin.settings.useNoDroppingI = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('さ入れ言葉の検出')
      .setDesc('@textlint-ja/textlint-rule-no-insert-dropping-sa：「食べれない」→「食べられない」')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.useNoInsertDroppingSa)
        .onChange(async (value) => {
          this.plugin.settings.useNoInsertDroppingSa = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('助詞の重複検出')
      .setDesc('textlint-rule-no-doubled-joshi：「材料不足で代替素材で」')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.useNoDoubledJoshi)
        .onChange(async (value) => {
          this.plugin.settings.useNoDoubledJoshi = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('全角半角英字混在の検出')
      .setDesc('textlint-rule-no-mixed-zenkaku-and-hankaku-alphabet：アルファベットの表記統一')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.useNoMixedZenkakuHankakuAlphabet)
        .onChange(async (value) => {
          this.plugin.settings.useNoMixedZenkakuHankakuAlphabet = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('たりたり表現の推奨')
      .setDesc('textlint-rule-prefer-tari-tari：「歩いたり、走る」→「歩いたり、走ったり」')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.usePreferTariTari)
        .onChange(async (value) => {
          this.plugin.settings.usePreferTariTari = value;
          await this.plugin.saveSettings();
        }));

    // システム設定
    containerEl.createEl('h3', { 
      text: 'システム設定', 
      attr: { style: 'color: var(--text-accent); border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 8px; margin-bottom: 16px; margin-top: 24px;' }
    });

    new Setting(containerEl)
      .setName('Kuromoji使用')
      .setDesc('kuromoji：日本語形態素解析エンジン（処理が重くなる場合があります）')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.useKuromoji)
        .onChange(async (value) => {
          this.plugin.settings.useKuromoji = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('デバッグログ')
      .setDesc('enableDebugLog：開発者向けの詳細情報を出力')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableDebugLog)
        .onChange(async (value) => {
          this.plugin.settings.enableDebugLog = value;
          await this.plugin.saveSettings();
        }));

    // ヘルプ情報
    containerEl.createEl('div', { 
      text: '推奨設定：「技術文書向けプリセット」と「スペース・句読点プリセット」を有効にしてください。',
      attr: { 
        style: 'margin-top: 24px; padding: 12px; background: var(--background-secondary); border-radius: 8px; font-size: 0.9em; border-left: 3px solid var(--color-accent);' 
      }
    });
  }
}

export default class TextlintHighlightPlugin extends Plugin {
  private kernel: TextlintKernel;
  settings: TextlintPluginSettings;
  private debounceTimer: NodeJS.Timeout | null = null; // デバウンス用タイマー
  private lastProcessedFile: string | null = null; // 前回処理したファイルパス
  private lastContentHash: string | null = null; // 前回処理したコンテンツのハッシュ

  async onload() {
    console.log('plugin:obsidian-textlint-highlighter-plugin: Loading textlint highlighter plugin');
    
    await this.loadSettings();
    
    // Kuromojin辞書パスの設定（クリーンな方法）
    this.setupKuromojiDictPath();

    // TextlintKernelの初期化
    this.kernel = new TextlintKernel();

    this.registerEditorExtension(this.editorExtension);

    // 設定タブの追加
    this.addSettingTab(new TextlintSettingTab(this.app, this));
    
    // Viewの登録
    this.registerView(
      VIEW_TYPE_TEXTLINT,
      (leaf) => new TextlintView(leaf, this)
    );

    // レイアウト準備完了時の処理
    this.app.workspace.onLayoutReady(async () => {
      this.debouncedLintCurrentFile();
    });

    // アクティブなリーフ変更時のイベント
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        if (this.app.workspace.getActiveViewOfType(MarkdownView)) {
          this.debouncedLintCurrentFile();
        }
      })
    );

    // エディタ変更時のイベント
    this.registerEvent(
      this.app.workspace.on('editor-change', () => {
        if (this.app.workspace.getActiveViewOfType(MarkdownView)) {
          this.debouncedLintCurrentFile();
        }
      })
    );

    // 定期的なチェック（間隔を15秒に延長）
    this.registerInterval(window.setInterval(() => {
      if (this.app.workspace.getActiveViewOfType(MarkdownView)) {
        this.debouncedLintCurrentFile();
      }
    }, 15000));
  }

  onunload() {
    console.log('Textlint Highlighter Plugin unloaded');
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /**
   * コンテンツの簡単なハッシュを生成
   */
  private generateContentHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32-bit整数に変換
    }
    return hash.toString();
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
    }, 500); // 500ms のデバウンス
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

  /**
   * Kuromojin辞書パスの設定（公式な方法）
   */
  setupKuromojiDictPath() {
    if (this.settings.useKuromoji && typeof window !== 'undefined') {
      // kuromojinライブラリが使用するグローバル変数を設定
      if (!(window as any).kuromojin) {
        (window as any).kuromojin = {};
      }
      
      // CDN上の辞書パスを設定
      (window as any).kuromojin.dicPath = 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict';
      
      if (this.settings.enableDebugLog) {
        console.log('Kuromoji辞書パスを設定しました:', (window as any).kuromojin.dicPath);
      }
    }
  }

  private addHighlightEffect = StateEffect.define<TextlintMessage[]>();
  private clearHighlightEffect = StateEffect.define<null>();

  private highlightField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update: (decorations, tr) => {
      decorations = decorations.map(tr.changes);
      for (const effect of tr.effects) {
        if (effect.is(this.clearHighlightEffect)) {
          decorations = Decoration.none;
        }
        if (effect.is(this.addHighlightEffect)) {
          decorations = Decoration.none;
          const newDecorations = effect.value.map((message) => {
            try {
              const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
              if (!activeView) return null;
              const editor = activeView.editor;
              
              const from = editor.posToOffset({ line: message.line - 1, ch: message.column - 1 });
              let to = from + 5;

              if (message.endLine && message.endColumn) {
                to = editor.posToOffset({ line: message.endLine - 1, ch: message.endColumn - 1 });
              } else {
                const lineText = editor.getLine(message.line - 1);
                const startIndex = message.column - 1;
                let endIndex = startIndex;
                
                while (endIndex < lineText.length && endIndex < startIndex + 20) {
                  const char = lineText[endIndex];
                  if (char === ' ' || char === '\n' || char === '、' || char === '。' || char === '　') {
                    break;
                  }
                  endIndex++;
                }
                to = editor.posToOffset({ line: message.line - 1, ch: Math.max(endIndex, startIndex + 1) });
              }
              
              if (from >= to) {
                 // 範囲が不正な場合は無視
                if (this.settings.enableDebugLog) {
                  console.warn(`Invalid range for highlight: from=${from}, to=${to}`, message);
                }
                return null;
              }

              return Decoration.mark({
                class: `textlint-highlight textlint-severity-${message.severity}`,
                attributes: { 'data-textlint-message': `${message.ruleId}: ${message.message}` },
              }).range(from, to);

            } catch (e) {
              if(this.settings.enableDebugLog) {
                console.error("Failed to create decoration", e);
              }
              return null;
            }
          }).filter(d => d !== null) as Range<Decoration>[];
          
          decorations = Decoration.set(newDecorations, true);
        }
      }
      return decorations;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  private editorExtension = [
    this.highlightField,
    hoverTooltip((view, pos, side) => {
      // 現在の位置にハイライトがあるかチェック
      const decorations = view.state.field(this.highlightField);
      let foundTooltip: string | null = null;
      
      // 該当位置のDecorationを検索（最初の一致で停止）
      decorations.between(pos, pos, (from: number, to: number, decoration: Decoration) => {
        const message = decoration.spec.attributes?.['data-textlint-message'];
        if (message && !foundTooltip) {
          foundTooltip = message;
          return false; // 停止
        }
      });
      
      // ツールチップが見つかった場合のみ作成
      if (foundTooltip) {
        return {
          pos,
          above: true,
          create: () => {
            const dom = document.createElement("div");
            dom.className = "textlint-tooltip";
            dom.textContent = foundTooltip;
            return { dom };
          }
        };
      }
      
      return null;
    }),
    EditorView.baseTheme({
      ".textlint-highlight": {
        backgroundColor: "rgba(255, 255, 0, 0.3)",
        borderBottom: "2px solid #ff9500",
        borderRadius: "2px",
        cursor: "help",
      },
      ".textlint-severity-1": {
        backgroundColor: "rgba(255, 193, 7, 0.2)",
        borderBottomColor: "#ffc107",
      },
      ".textlint-severity-2": {
        backgroundColor: "rgba(220, 53, 69, 0.2)",
        borderBottomColor: "#dc3545",
      },
      ".textlint-tooltip": {
        background: "var(--background-primary)",
        border: "1px solid var(--background-modifier-border)",
        borderRadius: "4px",
        padding: "8px 12px",
        fontSize: "0.9em",
        color: "var(--text-normal)",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
        maxWidth: "300px",
        wordWrap: "break-word",
        zIndex: 10000,
      }
    }),
  ];

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
   * 既存のハイライトをクリアする
   */
  clearHighlights() {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) return;
    const cm = (activeView.editor as any).cm as EditorView;
    if (cm) {
      cm.dispatch({
        effects: this.clearHighlightEffect.of(null)
      });
    }
  }

    /**
   * エディタにハイライトを追加する（Obsidian API使用）
   */
  addHighlights(messages: TextlintMessage[]) {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) return;
    
    const cm = (activeView.editor as any).cm as EditorView;
    if (cm) {
      cm.dispatch({
        effects: this.addHighlightEffect.of(messages)
      });
    }
  }

  async lintCurrentFile() {
    if (this.settings.enableDebugLog) {
      console.log('=== Textlint Debug: lintCurrentFile started ===');
    }
    
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      if (this.settings.enableDebugLog) {
        console.log('No active MarkdownView found');
      }
      return;
    }

    const file = activeView.file;
    if (!file) {
      if (this.settings.enableDebugLog) {
        console.log('No file found in active view');
      }
      return;
    }

    try {
      const content = await this.app.vault.read(file);
      const contentHash = this.generateContentHash(content);
      
      if (this.settings.enableDebugLog) {
        console.log('File content preview:', content.substring(0, 100) + '...');
        console.log('Content length:', content.length);
      }
      
      // 重複実行のチェック
      if (this.lastProcessedFile === file.path && this.lastContentHash === contentHash) {
        if (this.settings.enableDebugLog) {
          console.log('Content unchanged, skipping lint');
        }
        return;
      }
      
      // キャッシュを更新
      this.lastProcessedFile = file.path;
      this.lastContentHash = contentHash;
      
      const rules = await this.loadRules();
      
      if (this.settings.enableDebugLog) {
        console.log('Processing file:', file.path);
        console.log('Loaded rules count:', rules.length);
        console.log('Rule names:', rules.map(r => r.ruleId));
      }
      
      // textlintの設定を更新
      const lintConfig = {
        ext: '.md',
        plugins: [
          {
            pluginId: '@textlint/textlint-plugin-markdown',
            plugin: require('@textlint/textlint-plugin-markdown').default || require('@textlint/textlint-plugin-markdown'),
            options: true
          }
        ],
        rules: rules,
        filterRules: []
      };

      if (this.settings.enableDebugLog) {
        console.log('Textlint config:', JSON.stringify(lintConfig, null, 2));
      }

      console.log('Running textlint on content...');
      const result = await this.kernel.lintText(content, lintConfig);
      
      if (this.settings.enableDebugLog) {
        console.log('Raw textlint result:', result);
        console.log('Messages count:', result.messages.length);
      }
      
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

      console.log(`Textlint found ${messages.length} issues`);
      if (this.settings.enableDebugLog && messages.length > 0) {
        console.log('Issues found:', messages);
      }

      // 既存のハイライトをクリア
      this.clearHighlights();
      
      // 新しいハイライトを追加
      if (messages.length > 0) {
        console.log('Adding highlights...');
        this.addHighlights(messages);
      } else {
        console.log('No issues found to highlight');
      }

      // ビューを更新
      const views = this.app.workspace.getLeavesOfType(VIEW_TYPE_TEXTLINT);
      if (views.length > 0) {
        const view = views[0].view as TextlintView;
        view.updateMessages(messages, file);
        console.log('Updated textlint view');
      } else {
        console.log('No textlint view found');
      }

      if (this.settings.enableDebugLog) {
        console.log('=== Textlint Debug: lintCurrentFile completed ===');
      }
    } catch (error) {
      console.error("Error linting with textlint:", error);
      console.error("Error stack:", error.stack);
      new Notice("Textlint エラーが発生しました: " + error.message);
    }
  }

  private async loadRules(): Promise<any[]> {
    if (this.settings.enableDebugLog) {
      console.log('=== loadRules: Starting rule loading ===');
    }
    
    const rules: any[] = [];

    // 技術文書向けプリセット
    if (this.settings.useTechnicalWritingPreset) {
      try {
        const preset = require("textlint-rule-preset-ja-technical-writing");
        if (preset && preset.rules) {
          Object.entries(preset.rules).forEach(([ruleId, rule]) => {
            let actualRule = rule;
            
            // ルールが関数でない場合の処理
            if (typeof rule !== 'function') {
              if (rule && typeof rule === 'object') {
                if ((rule as any).linter && typeof (rule as any).linter === 'function') {
                  actualRule = (rule as any).linter;
                } else if ((rule as any).default) {
                  actualRule = (rule as any).default;
                } else {
                  actualRule = rule;
                }
              }
            }
            
            const ruleOptions = preset.rulesConfig?.[ruleId] === false ? false : 
              (typeof preset.rulesConfig?.[ruleId] === 'object' ? preset.rulesConfig[ruleId] : true);
            
            if (ruleOptions !== false) {
              rules.push({
                ruleId: `technical-writing/${ruleId}`,
                rule: actualRule,
                options: ruleOptions
              });
            }
          });
        }
      } catch (error) {
        console.error("技術文書向けプリセットの読み込みに失敗:", error);
      }
    }

    // スペース・句読点プリセット
    if (this.settings.useSpacingPreset) {
      try {
        const preset = require("textlint-rule-preset-ja-spacing");
        if (preset && preset.rules) {
          Object.entries(preset.rules).forEach(([ruleId, rule]) => {
            let actualRule = rule;
            
            // ルールが関数でない場合の処理
            if (typeof rule !== 'function') {
              if (rule && typeof rule === 'object') {
                if ((rule as any).linter && typeof (rule as any).linter === 'function') {
                  actualRule = (rule as any).linter;
                } else if ((rule as any).default) {
                  actualRule = (rule as any).default;
                } else {
                  actualRule = rule;
                }
              }
            }
            
            // ルール設定をチェック（無効化されているルールをスキップ）
            const ruleOptions = preset.rulesConfig?.[ruleId] === false ? false : 
              (typeof preset.rulesConfig?.[ruleId] === 'object' ? preset.rulesConfig[ruleId] : true);
            
            if (ruleOptions !== false) {
              rules.push({
                ruleId: `spacing/${ruleId}`,
                rule: actualRule,
                options: ruleOptions
              });
              
              if (this.settings.enableDebugLog) {
                console.log(`Successfully loaded spacing rule: ${ruleId}`);
              }
            } else {
              if (this.settings.enableDebugLog) {
                console.log(`Spacing rule ${ruleId} is disabled, skipping`);
              }
            }
          });
        }
      } catch (error) {
        console.error("スペース・句読点プリセットの読み込みに失敗:", error);
      }
    }

    // AI文章向けプリセット
    if (this.settings.useCustomRules) {
      try {
        const aiPreset = require("@textlint-ja/textlint-rule-preset-ai-writing");
        
        // プリセットの構造を確認
        if (this.settings.enableDebugLog) {
          console.log('AI writing preset structure:', Object.keys(aiPreset));
          console.log('AI writing preset default keys:', Object.keys(aiPreset.default || {}));
        }
        
        // プリセットの正しい構造にアクセス
        const preset = aiPreset.default || aiPreset;
        const presetRules = preset.rules || {};
        const presetRulesConfig = preset.rulesConfig || {};
        
        if (this.settings.enableDebugLog) {
          console.log('Rules config:', presetRulesConfig);
          console.log('Preset rules keys:', Object.keys(presetRules));
        }
        
        // ルールを読み込む
        if (presetRules && typeof presetRules === 'object') {
          Object.entries(presetRules).forEach(([ruleId, rule]) => {
            try {
              // ルール設定をチェック
              const ruleOptions = presetRulesConfig[ruleId];
              if (ruleOptions === false) {
                if (this.settings.enableDebugLog) {
                  console.log(`Rule ${ruleId} is disabled, skipping`);
                }
                return;
              }
              
              // ルール関数を取得
              let actualRule = rule;
              if (typeof rule !== 'function') {
                if (rule && typeof rule === 'object') {
                  if ((rule as any).default && typeof (rule as any).default === 'function') {
                    actualRule = (rule as any).default;
                  } else if ((rule as any).linter && typeof (rule as any).linter === 'function') {
                    actualRule = (rule as any).linter;
                  } else {
                    if (this.settings.enableDebugLog) {
                      console.warn(`Rule ${ruleId} is not a valid function:`, typeof rule, rule);
                    }
                    return;
                  }
                } else {
                  if (this.settings.enableDebugLog) {
                    console.warn(`Rule ${ruleId} is not valid:`, typeof rule);
                  }
                  return;
                }
              }
              
              // 最終チェック: actualRuleが関数かどうか
              if (typeof actualRule === 'function') {
                rules.push({
                  ruleId: `ai-writing/${ruleId}`,
                  rule: actualRule,
                  options: ruleOptions
                });
                
                if (this.settings.enableDebugLog) {
                  console.log(`Successfully loaded AI writing rule: ${ruleId}`);
                }
              } else {
                if (this.settings.enableDebugLog) {
                  console.warn(`Final validation failed for rule ${ruleId}:`, typeof actualRule);
                }
              }
              
            } catch (error) {
              if (this.settings.enableDebugLog) {
                console.warn(`Failed to process rule ${ruleId}:`, error.message);
              }
            }
          });
        }
        
      } catch (error) {
        console.error("AI文章向けプリセットの読み込みに失敗:", error);
        if (this.settings.enableDebugLog) {
          console.error("詳細エラー:", error);
        }
      }
    }

    // JTFスタイルガイドプリセット
    if (this.settings.useJtfStylePreset) {
      try {
        const jtfPreset = require("textlint-rule-preset-jtf-style");
        
        if (this.settings.enableDebugLog) {
          console.log('JTF style preset structure:', Object.keys(jtfPreset));
          console.log('JTF style preset default keys:', Object.keys(jtfPreset.default || {}));
        }
        
        // プリセットの正しい構造にアクセス
        const preset = jtfPreset.default || jtfPreset;
        const presetRules = preset.rules || {};
        const presetRulesConfig = preset.rulesConfig || {};
        
        if (this.settings.enableDebugLog) {
          console.log('JTF Rules config:', presetRulesConfig);
          console.log('JTF Preset rules keys:', Object.keys(presetRules));
        }
        
        // ルールを読み込む
        if (presetRules && typeof presetRules === 'object') {
          Object.entries(presetRules).forEach(([ruleId, rule]) => {
            try {
              // ルール設定をチェック
              const ruleOptions = presetRulesConfig[ruleId];
              if (ruleOptions === false) {
                if (this.settings.enableDebugLog) {
                  console.log(`JTF Rule ${ruleId} is disabled, skipping`);
                }
                return;
              }
              
              // ルール関数を取得
              let actualRule = rule;
              if (typeof rule !== 'function') {
                if (rule && typeof rule === 'object') {
                  if ((rule as any).default && typeof (rule as any).default === 'function') {
                    actualRule = (rule as any).default;
                  } else if ((rule as any).linter && typeof (rule as any).linter === 'function') {
                    actualRule = (rule as any).linter;
                  } else {
                    if (this.settings.enableDebugLog) {
                      console.warn(`JTF Rule ${ruleId} is not a valid function:`, typeof rule, rule);
                    }
                    return;
                  }
                } else {
                  if (this.settings.enableDebugLog) {
                    console.warn(`JTF Rule ${ruleId} is not valid:`, typeof rule);
                  }
                  return;
                }
              }
              
              // 最終チェック: actualRuleが関数かどうか
              if (typeof actualRule === 'function') {
                rules.push({
                  ruleId: `jtf-style/${ruleId}`,
                  rule: actualRule,
                  options: ruleOptions || true
                });
                
                if (this.settings.enableDebugLog) {
                  console.log(`Successfully loaded JTF style rule: ${ruleId}`);
                }
              } else {
                if (this.settings.enableDebugLog) {
                  console.warn(`Final validation failed for JTF rule ${ruleId}:`, typeof actualRule);
                }
              }
              
            } catch (error) {
              if (this.settings.enableDebugLog) {
                console.warn(`Failed to process JTF rule ${ruleId}:`, error.message);
              }
            }
          });
        }
        
      } catch (error) {
        console.error("JTFスタイルガイドプリセットの読み込みに失敗:", error);
        if (this.settings.enableDebugLog) {
          console.error("詳細エラー:", error);
        }
      }
    }

    // 個別ルール設定
    const individualRules = [
      { 
        name: '@textlint-ja/textlint-rule-no-dropping-i',
        setting: this.settings.useNoDroppingI,
        description: 'い抜き言葉'
      },
      { 
        name: '@textlint-ja/textlint-rule-no-insert-dropping-sa',
        setting: this.settings.useNoInsertDroppingSa,
        description: 'さ入れ言葉'
      },
      { 
        name: 'no-doubled-joshi',
        setting: this.settings.useNoDoubledJoshi,
        description: '助詞の重複'
      },
      { 
        name: 'no-mixed-zenkaku-and-hankaku-alphabet',
        setting: this.settings.useNoMixedZenkakuHankakuAlphabet,
        description: '全角半角英字混在'
      },
      { 
        name: 'prefer-tari-tari',
        setting: this.settings.usePreferTariTari,
        description: 'たりたり表現'
      }
    ];

    for (const ruleInfo of individualRules) {
      if (!ruleInfo.setting) {
        if (this.settings.enableDebugLog) {
          console.log(`Skipping ${ruleInfo.description} rule (${ruleInfo.name}) - disabled in settings`);
        }
        continue;
      }

      try {
        let ruleModule: any;
        if (ruleInfo.name.startsWith('textlint-rule-')) {
          ruleModule = require(ruleInfo.name);
        } else if (ruleInfo.name.startsWith('@textlint-ja/')) {
          ruleModule = require(ruleInfo.name);
        } else {
          ruleModule = require(`textlint-rule-${ruleInfo.name}`);
        }

        if (ruleModule) {
          // 個別ルール形式の場合
          let actualRule = ruleModule;
          
          // ルールが関数でない場合の処理
          if (typeof ruleModule !== 'function') {
            if (ruleModule && typeof ruleModule === 'object') {
              if (ruleModule.default && typeof ruleModule.default === 'function') {
                actualRule = ruleModule.default;
              } else if (ruleModule.linter && typeof ruleModule.linter === 'function') {
                actualRule = ruleModule.linter;
              } else {
                if (this.settings.enableDebugLog) {
                  console.warn(`Rule ${ruleInfo.name} is not a valid function:`, typeof ruleModule, ruleModule);
                }
                continue;
              }
            } else {
              if (this.settings.enableDebugLog) {
                console.warn(`Rule ${ruleInfo.name} is not valid:`, typeof ruleModule);
              }
              continue;
            }
          }
          
          // 最終チェック: actualRuleが関数かどうか
          if (typeof actualRule === 'function') {
            rules.push({
              ruleId: `additional/${ruleInfo.name}`,
              rule: actualRule,
              options: true
            });
            
            if (this.settings.enableDebugLog) {
              console.log(`Successfully loaded ${ruleInfo.description} rule: ${ruleInfo.name}`);
            }
          } else {
            if (this.settings.enableDebugLog) {
              console.warn(`Final validation failed for rule ${ruleInfo.name}:`, typeof actualRule);
            }
          }
        }
      } catch (error) {
        if (this.settings.enableDebugLog) {
          console.warn(`Failed to load ${ruleInfo.description} rule ${ruleInfo.name}:`, error.message);
        }
      }
    }

    // ルール検証
    const validRules = rules.filter(r => {
      const isValid = r.rule && (
        typeof r.rule === 'function' || 
        (typeof r.rule === 'object' && r.rule !== null && (
          r.rule.default || 
          r.rule.linter || 
          r.rule.fixer ||
          typeof r.rule === 'object'
        ))
      );
      
      if (this.settings.enableDebugLog) {
        console.log(`Rule ${r.ruleId}: valid=${isValid}, type=${typeof r.rule}`);
      }
      
      return isValid;
    });
    
    if (this.settings.enableDebugLog) {
      console.log(`有効なルール数: ${validRules.length}`);
      console.log(`有効なルール:`, validRules.map(r => r.ruleId));
    }
    
    return validRules;
  }
}
