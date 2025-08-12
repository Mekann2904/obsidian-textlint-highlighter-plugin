import { ItemView, WorkspaceLeaf, TFile, MarkdownView, Notice } from 'obsidian';
import { TextlintMessage, VIEW_TYPE_TEXTLINT } from '../types';
import { ErrorHandler, ErrorSeverity, ErrorCategory } from '../utils/ErrorHandler';

export class TextlintView extends ItemView {
  private messages: TextlintMessage[] = [];
  private currentFile: TFile | null = null;
  private highlightTimeout: NodeJS.Timeout | null = null;
  private plugin: any;
  private errorHandler: ErrorHandler;

  constructor(leaf: WorkspaceLeaf, plugin: any) {
    super(leaf);
    this.plugin = plugin;
    this.errorHandler = ErrorHandler.getInstance();
  }

  getViewType() {
    return VIEW_TYPE_TEXTLINT;
  }

  getDisplayText() {
    return "Textlint Issues";
  }

  async onOpen() {
    this.renderView();
  }

  async onClose() {
    if (this.highlightTimeout) {
      clearTimeout(this.highlightTimeout);
    }
  }

  updateMessages(messages: TextlintMessage[], file: TFile) {
    this.messages = messages;
    this.currentFile = file;
    this.renderView();
  }

  private renderView() {
    const container = this.containerEl.children[1];
    container.empty();
    
    this.createHeader(container as HTMLElement);
    this.renderMessages(container as HTMLElement);
  }

