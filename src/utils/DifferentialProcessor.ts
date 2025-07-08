import { TextlintMessage } from '../types';

interface TextChangePosition {
  line: number;
  column: number;
  deletedLines: number;
  insertedLines: number;
}

interface CachedResult {
  content: string;
  messages: TextlintMessage[];
  timestamp: number;
}

export class DifferentialProcessor {
  private static previousResults = new Map<string, CachedResult>();
  
  public static findChangedRegions(
    oldContent: string,
    newContent: string,
    contextLines: number = 5
  ): { start: number; end: number }[] {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const changedRegions: { start: number; end: number }[] = [];
    
    let currentRegion: { start: number; end: number } | null = null;
    
    for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
      const oldLine = oldLines[i] || '';
      const newLine = newLines[i] || '';
      
      if (oldLine !== newLine) {
        if (!currentRegion) {
          currentRegion = {
            start: Math.max(0, i - contextLines),
            end: i + contextLines
          };
        } else {
          currentRegion.end = i + contextLines;
        }
      } else if (currentRegion && i > currentRegion.end) {
        changedRegions.push(currentRegion);
        currentRegion = null;
      }
    }
    
    if (currentRegion) {
      changedRegions.push(currentRegion);
    }
    
    return this.mergeOverlappingRegions(changedRegions);
  }
  
  private static mergeOverlappingRegions(
    regions: { start: number; end: number }[]
  ): { start: number; end: number }[] {
    if (regions.length === 0) return [];
    
    const merged = [regions[0]];
    
    for (let i = 1; i < regions.length; i++) {
      const current = regions[i];
      const last = merged[merged.length - 1];
      
      if (current.start <= last.end) {
        last.end = Math.max(last.end, current.end);
      } else {
        merged.push(current);
      }
    }
    
    return merged;
  }
  
  public static extractRegionContent(
    content: string,
    regions: { start: number; end: number }[]
  ): string {
    const lines = content.split('\n');
    const extractedLines: string[] = [];
    
    for (const region of regions) {
      const regionLines = lines.slice(region.start, region.end + 1);
      extractedLines.push(...regionLines);
    }
    
    return extractedLines.join('\n');
  }
  
  public static async processChangedRegionsOnly(
    filePath: string,
    newContent: string,
    lintFunction: (content: string) => Promise<TextlintMessage[]>
  ): Promise<TextlintMessage[]> {
    const cached = this.previousResults.get(filePath);
    
    if (!cached) {
      // 初回処理または キャッシュなし
      const messages = await lintFunction(newContent);
      this.previousResults.set(filePath, {
        content: newContent,
        messages,
        timestamp: Date.now()
      });
      return messages;
    }
    
    const changedRegions = this.findChangedRegions(cached.content, newContent);
    
    if (changedRegions.length === 0) {
      // 変更がない場合
      return cached.messages;
    }
    
    // 変更領域が全体の50%以上の場合は、全体を再処理
    const totalLines = newContent.split('\n').length;
    const changedLines = changedRegions.reduce(
      (sum, region) => sum + (region.end - region.start + 1),
      0
    );
    
    if (changedLines / totalLines > 0.5) {
      const messages = await lintFunction(newContent);
      this.previousResults.set(filePath, {
        content: newContent,
        messages,
        timestamp: Date.now()
      });
      return messages;
    }
    
    // 変更部分のみを処理
    const regionContent = this.extractRegionContent(newContent, changedRegions);
    const regionMessages = await lintFunction(regionContent);
    
    // 行番号を調整
    const adjustedMessages = this.adjustLineNumbers(regionMessages, changedRegions);
    
    // 既存の結果と新しい結果をマージ
    const mergedMessages = this.mergeResults(
      cached.messages,
      adjustedMessages,
      changedRegions
    );
    
    this.previousResults.set(filePath, {
      content: newContent,
      messages: mergedMessages,
      timestamp: Date.now()
    });
    
    return mergedMessages;
  }
  
  private static adjustLineNumbers(
    messages: TextlintMessage[],
    regions: { start: number; end: number }[]
  ): TextlintMessage[] {
    return messages.map(message => {
      let adjustedLine = message.line;
      
      for (const region of regions) {
        if (message.line <= (region.end - region.start + 1)) {
          adjustedLine = region.start + message.line;
          break;
        }
      }
      
      return {
        ...message,
        line: adjustedLine,
        endLine: message.endLine ? adjustedLine : undefined
      };
    });
  }
  
  private static mergeResults(
    oldMessages: TextlintMessage[],
    newMessages: TextlintMessage[],
    changedRegions: { start: number; end: number }[]
  ): TextlintMessage[] {
    // 変更領域外のメッセージを保持
    const unchangedMessages = oldMessages.filter(message => {
      return !changedRegions.some(region => 
        message.line >= region.start && message.line <= region.end
      );
    });
    
    // 新しいメッセージと結合
    return [...unchangedMessages, ...newMessages].sort((a, b) => a.line - b.line);
  }
  
  public static clearCache(filePath?: string): void {
    if (filePath) {
      this.previousResults.delete(filePath);
    } else {
      this.previousResults.clear();
    }
  }
  
  public static getCacheStats(): { files: number; totalSize: number } {
    let totalSize = 0;
    
    for (const cached of this.previousResults.values()) {
      totalSize += cached.content.length + cached.messages.length * 100; // 概算
    }
    
    return {
      files: this.previousResults.size,
      totalSize
    };
  }
} 