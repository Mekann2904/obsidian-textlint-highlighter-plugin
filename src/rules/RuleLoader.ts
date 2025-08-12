import { TextlintRule, TextlintPluginSettings, RuleConfig } from '../types';
import { Cache } from '../utils/Cache';
import { ErrorHandler, ErrorSeverity, ErrorCategory } from '../utils/ErrorHandler';
import * as path from 'path';
import * as fs from 'fs';

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
const presetJapanese = require('textlint-rule-preset-japanese').default || require('textlint-rule-preset-japanese');
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
// @ts-ignore
const ruleJaHiraku = require('textlint-rule-ja-hiraku').default || require('textlint-rule-ja-hiraku');
// @ts-ignore
const rulePrh = require('textlint-rule-prh').default || require('textlint-rule-prh');
// @ts-ignore
const ruleAlex = require('textlint-rule-alex').default || require('textlint-rule-alex');


export class RuleLoader {
  private static instance: RuleLoader;
  private rulesCache: Cache<TextlintRule[]>;
  private configCache: Cache<any>;
  private enableDebugLog: boolean = false;
  private errorHandler: ErrorHandler;

  private constructor() {
    this.rulesCache = new Cache<TextlintRule[]>(10 * 60 * 1000); // 10 minutes cache
    this.configCache = new Cache<any>(10 * 60 * 1000);
    this.errorHandler = ErrorHandler.getInstance();
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

    // ラベル付きで並列読み込み（エラー分類の取り違えを防止）
    const tasks: { label: string; promise: Promise<TextlintRule[]> }[] = [];
    if (settings.useTechnicalWritingPreset) tasks.push({ label: 'technical-writing', promise: this.loadTechnicalWritingPreset() });
    if (settings.useSpacingPreset) tasks.push({ label: 'spacing', promise: this.loadSpacingPreset() });
    if (settings.useCustomRules) tasks.push({ label: 'ai-writing', promise: this.loadAiWritingPreset() });
    if (settings.useJtfStylePreset) tasks.push({ label: 'jtf-style', promise: this.loadJtfStylePreset() });
    if (settings.useJapanesePreset) tasks.push({ label: 'japanese', promise: this.loadJapanesePreset() });
    tasks.push({ label: 'individual-rules', promise: this.loadIndividualRules(settings) });

    const results = await Promise.allSettled(tasks.map(t => t.promise));
    results.forEach((res, i) => {
      const label = tasks[i].label;
      if (res.status === 'fulfilled') {
        rules.push(...res.value);
      } else {
        const strategy = this.errorHandler.handleRuleLoadError(res.reason, label);
        const errorKey = `rule_loading_${label}_${Date.now()}`;
        this.errorHandler.executeRecovery(strategy, errorKey);
        this.errorHandler.notifyUser(strategy);
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
      const strategy = this.errorHandler.handleRuleLoadError(error, 'technical-writing-preset');
      this.errorHandler.notifyUser(strategy);
      const errorKey = `preset_technical_writing_${Date.now()}`;
      this.errorHandler.executeRecovery(strategy, errorKey);
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
      const strategy = this.errorHandler.handleRuleLoadError(error, 'spacing-preset');
      this.errorHandler.notifyUser(strategy);
      const errorKey = `preset_spacing_${Date.now()}`;
      this.errorHandler.executeRecovery(strategy, errorKey);
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
      const strategy = this.errorHandler.handleRuleLoadError(error, 'ai-writing-preset');
      this.errorHandler.notifyUser(strategy);
      const errorKey = `preset_ai_writing_${Date.now()}`;
      this.errorHandler.executeRecovery(strategy, errorKey);
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
      const strategy = this.errorHandler.handleRuleLoadError(error, 'jtf-style-preset');
      this.errorHandler.notifyUser(strategy);
      const errorKey = `preset_jtf_style_${Date.now()}`;
      this.errorHandler.executeRecovery(strategy, errorKey);
    }
    
    return rules;
  }

  private async loadJapanesePreset(): Promise<TextlintRule[]> {
    const rules: TextlintRule[] = [];
    
    try {
      const preset = presetJapanese;
      if (preset && preset.rules) {
        Object.entries(preset.rules).forEach(([ruleId, rule]) => {
          const actualRule = this.extractRuleFunction(rule);
          const ruleOptions = preset.rulesConfig?.[ruleId] === false ? false : 
            (typeof preset.rulesConfig?.[ruleId] === 'object' ? preset.rulesConfig[ruleId] : true);
          
          if (ruleOptions !== false && actualRule) {
            rules.push({
              ruleId: `japanese/${ruleId}`,
              rule: actualRule,
              options: ruleOptions
            });
          }
        });
      }
    } catch (error) {
      const strategy = this.errorHandler.handleRuleLoadError(error, 'japanese-preset');
      this.errorHandler.notifyUser(strategy);
      const errorKey = `preset_japanese_${Date.now()}`;
      this.errorHandler.executeRecovery(strategy, errorKey);
    }
    
    return rules;
  }

  private async loadIndividualRules(settings: TextlintPluginSettings): Promise<TextlintRule[]> {
    const rules: TextlintRule[] = [];
    
    // PRH設定ファイル（設定で選択されたパスを最優先）
    // Electron環境では絶対パス（prhYamlAbsPath）を優先し、無ければ従来の候補探索
    const currentDir = process.cwd();
    let prhConfigPath = '';
    if (settings.prhYamlAbsPath && typeof settings.prhYamlAbsPath === 'string') {
      if (!fs.existsSync(settings.prhYamlAbsPath)) {
        console.warn(`指定されたPRHファイルが見つかりません: ${settings.prhYamlAbsPath}`);
      } else {
        prhConfigPath = settings.prhYamlAbsPath;
      }
    }
    if (!prhConfigPath) {
      const pathCandidates = [
        path.join(currentDir, 'prh.yml'),
        path.join(currentDir, '..', '..', '..', 'plugins', 'obsidian-textlint-highlighter-plugin', 'prh.yml'),
        path.join(__dirname || currentDir, 'prh.yml'),
        path.join(__dirname || currentDir, '..', 'prh.yml'),
        path.join(__dirname || currentDir, '..', '..', 'prh.yml')
      ];
      for (const candidate of pathCandidates) {
        if (fs.existsSync(candidate)) {
          prhConfigPath = candidate;
          break;
        }
      }
    }
    
    if (this.enableDebugLog) {
      console.log(`Current directory: ${currentDir}`);
      if (settings.prhYamlAbsPath) console.log(`Settings PRH path: ${settings.prhYamlAbsPath}`);
      if (!prhConfigPath) {
        console.log(`PRH config not resolved by settings; falling back to path candidates.`);
      } else {
        console.log(`Found PRH config at: ${prhConfigPath}`);
      }
    }
    
    if (settings.usePrh && prhConfigPath === '') {
      console.warn('PRH設定ファイル(prh.yml)が見つかりませんでした。PRHルールは無効になります。');
    }
    
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
      },
      { 
        name: 'ja-hiraku',
        module: ruleJaHiraku,
        setting: settings.useJaHiraku,
        description: '漢字ひらく（総合）'
      },
      { 
        name: 'prh',
        module: rulePrh,
        setting: settings.usePrh && prhConfigPath !== '',
        description: '用語統一・禁止語句',
        options: {
          rulePaths: [prhConfigPath]
        }
      },
      { 
        name: 'alex',
        module: ruleAlex,
        setting: settings.useAlex,
        description: '英語包摂性チェック'
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
            options: ruleInfo.options || true
          });
          
          if (this.enableDebugLog) {
            console.log(`Successfully loaded ${ruleInfo.description} rule: ${ruleInfo.name}`);
          }
        }
      } catch (error) {
        const strategy = this.errorHandler.handleRuleLoadError(error, ruleInfo.name);
        this.errorHandler.notifyUser(strategy);
        const errorKey = `individual_rule_${ruleInfo.name}_${Date.now()}`;
        this.errorHandler.executeRecovery(strategy, errorKey);
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
      settings.useJapanesePreset ? 'ja' : '',
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
      settings.useDateWeekdayMismatch ? 'dateweekday' : '',
      settings.useJaHiraku ? 'hiraku' : '',
      settings.usePrh ? 'prh' : '',
      settings.useAlex ? 'alex' : ''
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

  /**
   * Get rule type name by task index for error reporting
   */
  private getRuleTypeByIndex(index: number): string {
    const ruleTypes = [
      'technical-writing',
      'spacing',
      'ai-writing',
      'jtf-style',
      'japanese',
      'individual-rules'
    ];
    
    return ruleTypes[index] || `unknown-${index}`;
  }
} 
