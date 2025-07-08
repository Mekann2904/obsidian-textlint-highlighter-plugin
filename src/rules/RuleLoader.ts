import { TextlintRule, TextlintPluginSettings, RuleConfig } from '../types';
import { Cache } from '../utils/Cache';

// Textlintモジュールの静的インポート
// @ts-ignore
const pluginMarkdown = require('@textlint/textlint-plugin-markdown').default || require('@textlint/textlint-plugin-markdown');
// @ts-ignore
const presetJaTechnicalWriting = require('textlint-rule-preset-ja-technical-writing').default || require('textlint-rule-preset-ja-technical-writing');
// @ts-ignore
const presetJaSpacing = require('textlint-rule-preset-ja-spacing').default || require('textlint-rule-preset-ja-spacing');
// @ts-ignore
const presetAiWriting = require('@textlint-ja/textlint-rule-preset-ai-writing').default || require('@textlint-ja/textlint-rule-preset-ai-writing');
// @ts-ignore
const presetJtfStyle = require('textlint-rule-preset-jtf-style').default || require('textlint-rule-preset-jtf-style');
// @ts-ignore
const ruleNoDroppingI = require('@textlint-ja/textlint-rule-no-dropping-i').default || require('@textlint-ja/textlint-rule-no-dropping-i');
// @ts-ignore
const ruleNoInsertDroppingSa = require('@textlint-ja/textlint-rule-no-insert-dropping-sa').default || require('@textlint-ja/textlint-rule-no-insert-dropping-sa');
// @ts-ignore
const ruleNoDoubledJoshi = require('textlint-rule-no-doubled-joshi').default || require('textlint-rule-no-doubled-joshi');
// @ts-ignore
const ruleNoMixedZenkakuAndHankakuAlphabet = require('textlint-rule-no-mixed-zenkaku-and-hankaku-alphabet').default || require('textlint-rule-no-mixed-zenkaku-and-hankaku-alphabet');
// @ts-ignore
const rulePreferTariTari = require('textlint-rule-prefer-tari-tari').default || require('textlint-rule-prefer-tari-tari');
// @ts-ignore
const ruleWriteGood = require('textlint-rule-write-good').default || require('textlint-rule-write-good');
// @ts-ignore
const ruleJaNoOrthographicVariants = require('textlint-rule-ja-no-orthographic-variants').default || require('textlint-rule-ja-no-orthographic-variants');
// @ts-ignore
const ruleNoMixDearuDesumasu = require('textlint-rule-no-mix-dearu-desumasu').default || require('textlint-rule-no-mix-dearu-desumasu');
// @ts-ignore
const ruleNoStartDuplicatedConjunction = require('textlint-rule-no-start-duplicated-conjunction').default || require('textlint-rule-no-start-duplicated-conjunction');
// @ts-ignore
const ruleDateWeekdayMismatch = require('textlint-rule-date-weekday-mismatch').default || require('textlint-rule-date-weekday-mismatch');

export class RuleLoader {
  private static instance: RuleLoader;
  private rulesCache: Cache<TextlintRule[]>;
  private configCache: Cache<any>;
  private enableDebugLog: boolean = false;

  private constructor() {
    this.rulesCache = new Cache<TextlintRule[]>(10 * 60 * 1000); // 10 minutes cache
    this.configCache = new Cache<any>(10 * 60 * 1000);
  }

  public static getInstance(): RuleLoader {
    if (!RuleLoader.instance) {
      RuleLoader.instance = new RuleLoader();
    }
    return RuleLoader.instance;
  }

  public setDebugMode(enabled: boolean): void {
    this.enableDebugLog = enabled;
  }