  private createHeader(container: HTMLElement) {
    const headerEl = container.createEl("div", { cls: "textlint-header" });
    headerEl.createEl("h2", { text: "Textlint Issues" });
    
    // ボタンコンテナ
    const buttonContainer = headerEl.createEl("div", { cls: "textlint-buttons" });
    
    // 実行ボタン（アイコン）
    const runBtn = buttonContainer.createEl("button", { 
      cls: "textlint-icon-btn textlint-run-btn",
      attr: { "aria-label": "現在のファイルをチェック" }
    });
    runBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5,3 19,12 5,21 5,3"></polygon></svg>`;
    runBtn.onclick = () => {
      // 手動実行は強制実行（自動OFFやmanualモードでも走る）
      this.plugin.lintCurrentFileImmediately({ force: true, file: this.currentFile || undefined });
      new Notice("Textlintを実行中...");
    };

    // コピーボタン（アイコン）
    const copyBtn = buttonContainer.createEl("button", { 
      cls: "textlint-icon-btn textlint-copy-btn",
      attr: { "aria-label": "結果をコピー" }
    });
    copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>`;
    copyBtn.onclick = () => {
      this.copyResults();
    };
  }

  private renderMessages(container: HTMLElement) {
    if (this.messages.length === 0) {
      this.renderEmptyState(container);
      return;
    }

    const issueContainer = container.createEl("div", { cls: "textlint-issues" });
    
    // 直接カード表示
    this.messages.forEach((message, index) => {
      this.renderSingleCard(issueContainer, message, index);
    });
  }

  private renderEmptyState(container: HTMLElement) {
    const emptyEl = container.createEl("div", { cls: "textlint-empty-state" });
    
    emptyEl.createEl("h3", { text: "問題は見つかりませんでした" });
    emptyEl.createEl("p", { 
      text: "このファイルはTextlintのチェックを通過しています。" 
    });
  }

  private groupMessagesBySeverity(messages: TextlintMessage[]): Record<string, TextlintMessage[]> {
    const groups: Record<string, TextlintMessage[]> = {
      '2': [], // エラー
      '1': [], // 警告
      '0': []  // 情報
    };

    messages.forEach(message => {
      const severity = message.severity.toString();
      if (!groups[severity]) {
        groups[severity] = [];
      }
      groups[severity].push(message);
    });

    return groups;
  }

  private renderSeverityGroup(container: HTMLElement, severity: string, messages: TextlintMessage[]) {
    const severityNames = {
      '2': 'エラー',
      '1': '警告',
      '0': '情報'
    };

    const groupEl = container.createEl("div", { cls: `textlint-severity-group severity-${severity}` });
    
    const headerEl = groupEl.createEl("div", { cls: "textlint-group-header" });
    headerEl.createEl("h3", { 
      text: `${severityNames[severity as keyof typeof severityNames] || '不明'} (${messages.length}個)`
    });

    const listEl = groupEl.createEl("div", { cls: "textlint-issue-list" });
    
    messages.forEach((message, index) => {
      this.renderSingleMessage(listEl, message, index);
    });
  }

  private renderSingleCard(container: HTMLElement, message: TextlintMessage, index: number) {
    const cardEl = container.createEl("div", { 
      cls: "textlint-card textlint-card-clickable",
      attr: { "data-line": message.line.toString() }
    });
    
    // カード全体をクリックしてジャンプ
    cardEl.onclick = (e) => {
      e.preventDefault();
      this.jumpToLine(message.line, message.column, message.endLine, message.endColumn);
    };
    cardEl.style.cursor = "pointer";
    
    const headerEl = cardEl.createEl("div", { cls: "textlint-card-header" });
    
    const leftSection = headerEl.createEl("div", { cls: "textlint-left" });
    leftSection.createEl("span", { 
      text: `${message.line}:${message.column}`,
      cls: "textlint-issue-location"
    });
    
    const rightSection = headerEl.createEl("div", { cls: "textlint-right" });
    if (message.ruleId) {
      rightSection.createEl("span", { 
        text: message.ruleId,
        cls: "textlint-rule-id"
      });
    }

    // 自動修正が可能な場合は Fix ボタンを表示
    if (message.fix) {
      const fixBtn = rightSection.createEl("button", { cls: "textlint-fix-btn", text: "Fix" });
      fixBtn.onclick = async (e) => {
        e.stopPropagation();
        try {
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (!view) return;
          const editor = view.editor;

          const start = { line: Math.max(0, (message.line || 1) - 1), ch: Math.max(0, (message.column || 1) - 1) };
          const end = {
            line: Math.max(0, ((message.endLine ?? message.line) || 1) - 1),
            ch: Math.max(0, ((message.endColumn ?? message.column) || 1) - 1)
          };

          const from = editor.posToOffset(start);
          const to = editor.posToOffset(end);
          const safeFrom = Math.max(0, Math.min(from, to));
          const safeTo = Math.max(safeFrom, Math.max(from, to));

          const fix = message.fix!;
          editor.replaceRange(fix.text, editor.offsetToPos(safeFrom), editor.offsetToPos(safeTo));
          // Fix 適用後に即時再Lint
          try {
            this.plugin.lintCurrentFileImmediately({ force: true, file: this.currentFile || undefined });
          } catch {}
        } catch (error) {
          const strategy = this.errorHandler.handleUIError(error as any, 'TextlintView.applyFix');
          this.errorHandler.notifyUser(strategy);
          const errorKey = `apply_fix_${Date.now()}`;
          this.errorHandler.executeRecovery(strategy, errorKey);
        }
      };
    }
    
    const messageEl = cardEl.createEl("div", { 
      text: message.message,
      cls: "textlint-card-message"
    });
  }

  private renderSingleMessage(container: HTMLElement, message: TextlintMessage, index: number) {
    const issueEl = container.createEl("div", { 
      cls: "textlint-issue textlint-issue-clickable",
      attr: { "data-line": message.line.toString() }
    });
    
    // カード全体をクリックしてジャンプ
    issueEl.onclick = (e) => {
      e.preventDefault();
      this.jumpToLine(message.line, message.column, message.endLine, message.endColumn);
    };
    issueEl.style.cursor = "pointer";
    
    const headerEl = issueEl.createEl("div", { cls: "textlint-issue-header" });
    
    const leftSection = headerEl.createEl("div", { cls: "textlint-left" });
    leftSection.createEl("span", { 
      text: `${message.line}:${message.column}`,
      cls: "textlint-issue-location"
    });
    
    const rightSection = headerEl.createEl("div", { cls: "textlint-right" });
    if (message.ruleId) {
      rightSection.createEl("span", { 
        text: message.ruleId,
        cls: "textlint-rule-id"
      });
    }
    
    const messageEl = issueEl.createEl("div", { 
      text: message.message,
      cls: "textlint-issue-message"
    });
  }

  private async jumpToLine(line: number, column: number, endLine?: number, endColumn?: number) {
    if (!this.currentFile) return;

    try {
      // 既存リーフではなくアクティブリーフを優先
      let leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(this.currentFile);

      // ビュー初期化待ち（最大10回、各50ms）
      let view = leaf.view;
      let retries = 0;
      while (!(view instanceof MarkdownView) && retries < 10) {
        await new Promise(res => setTimeout(res, 50));
        view = leaf.view;
        retries++;
      }

      if (!(view instanceof MarkdownView)) {
        // それでも取れない場合はアクティブビューを試す
        view = this.app.workspace.getActiveViewOfType(MarkdownView) as any;
        if (!(view instanceof MarkdownView)) return; // 何もできないが静かに終了
      }

      const editor = (view as MarkdownView).editor;
      const lineCount = editor.lineCount();
      if (lineCount <= 0) return;

      // 範囲を安全にクランプ
      const clampedLine = Math.max(0, Math.min((line || 1) - 1, lineCount - 1));
      const lineText = editor.getLine(clampedLine) || '';
      const clampedCh = Math.max(0, Math.min((column || 1) - 1, Math.max(0, lineText.length)));
      const pos = { line: clampedLine, ch: clampedCh };

      try {
        editor.setCursor(pos);
      } catch {}
      try {
        editor.scrollIntoView({ from: pos, to: pos }, true);
      } catch {}

      // ハイライト（終端もクランプ）
      if (endLine && endColumn) {
        const endLineIdx = Math.max(0, Math.min(endLine - 1, lineCount - 1));
        const endLineText = editor.getLine(endLineIdx) || '';
        const endChIdx = Math.max(0, Math.min(endColumn - 1, Math.max(0, endLineText.length)));
        const endPos = { line: endLineIdx, ch: endChIdx };
        try {
          editor.setSelection(pos, endPos);
        } catch {}
        this.temporaryHighlight(editor, pos, endPos);
      } else {
        this.temporaryHighlight(editor, pos);
      }
    } catch (error) {
      // UIエラーは静かに復旧（ユーザ通知は抑制）
      const strategy = this.errorHandler.handleUIError(error as any, 'TextlintView.jumpToLine');
      const errorKey = `jump_to_line_${Date.now()}`;
      this.errorHandler.executeRecovery(strategy, errorKey);
      // 通知は行わない（安定性のため）
    }
  }

  private temporaryHighlight(editor: any, from: any, to?: any) {
    if (this.highlightTimeout) {
      clearTimeout(this.highlightTimeout);
    }

    // 一時的なハイライト
    const safeFrom = {
      line: Math.max(0, from?.line ?? 0),
      ch: Math.max(0, from?.ch ?? 0)
    };
    const endPos = to || { line: safeFrom.line, ch: safeFrom.ch + 5 };
    try {
      editor.setSelection(safeFrom, endPos);
    } catch {}

    this.highlightTimeout = setTimeout(() => {
      try { editor.setCursor(safeFrom); } catch {}
    }, 1500); // 1.5秒後にハイライトを解除
  }

  private copyResults() {
    if (this.messages.length === 0) {
      new Notice("コピーする問題がありません");
      return;
    }

    const fileName = this.currentFile?.name || "Unknown file";
    let text = `# Textlint Issues - ${fileName}\n\n`;
    
    this.messages.forEach((message, index) => {
      text += `${index + 1}. 行 ${message.line}:${message.column}\n`;
      text += `   ${message.message}\n`;
      if (message.ruleId) {
        text += `   Rule: ${message.ruleId}\n`;
      }
      text += `\n`;
    });

    text += `\n合計: ${this.messages.length}個の問題`;

    navigator.clipboard.writeText(text).then(() => {
      new Notice("結果をクリップボードにコピーしました");
    }).catch((error) => {
      // Use ErrorHandler for clipboard errors
      const strategy = this.errorHandler.handleUIError(error, 'TextlintView.copyResults');
      this.errorHandler.notifyUser(strategy);
      const errorKey = `copy_results_${Date.now()}`;
      this.errorHandler.executeRecovery(strategy, errorKey);
    });
  }
} 
