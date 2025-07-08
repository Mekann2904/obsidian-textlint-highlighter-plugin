import { ItemView, WorkspaceLeaf, TFile, MarkdownView, Notice } from 'obsidian';
import { TextlintMessage, VIEW_TYPE_TEXTLINT } from '../types';

export class TextlintView extends ItemView {
  private messages: TextlintMessage[] = [];
  private currentFile: TFile | null = null;
  private highlightTimeout: NodeJS.Timeout | null = null;
  private plugin: any;

  constructor(leaf: WorkspaceLeaf, plugin: any) {
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
      this.plugin.lintCurrentFileImmediately();
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

        // 短時間ハイライト表示
        this.temporaryHighlight(editor, pos, endLine && endColumn ? { line: endLine - 1, ch: endColumn - 1 } : undefined);
      }
    } catch (error) {
      console.error("Failed to jump to line:", error);
      new Notice("行へのジャンプに失敗しました");
    }
  }

  private temporaryHighlight(editor: any, from: any, to?: any) {
    if (this.highlightTimeout) {
      clearTimeout(this.highlightTimeout);
    }

    // 一時的なハイライト
    const endPos = to || { line: from.line, ch: from.ch + 5 };
    editor.setSelection(from, endPos);

    this.highlightTimeout = setTimeout(() => {
      editor.setCursor(from);
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
    }).catch(() => {
      new Notice("コピーに失敗しました");
    });
  }
} 