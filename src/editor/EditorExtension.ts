import { StateField, StateEffect } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, hoverTooltip } from '@codemirror/view';
import { MarkdownView } from 'obsidian';
import { TextlintMessage } from '../types';
import { MemoryManager } from '../utils/MemoryManager';
import { ErrorHandler, ErrorSeverity, ErrorCategory } from '../utils/ErrorHandler';

export class EditorExtension {
  private app: any;
  private enableDebugLog: boolean = false;
  private memoryManager: MemoryManager;
  private errorHandler: ErrorHandler;
  private installedEditors: WeakSet<any> = new WeakSet();

  // State effects for managing highlights
  public updateHighlightsEffect = StateEffect.define<TextlintMessage[]>();

  constructor(app: any) {
    this.app = app;
    this.memoryManager = MemoryManager.getInstance();
    this.errorHandler = ErrorHandler.getInstance();
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
        if (effect.is(this.updateHighlightsEffect)) {
          // 渡されたメッセージから新しいデコレーションセットを作成
          const newDecorations = this.createDecorations(effect.value);
          decorations = Decoration.set(newDecorations, true);
        }
      }
      
      return decorations;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  // 最適化されたデコレーション作成（同期版）
  private createDecorations(messages: TextlintMessage[]) {
    const decorations: any[] = [];
    
    if (this.enableDebugLog) {
      console.log(`Creating decorations for ${messages.length} messages`);
    }
    
    // すべてのメッセージを同期的に処理（シンプル化）
    messages.forEach((message, index) => {
      try {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) return;
        
        const editor = activeView.editor;
        const decoration = this.createSingleDecoration(message, editor);
        
        if (decoration) {
          decorations.push(decoration);
          if (this.enableDebugLog && index < 10) { // 最初の10個のみログ出力
            console.log(`Decoration ${index + 1} created successfully`);
          }
        } else {
          if (this.enableDebugLog) {
            console.warn(`Failed to create decoration for message ${index + 1}:`, message);
          }
        }
      } catch (e) {
        // Use ErrorHandler for decoration creation errors
        const context = {
          operation: 'decoration_creation',
          timestamp: Date.now(),
          stackTrace: e.stack,
          additionalData: { messageIndex: index + 1, message }
        };
        
        const strategy = this.errorHandler.handleUIError(e, 'EditorExtension.createDecorations');
        const errorKey = `decoration_${index}_${Date.now()}`;
        this.errorHandler.executeRecovery(strategy, errorKey);
        
        // Only notify for high severity errors to avoid spam
        if (strategy.severity === ErrorSeverity.HIGH || strategy.severity === ErrorSeverity.CRITICAL) {
          this.errorHandler.notifyUser(strategy);
        }
      }
    });
    
    if (this.enableDebugLog) {
      console.log(`Successfully created ${decorations.length} out of ${messages.length} decorations`);
    }
    
