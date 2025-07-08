import { StateField, StateEffect } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, hoverTooltip } from '@codemirror/view';
import { MarkdownView } from 'obsidian';
import { TextlintMessage } from '../types';

export class EditorExtension {
  private app: any;
  private enableDebugLog: boolean = false;

  // State effects for managing highlights
  public addHighlightEffect = StateEffect.define<TextlintMessage[]>();
  public clearHighlightEffect = StateEffect.define<null>();

  constructor(app: any) {
    this.app = app;
  }

  public setDebugMode(enabled: boolean): void {
    this.enableDebugLog = enabled;
  }

  // Highlight field for CodeMirror
  public highlightField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update: (decorations, tr) => {
      decorations = decorations.map(tr.changes);
      
      for (const effect of tr.effects) {
        if (effect.is(this.clearHighlightEffect)) {
          decorations = Decoration.none;
        }
        
        if (effect.is(this.addHighlightEffect)) {
          decorations = Decoration.none;
          const newDecorations = this.createDecorations(effect.value);
          decorations = Decoration.set(newDecorations, true);
        }
      }
      
      return decorations;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  private createDecorations(messages: TextlintMessage[]) {
    const decorations: any[] = [];
    
    messages.forEach((message) => {
      try {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) return;
        
        const editor = activeView.editor;
        const decoration = this.createSingleDecoration(message, editor);
        
        if (decoration) {
          decorations.push(decoration);
        }
      } catch (e) {
        if (this.enableDebugLog) {
          console.error("Failed to create decoration", e);
        }
      }
    });
    
    return decorations.filter(d => d !== null);
  }

  private createSingleDecoration(message: TextlintMessage, editor: any) {
    try {
      const lineCount = editor.lineCount();
      const targetLine = message.line - 1;
      
      // 行数チェック
      if (targetLine < 0 || targetLine >= lineCount) {
        if (this.enableDebugLog) {
          console.warn(`Line ${message.line} is out of range (total: ${lineCount})`);
        }
        return null;
      }

      const lineText = editor.getLine(targetLine);
      if (!lineText) {
        if (this.enableDebugLog) {
          console.warn(`Could not get text for line ${message.line}`);
        }
        return null;
      }

      const targetColumn = Math.max(0, Math.min(message.column - 1, lineText.length - 1));
      
      // 安全な位置計算
      let from: number;
      let to: number;
      
      try {
        from = editor.posToOffset({ line: targetLine, ch: targetColumn });
      } catch (posError) {
        if (this.enableDebugLog) {
          console.warn(`posToOffset failed for line ${targetLine}, column ${targetColumn}:`, posError);
        }
        return null;
      }

      // 終了位置の計算
      if (message.endLine && message.endColumn) {
        const endLine = message.endLine - 1;
        const endColumn = Math.max(0, message.endColumn - 1);
        
        if (endLine >= 0 && endLine < lineCount) {
          const endLineText = editor.getLine(endLine);
          if (endLineText && endColumn <= endLineText.length) {
            try {
              to = editor.posToOffset({ line: endLine, ch: endColumn });
            } catch (endPosError) {
              to = from + 1; // フォールバック
            }
          } else {
            to = from + 1; // フォールバック
          }
        } else {
          to = from + 1; // フォールバック
        }
      } else {
        // スマートな単語境界検出
        const startIndex = targetColumn;
        const wordEnd = this.findWordEnd(lineText, startIndex);
        
        if (wordEnd > startIndex) {
          try {
            to = editor.posToOffset({ line: targetLine, ch: Math.min(wordEnd, lineText.length) });
          } catch (wordPosError) {
            to = from + 1; // フォールバック
          }
        } else {
          to = from + 1; // 最低限1文字
        }
      }
      
      // 最終的な範囲検証と修正
      if (from >= to) {
        to = from + 1;
        
        // ドキュメント全体の長さを超えないようにチェック
        const totalLength = editor.getValue().length;
        if (to > totalLength) {
          if (from > 0) {
            from = from - 1;
            to = from + 1;
          } else {
            return null; // 完全に無効な状況
          }
        }
      }

      // 最終チェック
      if (from < 0 || to <= from) {
        if (this.enableDebugLog) {
          console.warn(`Still invalid range: from=${from}, to=${to}`, message);
        }
        return null;
      }

      return Decoration.mark({
        class: `textlint-highlight textlint-severity-${message.severity}`,
        attributes: { 
          'data-textlint-message': `${message.ruleId}: ${message.message}`,
          'data-textlint-rule': message.ruleId
        },
      }).range(from, to);

    } catch (e) {
      if (this.enableDebugLog) {
        console.error("Failed to create single decoration:", e, message);
      }
      return null;
    }
  }

