import { TextlintPluginSettings } from '../types';

export interface ProcessingStrategy {
  maxFileSize: number;
  enabledRules: string[];
  processingTimeout: number;
  chunkSize?: number;
}

export class AdaptiveProcessor {
  private static readonly STRATEGIES: ProcessingStrategy[] = [
    {
      maxFileSize: 1000,        // 1000行未満
      enabledRules: ['all'],
      processingTimeout: 15000,  // 15秒（Kuromoji対応）
    },
    {
      maxFileSize: 5000,        // 1000-5000行
      enabledRules: ['all'],     // Kuromojiを含む全ルール
      processingTimeout: 30000,  // 30秒（Kuromoji対応）
      chunkSize: 1000,
    },
    {
      maxFileSize: 10000,       // 5000-10000行
      enabledRules: ['all'],     // Kuromojiを含む全ルール
      processingTimeout: 45000,  // 45秒（Kuromoji対応）
      chunkSize: 500,
    },
    {
      maxFileSize: Infinity,    // 10000行以上
      enabledRules: ['all'],     // Kuromojiを含む全ルール
      processingTimeout: 60000,  // 60秒（Kuromoji対応）
      chunkSize: 200,
    }
  ];

  public static getOptimalStrategy(content: string): ProcessingStrategy {
    const lineCount = content.split('\n').length;
    
    for (const strategy of this.STRATEGIES) {
      if (lineCount < strategy.maxFileSize) {
        return strategy;
      }
    }
    
    return this.STRATEGIES[this.STRATEGIES.length - 1];
  }

  public static shouldUseKuromoji(content: string, settings: TextlintPluginSettings): boolean {
    // Kuromojiは日本語校正の品質維持のため、常に設定に従って使用
    return settings.useKuromoji;
  }

  public static getOptimizedRuleSet(
    content: string, 
    settings: TextlintPluginSettings
  ): TextlintPluginSettings {
    // Kuromojiを含む全てのルールを品質維持のため使用
    // 大きなファイルではチャンク処理でパフォーマンスを最適化
    const optimizedSettings: TextlintPluginSettings = { ...settings };

    // Kuromojiは常に設定に従って使用
    optimizedSettings.useKuromoji = this.shouldUseKuromoji(content, settings);

    return optimizedSettings;
  }

  public static async processWithTimeout<T>(
    processFunction: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`処理がタイムアウトしました (${timeout}ms)`));
      }, timeout);

      processFunction()
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timer));
    });
  }

  public static createProcessingChunks(content: string, chunkSize: number): string[] {
    const lines = content.split('\n');
    const chunks: string[] = [];
    
    for (let i = 0; i < lines.length; i += chunkSize) {
      chunks.push(lines.slice(i, i + chunkSize).join('\n'));
    }
    
    return chunks;
  }

  public static async processWithKuromojiOptimization<T>(
    content: string,
    processFunction: (content: string) => Promise<T>,
    strategy: ProcessingStrategy
  ): Promise<T> {
    const lineCount = content.split('\n').length;
    
    // 小さなファイルは通常通り処理
    if (lineCount < 1000) {
      return await processFunction(content);
    }
    
    // 大きなファイルはチャンク処理
    if (strategy.chunkSize) {
      const chunks = this.createProcessingChunks(content, strategy.chunkSize);
      const chunkData = chunks.map(chunk => ({ content: chunk, lines: chunk.split('\n').length }));
      const results: { result: any; lines: number }[] = [];
      
             for (let i = 0; i < chunkData.length; i++) {
         try {
           const chunk = chunkData[i];
           const chunkTimeout = strategy.processingTimeout / chunkData.length;
           
           const result = await new Promise<T>((resolve, reject) => {
             const timer = setTimeout(() => {
               reject(new Error(`チャンク処理がタイムアウトしました (${chunkTimeout}ms)`));
             }, chunkTimeout);

             processFunction(chunk.content)
               .then(resolve)
               .catch(reject)
               .finally(() => clearTimeout(timer));
           });
           
           results.push({ result, lines: chunk.lines });
         } catch (error) {
           console.warn(`チャンク ${i + 1}/${chunkData.length} の処理でエラー:`, error);
           // エラーが発生したチャンクはスキップして続行
         }
       }
      
      // 結果をマージ（型に応じて適切にマージ）
      return this.mergeChunkResults(results) as T;
    }
    
         // チャンク処理が設定されていない場合は通常処理
     return await new Promise<T>((resolve, reject) => {
       const timer = setTimeout(() => {
         reject(new Error(`処理がタイムアウトしました (${strategy.processingTimeout}ms)`));
       }, strategy.processingTimeout);

       processFunction(content)
         .then(resolve)
         .catch(reject)
         .finally(() => clearTimeout(timer));
     });
  }

  private static mergeChunkResults(results: { result: any; lines: number }[]): any {
    if (results.length === 0) return { messages: [] };
    
    // TextlintResult型と仮定してマージ
    const mergedMessages: any[] = [];
    let lineOffset = 0;
    
    for (const item of results) {
      const { result, lines } = item;
      if (result && result.messages) {
        const adjustedMessages = result.messages.map((msg: any) => ({
          ...msg,
          line: msg.line + lineOffset,
          endLine: msg.endLine ? msg.endLine + lineOffset : undefined
        }));
        mergedMessages.push(...adjustedMessages);
      }
      lineOffset += lines;
    }
    
    return {
      messages: mergedMessages.sort((a: any, b: any) => a.line - b.line),
      filePath: results[0]?.result?.filePath || ''
    };
  }
} 