    return decorations.filter(d => d !== null);
  }

  private createSingleDecoration(message: TextlintMessage, editor: any) {
    try {
      const lineCount = editor.lineCount();
      const targetLine = message.line - 1;
      
      // 早期リターンでパフォーマンス改善
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
      
      // 最適化された位置計算
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

      // 終了位置の効率的な計算
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
        // 最適化された単語境界検出
        const wordEnd = this.findWordEndOptimized(lineText, targetColumn);
        
        try {
          to = editor.posToOffset({ line: targetLine, ch: Math.min(wordEnd, lineText.length) });
        } catch (wordPosError) {
          to = from + 1; // フォールバック
        }
      }
      
      // 最終的な範囲検証（最適化版）
      if (from >= to) {
        to = from + 1;
        
        // ドキュメント全体の長さチェック（キャッシュ使用）
        const totalLength = editor.getValue().length;
        if (to > totalLength) {
          if (from > 0) {
            from = from - 1;
            to = from + 1;
          } else {
            return null;
          }
        }
      }

      // 最終チェック（早期リターン）
      if (from < 0 || to <= from) {
        if (this.enableDebugLog) {
          console.warn(`Invalid range: from=${from}, to=${to}`, message);
        }
        return null;
      }

      const decorationClass = `textlint-highlight textlint-severity-${message.severity}`;
      
      if (this.enableDebugLog) {
        console.log(`Creating decoration: line=${message.line}, column=${message.column}, severity=${message.severity}, class="${decorationClass}", from=${from}, to=${to}, ruleId=${message.ruleId}`);
      }

      return Decoration.mark({
        class: decorationClass,
        attributes: { 
          'data-textlint-message': `${message.ruleId}: ${message.message}`,
          'data-textlint-rule': message.ruleId,
          'data-textlint-severity': message.severity.toString()
        },
      }).range(from, to);

    } catch (e) {
      // Use ErrorHandler for single decoration creation errors
      const context = {
        operation: 'single_decoration_creation',
        timestamp: Date.now(),
        stackTrace: e.stack,
        additionalData: { message }
      };
      
      const strategy = this.errorHandler.handleUIError(e, 'EditorExtension.createSingleDecoration');
      const errorKey = `single_decoration_${Date.now()}`;
      this.errorHandler.executeRecovery(strategy, errorKey);
      
      // Only log for debug mode to avoid spam
      if (this.enableDebugLog) {
        console.error("Failed to create single decoration:", e, message);
      }
      
      return null;
    }
  }

  // 最適化された単語境界検出
  private findWordEndOptimized(lineText: string, startIndex: number): number {
    const maxLength = Math.min(lineText.length, startIndex + 20);
    let endIndex = startIndex;
    
    // 連続する空白をスキップ（最適化）
    while (endIndex < maxLength && /\s/.test(lineText[endIndex])) {
      endIndex++;
    }
    
    // 区切り文字のセットを事前定義（パフォーマンス改善）
    const separators = new Set([' ', '\n', '、', '。', '　', '!', '?', '：', '；', ',', '.']);
    
    // 単語境界を効率的に検出
    while (endIndex < maxLength) {
      if (separators.has(lineText[endIndex])) {
        break;
      }
      endIndex++;
    }
    
    return Math.max(endIndex, startIndex + 1);
  }

  private findWordEnd(lineText: string, startIndex: number): number {
    // 下位互換性のため残す
    return this.findWordEndOptimized(lineText, startIndex);
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

  public updateHighlights(messages: TextlintMessage[]): void {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      if (this.enableDebugLog) {
        console.log("No active markdown view. Skipping highlight update.");
      }
      return;
    }

    const view = activeView.editor.cm;
    if (!view) return;

    if (this.enableDebugLog) {
      console.log(`Dispatching update for ${messages.length} highlights.`);
    }

    // 1つのトランザクションでハイライトを更新
    view.dispatch({
      effects: this.updateHighlightsEffect.of(messages),
    });
  }

  public getExtensions() {
    return [
      this.highlightField,
      this.createHoverTooltip(),
      this.createBaseTheme(),
    ];
  }

  // 既存エディタに拡張を動的適用（再起動や再オープン不要に）
  public installToAllOpenEditors(): void {
    try {
      this.app.workspace.iterateAllLeaves((leaf: any) => {
        const view = leaf?.view;
        if (view instanceof MarkdownView) {
          const cm = (view as any).editor?.cm;
          if (cm) {
            try {
              // すでにインストール済みなら二重適用を避ける
              if (this.installedEditors.has(cm)) {
                if (this.enableDebugLog) console.log('Skipped applying extensions (already installed)');
              } else {
                cm.dispatch({ effects: StateEffect.appendConfig.of(this.getExtensions()) });
                this.installedEditors.add(cm);
                if (this.enableDebugLog) {
                  console.log('Applied CM extensions to existing editor');
                }
              }
            } catch (e) {
              if (this.enableDebugLog) console.warn('Failed to append CM config:', e);
            }
          }
        }
      });
    } catch (e) {
      if (this.enableDebugLog) console.warn('iterateAllLeaves not available or failed:', e);
    }
  }
}