  private findWordEnd(lineText: string, startIndex: number): number {
    let endIndex = startIndex;
    const maxLength = Math.min(lineText.length, startIndex + 20);
    
    // Skip whitespace at start
    while (endIndex < maxLength && /\s/.test(lineText[endIndex])) {
      endIndex++;
    }
    
    // Find word boundary
    while (endIndex < maxLength) {
      const char = lineText[endIndex];
      if (char === ' ' || char === '\n' || char === '、' || char === '。' || char === '　' || 
          char === '!' || char === '?' || char === '：' || char === '；') {
        break;
      }
      endIndex++;
    }
    
    return Math.max(endIndex, startIndex + 1);
  }

  // Hover tooltip for showing lint messages
  public createHoverTooltip() {
    return hoverTooltip((view, pos, side) => {
      const decorations = view.state.field(this.highlightField);
      let foundTooltip: string | null = null;
      let foundRule: string | null = null;
      
      decorations.between(pos, pos, (from: number, to: number, decoration: Decoration) => {
        const message = decoration.spec.attributes?.['data-textlint-message'];
        const rule = decoration.spec.attributes?.['data-textlint-rule'];
        
        if (message && !foundTooltip) {
          foundTooltip = message;
          foundRule = rule;
          return false; // Stop iteration
        }
      });
      
      if (foundTooltip) {
        return {
          pos,
          above: true,
          create: () => {
            const dom = document.createElement("div");
            dom.className = "textlint-tooltip";
            
            if (foundRule) {
              const ruleEl = document.createElement("div");
              ruleEl.className = "textlint-tooltip-rule";
              ruleEl.textContent = `Rule: ${foundRule}`;
              dom.appendChild(ruleEl);
            }
            
            const messageEl = document.createElement("div");
            messageEl.className = "textlint-tooltip-message";
            messageEl.textContent = foundTooltip;
            dom.appendChild(messageEl);
            
            return { dom };
          }
        };
      }
      
      return null;
    });
  }

  // Base theme for styling
  public createBaseTheme() {
    return EditorView.baseTheme({
      ".textlint-highlight": {
        backgroundColor: "rgba(255, 255, 0, 0.3)",
        borderBottom: "2px solid #ff9500",
        borderRadius: "2px",
        cursor: "help",
        transition: "background-color 0.2s ease",
      },
      ".textlint-highlight:hover": {
        backgroundColor: "rgba(255, 255, 0, 0.5)",
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
        borderRadius: "6px",
        padding: "8px 12px",
        fontSize: "0.85em",
        color: "var(--text-normal)",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
        maxWidth: "350px",
        wordWrap: "break-word",
        zIndex: 10000,
        fontFamily: "var(--font-ui)",
      },
      ".textlint-tooltip-rule": {
        fontSize: "0.8em",
        color: "var(--text-muted)",
        marginBottom: "4px",
        fontWeight: "500",
      },
      ".textlint-tooltip-message": {
        lineHeight: "1.4",
      }
    });
  }

  // Clear highlights
  public clearHighlights(): void {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) return;
    
    const cm = (activeView.editor as any).cm as EditorView;
    if (cm) {
      cm.dispatch({
        effects: this.clearHighlightEffect.of(null)
      });
    }
  }

  // Add highlights
  public addHighlights(messages: TextlintMessage[]): void {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) return;
    
    const cm = (activeView.editor as any).cm as EditorView;
    if (cm) {
      cm.dispatch({
        effects: this.addHighlightEffect.of(messages)
      });
    }
  }

  // Get the complete extension array
  public getExtensions() {
    return [
      this.highlightField,
      this.createHoverTooltip(),
      this.createBaseTheme(),
    ];
  }
} 