  public async loadRules(settings: TextlintPluginSettings): Promise<TextlintRule[]> {
    const settingsKey = this.generateSettingsKey(settings);
    
    // Check cache first
    if (this.rulesCache.has(settingsKey)) {
      const cachedRules = this.rulesCache.get(settingsKey);
      if (cachedRules) {
        if (this.enableDebugLog) {
          console.log(`キャッシュからルールを読み込み: ${cachedRules.length}個`);
        }
        return cachedRules;
      }
    }

    if (this.enableDebugLog) {
      console.log('=== ルール読み込み開始 ===');
    }

    const rules: TextlintRule[] = [];

    // 各プリセットを並列処理で読み込み
    const presetTasks = [];

    if (settings.useTechnicalWritingPreset) {
      presetTasks.push(this.loadTechnicalWritingPreset());
    }

    if (settings.useSpacingPreset) {
      presetTasks.push(this.loadSpacingPreset());
    }

    if (settings.useCustomRules) {
      presetTasks.push(this.loadAiWritingPreset());
    }

    if (settings.useJtfStylePreset) {
      presetTasks.push(this.loadJtfStylePreset());
    }

    // 個別ルール
    presetTasks.push(this.loadIndividualRules(settings));

    // 並列実行
    const results = await Promise.allSettled(presetTasks);
    
    // 結果をマージ
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        rules.push(...result.value);
      } else {
        console.error(`ルール読み込みエラー (Task ${index}):`, result.reason);
      }
    });

    // ルール検証
    const validRules = this.validateRules(rules);

    // キャッシュに保存
    this.rulesCache.set(settingsKey, validRules);

    if (this.enableDebugLog) {
      console.log(`有効なルール数: ${validRules.length}`);
      console.log(`キャッシュに保存: ${settingsKey}`);
    }

    return validRules;
  }

  public generateLintConfig(rules: TextlintRule[]): any {
    const configKey = `config_${rules.length}_${Date.now()}`;
    
    return {
      ext: '.md',
      plugins: [
        {
          pluginId: '@textlint/textlint-plugin-markdown',
          plugin: pluginMarkdown,
          options: true
        }
      ],
      rules: rules,
      filterRules: []
    };
  }

  private async loadTechnicalWritingPreset(): Promise<TextlintRule[]> {
    const rules: TextlintRule[] = [];
    
    try {
      const preset = presetJaTechnicalWriting;
      if (preset && preset.rules) {
        Object.entries(preset.rules).forEach(([ruleId, rule]) => {
          const actualRule = this.extractRuleFunction(rule);
          const ruleOptions = preset.rulesConfig?.[ruleId] === false ? false : 
            (typeof preset.rulesConfig?.[ruleId] === 'object' ? preset.rulesConfig[ruleId] : true);
          
          if (ruleOptions !== false && actualRule) {
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
    
    return rules;
  }

  private async loadSpacingPreset(): Promise<TextlintRule[]> {
    const rules: TextlintRule[] = [];
    
    try {
      const preset = presetJaSpacing;
      if (preset && preset.rules) {
        Object.entries(preset.rules).forEach(([ruleId, rule]) => {
          const actualRule = this.extractRuleFunction(rule);
          const ruleOptions = preset.rulesConfig?.[ruleId] === false ? false : 
            (typeof preset.rulesConfig?.[ruleId] === 'object' ? preset.rulesConfig[ruleId] : true);
          
          if (ruleOptions !== false && actualRule) {
            rules.push({
              ruleId: `spacing/${ruleId}`,
              rule: actualRule,
              options: ruleOptions
            });
          }
        });
      }
    } catch (error) {
      console.error("スペース・句読点プリセットの読み込みに失敗:", error);
    }
    
    return rules;
  }

  private async loadAiWritingPreset(): Promise<TextlintRule[]> {
    const rules: TextlintRule[] = [];
    
    try {
      const preset = presetAiWriting;
      const presetRules = preset.rules || {};
      const presetRulesConfig = preset.rulesConfig || {};
      
      Object.entries(presetRules).forEach(([ruleId, rule]) => {
        const ruleOptions = presetRulesConfig[ruleId];
        if (ruleOptions === false) return;
        
        const actualRule = this.extractRuleFunction(rule);
        if (actualRule) {
          rules.push({
            ruleId: `ai-writing/${ruleId}`,
            rule: actualRule,
            options: ruleOptions
          });
        }
      });
    } catch (error) {
      console.error("AI文章向けプリセットの読み込みに失敗:", error);
    }
    
    return rules;
  }

  private async loadJtfStylePreset(): Promise<TextlintRule[]> {
    const rules: TextlintRule[] = [];
    
    try {
      const preset = presetJtfStyle;
      const presetRules = preset.rules || {};
      const presetRulesConfig = preset.rulesConfig || {};
      
      Object.entries(presetRules).forEach(([ruleId, rule]) => {
        const ruleOptions = presetRulesConfig[ruleId];
        if (ruleOptions === false) return;
        
        const actualRule = this.extractRuleFunction(rule);
        if (actualRule) {
          rules.push({
            ruleId: `jtf-style/${ruleId}`,
            rule: actualRule,
            options: ruleOptions || true
          });
        }
      });
    } catch (error) {
      console.error("JTFスタイルガイドプリセットの読み込みに失敗:", error);
    }
    
    return rules;
  }

  private async loadIndividualRules(settings: TextlintPluginSettings): Promise<TextlintRule[]> {
    const rules: TextlintRule[] = [];
    
    const individualRules: RuleConfig[] = [
      { 
        name: '@textlint-ja/textlint-rule-no-dropping-i',
        module: ruleNoDroppingI,
        setting: settings.useNoDroppingI,
        description: 'い抜き言葉'
      },
      { 
        name: '@textlint-ja/textlint-rule-no-insert-dropping-sa',
        module: ruleNoInsertDroppingSa,
        setting: settings.useNoInsertDroppingSa,
        description: 'さ入れ言葉'
      },
      { 
        name: 'no-doubled-joshi',
        module: ruleNoDoubledJoshi,
        setting: settings.useNoDoubledJoshi,
        description: '助詞の重複'
      },
      { 
        name: 'no-mixed-zenkaku-and-hankaku-alphabet',
        module: ruleNoMixedZenkakuAndHankakuAlphabet,
        setting: settings.useNoMixedZenkakuHankakuAlphabet,
        description: '全角半角英字混在'
      },
      { 
        name: 'prefer-tari-tari',
        module: rulePreferTariTari,
        setting: settings.usePreferTariTari,
        description: 'たりたり表現'
      },
      { 
        name: 'write-good',
        module: ruleWriteGood,
        setting: settings.useWriteGood,
        description: '英語ライティング品質'
      },
      { 
        name: 'ja-no-orthographic-variants',
        module: ruleJaNoOrthographicVariants,
        setting: settings.useJaNoOrthographicVariants,
        description: '日本語表記ゆれ'
      },
      { 
        name: 'no-mix-dearu-desumasu',
        module: ruleNoMixDearuDesumasu,
        setting: settings.useNoMixDearuDesumasu,
        description: 'である調・ですます調混在'
      },
      { 
        name: 'no-start-duplicated-conjunction',
        module: ruleNoStartDuplicatedConjunction,
        setting: settings.useNoStartDuplicatedConjunction,
        description: '文頭接続詞重複'
      },
      { 
        name: 'date-weekday-mismatch',
        module: ruleDateWeekdayMismatch,
        setting: settings.useDateWeekdayMismatch,
        description: '日付曜日不一致'
      }
    ];

    for (const ruleInfo of individualRules) {
      if (!ruleInfo.setting) continue;

      try {
        const actualRule = this.extractRuleFunction(ruleInfo.module);
        if (actualRule) {
          rules.push({
            ruleId: `additional/${ruleInfo.name}`,
            rule: actualRule,
            options: true
          });
          
          if (this.enableDebugLog) {
            console.log(`Successfully loaded ${ruleInfo.description} rule: ${ruleInfo.name}`);
          }
        }
      } catch (error) {
        if (this.enableDebugLog) {
          console.warn(`Failed to load ${ruleInfo.description} rule ${ruleInfo.name}:`, error.message);
        }
      }
    }

    return rules;
  }

  private extractRuleFunction(rule: any): any {
    if (typeof rule === 'function') {
      return rule;
    }
    
    if (rule && typeof rule === 'object') {
      if (rule.default && typeof rule.default === 'function') {
        return rule.default;
      } else if (rule.linter && typeof rule.linter === 'function') {
        return rule.linter;
      }
    }
    
    return null;
  }

  private validateRules(rules: TextlintRule[]): TextlintRule[] {
    return rules.filter(r => {
      const isValid = r.rule && (
        typeof r.rule === 'function' || 
        (typeof r.rule === 'object' && r.rule !== null)
      );
      
      if (this.enableDebugLog && !isValid) {
        console.warn(`Invalid rule filtered out: ${r.ruleId}`);
      }
      
      return isValid;
    });
  }

  private generateSettingsKey(settings: TextlintPluginSettings): string {
    // 設定の変更を検出するためのキーを生成
    const keyParts = [
      settings.useTechnicalWritingPreset ? 'tech' : '',
      settings.useSpacingPreset ? 'space' : '',
      settings.useJtfStylePreset ? 'jtf' : '',
      settings.useCustomRules ? 'ai' : '',
      settings.useNoDroppingI ? 'dropi' : '',
      settings.useNoInsertDroppingSa ? 'dropsa' : '',
      settings.useNoDoubledJoshi ? 'joshi' : '',
      settings.useNoMixedZenkakuHankakuAlphabet ? 'alpha' : '',
      settings.usePreferTariTari ? 'tari' : '',
      settings.useWriteGood ? 'writegood' : '',
      settings.useJaNoOrthographicVariants ? 'orthographic' : '',
      settings.useNoMixDearuDesumasu ? 'mixstyle' : '',
      settings.useNoStartDuplicatedConjunction ? 'conjunction' : '',
      settings.useDateWeekdayMismatch ? 'dateweekday' : ''
    ].filter(Boolean);
    
    return keyParts.join('_') || 'empty';
  }

  public clearCache(): void {
    this.rulesCache.clear();
    this.configCache.clear();
  }

  public getCacheStats(): { rules: any, config: any } {
    return {
      rules: this.rulesCache.getStats(),
      config: this.configCache.getStats()
    };
  }
} 