import { App, PluginSettingTab, Setting } from 'obsidian';
import { TextlintPluginSettings } from '../types';

export class TextlintSettingTab extends PluginSettingTab {
  plugin: any;

  constructor(app: App, plugin: any) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    
    this.createHeader();
    this.createPresetSection();
    this.createRuleSection();
    this.createSystemSection();
  }

  private createHeader() {
    const { containerEl } = this;
    containerEl.createEl('h2', { text: 'Textlint 設定' });
    
    // 概要説明
    const descEl = containerEl.createEl('div', { 
      cls: 'textlint-settings-description',
      attr: { 
        style: 'margin-bottom: 30px; padding: 16px; background: var(--background-secondary); border-radius: 8px; border-left: 4px solid var(--background-modifier-border);' 
      }
    });
    descEl.createEl('p', { 
      text: 'Textlintを使用して日本語文章の品質を向上させるための設定です。',
      attr: { style: 'margin-bottom: 8px;' }
    });
    descEl.createEl('p', { 
      text: '推奨設定: 「textlint-rule-preset-ja-technical-writing」と「textlint-rule-preset-ja-spacing」を有効にしてください。',
      attr: { style: 'margin: 0; font-weight: 500;' }
    });
  }

  private createPresetSection() {
    const { containerEl } = this;
    
    // プリセットセクション
    this.createLargeSection(
      'プリセット設定',
      '複数のルールがセットになった推奨設定です。まずはこちらから選択してください。'
    );

    const presetContainer = containerEl.createEl('div', {
      attr: { style: 'background: var(--background-primary-alt); border-radius: 8px; padding: 20px; margin-bottom: 30px;' }
    });

    const presets = [
      {
        name: 'textlint-rule-preset-ja-technical-writing',
        desc: '文章の長さ、文体統一、冗長表現をチェック（推奨）',
        setting: 'useTechnicalWritingPreset',
        recommended: true
      },
      {
        name: 'textlint-rule-preset-ja-spacing',
        desc: '全角半角スペース、句読点の使い方をチェック（推奨）',
        setting: 'useSpacingPreset',
        recommended: true
      },
      {
        name: 'textlint-rule-preset-japanese',
        desc: '包括的な日本語向けルール集（文章品質・読みやすさの全般的改善）',
        setting: 'useJapanesePreset',
        recommended: true
      },
      {
        name: '@textlint-ja/textlint-rule-preset-ai-writing',
        desc: 'AI生成文章の不自然な表現をチェック',
        setting: 'useCustomRules',
        recommended: false
      },
      {
        name: 'textlint-rule-preset-jtf-style',
        desc: '翻訳品質向上のための専門的なスタイルチェック',
        setting: 'useJtfStylePreset',
        recommended: false
      }
    ];

    presets.forEach(preset => {
      const settingEl = new Setting(presetContainer)
        .setName(preset.name + (preset.recommended ? ' ★' : ''))
        .setDesc(preset.desc)
        .addToggle(toggle => toggle
          .setValue(this.plugin.settings[preset.setting as keyof TextlintPluginSettings] as boolean)
          .onChange(async (value) => {
            (this.plugin.settings as any)[preset.setting] = value;
            await this.plugin.saveSettings();
            this.showRestartNotice();
          }));

      // トグルボタンの位置調整
      const toggleWrapper = settingEl.settingEl.querySelector('.setting-item-control');
      if (toggleWrapper) {
        (toggleWrapper as HTMLElement).style.minWidth = '60px';
        (toggleWrapper as HTMLElement).style.display = 'flex';
        (toggleWrapper as HTMLElement).style.justifyContent = 'flex-end';
        (toggleWrapper as HTMLElement).style.alignItems = 'center';
      }
    });
  }

  private createRuleSection() {
    const { containerEl } = this;
    
    // 個別ルールセクション
    this.createLargeSection(
      '個別ルール設定',
      '特定の文章パターンを個別にチェックしたい場合に有効にしてください。'
    );

    const ruleContainer = containerEl.createEl('div', {
      attr: { style: 'background: var(--background-primary-alt); border-radius: 8px; padding: 20px; margin-bottom: 30px;' }
    });

    const rules = [
      {
        name: '@textlint-ja/textlint-rule-no-dropping-i',
        desc: '「見れる」→「見られる」など、正しい助動詞の使用をチェック',
        setting: 'useNoDroppingI'
      },
      {
        name: '@textlint-ja/textlint-rule-no-insert-dropping-sa',
        desc: '「食べれない」→「食べられない」など、正しい可能表現をチェック',
        setting: 'useNoInsertDroppingSa'
      },
      {
        name: 'textlint-rule-no-doubled-joshi',
        desc: '「材料不足で代替素材で」など、助詞の重複をチェック',
        setting: 'useNoDoubledJoshi'
      },
      {
        name: 'textlint-rule-no-mixed-zenkaku-and-hankaku-alphabet',
        desc: 'アルファベットの表記統一をチェック',
        setting: 'useNoMixedZenkakuHankakuAlphabet'
      },
      {
        name: 'textlint-rule-prefer-tari-tari',
        desc: '「歩いたり、走る」→「歩いたり、走ったり」など、並列表現をチェック',
        setting: 'usePreferTariTari'
      },
      {
        name: 'textlint-rule-write-good',
        desc: '英語文章の品質チェック（受動態、冗長表現、語彙選択など）',
        setting: 'useWriteGood'
      },
      {
        name: 'textlint-rule-ja-no-orthographic-variants',
        desc: '日本語表記ゆれチェック（「組立」「組み立て」など同じ意味の異なる表記）',
        setting: 'useJaNoOrthographicVariants'
      },
      {
        name: 'textlint-rule-no-mix-dearu-desumasu',
        desc: '敬体（ですます調）と常体（である調）の混在チェック',
        setting: 'useNoMixDearuDesumasu'
      },
      {
        name: 'textlint-rule-no-start-duplicated-conjunction',
        desc: '文頭接続詞の重複チェック（"However", "But"など短い間隔での重複）',
        setting: 'useNoStartDuplicatedConjunction'
      },
      {
        name: 'textlint-rule-date-weekday-mismatch',
        desc: '日付と曜日の不一致チェック（「2016-12-29(金曜日)」→「2016-12-29(木曜日)」など）',
        setting: 'useDateWeekdayMismatch'
      },
      {
        name: 'textlint-rule-ja-hiraku',
        desc: '漢字を「ひらく」総合ルール（形式名詞・副詞・補助動詞など包括的対応）',
        setting: 'useJaHiraku'
      },
      {
        name: 'textlint-rule-prh',
        desc: '用語統一・禁止語句チェック（カスタマイズ可能な表記ゆれ・不適切表現の検出）',
        setting: 'usePrh'
      },
      {
        name: 'textlint-rule-alex',
        desc: '英語包摂性チェック（差別的表現の検出・より適切な代替語句の提案）',
        setting: 'useAlex'
      }
    ];

    rules.forEach(rule => {
      const settingEl = new Setting(ruleContainer)
        .setName(rule.name)
        .setDesc(rule.desc)
        .addToggle(toggle => toggle
          .setValue(this.plugin.settings[rule.setting as keyof TextlintPluginSettings] as boolean)
          .onChange(async (value) => {
            (this.plugin.settings as any)[rule.setting] = value;
            await this.plugin.saveSettings();
            this.showRestartNotice();
          }));

      // トグルボタンの位置調整
      const toggleWrapper = settingEl.settingEl.querySelector('.setting-item-control');
      if (toggleWrapper) {
        (toggleWrapper as HTMLElement).style.minWidth = '60px';
        (toggleWrapper as HTMLElement).style.display = 'flex';
        (toggleWrapper as HTMLElement).style.justifyContent = 'flex-end';
        (toggleWrapper as HTMLElement).style.alignItems = 'center';
      }
    });
  }

  private createSystemSection() {
    const { containerEl } = this;
    
    // システム設定セクション
    this.createLargeSection(
      'システム設定',
      'パフォーマンスやデバッグに関する設定です。'
    );

    const systemContainer = containerEl.createEl('div', {
      attr: { style: 'background: var(--background-primary-alt); border-radius: 8px; padding: 20px; margin-bottom: 20px;' }
    });

    const systemSettingEl1 = new Setting(systemContainer)
      .setName('Kuromoji使用')
      .setDesc('日本語形態素解析エンジン（処理が重くなる場合は無効にしてください）')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.useKuromoji)
        .onChange(async (value) => {
          this.plugin.settings.useKuromoji = value;
          await this.plugin.saveSettings();
          this.showRestartNotice();
        }));

    const systemSettingEl2 = new Setting(systemContainer)
      .setName('デバッグログ')
      .setDesc('開発者向けの詳細情報を出力（トラブルシューティング用）')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableDebugLog)
        .onChange(async (value) => {
          this.plugin.settings.enableDebugLog = value;
          await this.plugin.saveSettings();
        }));

    // トグルボタンの位置調整
    [systemSettingEl1, systemSettingEl2].forEach(settingEl => {
      const toggleWrapper = settingEl.settingEl.querySelector('.setting-item-control');
      if (toggleWrapper) {
        (toggleWrapper as HTMLElement).style.minWidth = '60px';
        (toggleWrapper as HTMLElement).style.display = 'flex';
        (toggleWrapper as HTMLElement).style.justifyContent = 'flex-end';
        (toggleWrapper as HTMLElement).style.alignItems = 'center';
      }
    });

    // デバッグセクション（デバッグモード時のみ表示）
    if (this.plugin.settings.enableDebugLog) {
      this.createDebugSection(systemContainer);
    }
  }

  private createDebugSection(parentContainer: HTMLElement) {
    // セパレーター
    parentContainer.createEl('hr', { attr: { style: 'margin: 20px 0; border: none; border-top: 1px solid var(--background-modifier-border);' }});
    
    parentContainer.createEl('h4', { 
      text: 'デバッグ・メンテナンス',
      attr: { style: 'margin-bottom: 12px; color: var(--text-muted);' }
    });

    // キャッシュ統計
    const cacheStatsEl = parentContainer.createEl('div', { 
      cls: 'textlint-cache-stats',
      attr: { style: 'margin: 12px 0; padding: 12px; background: var(--background-secondary); border-radius: 4px;' }
    });
    
    this.updateCacheStats(cacheStatsEl);

    // キャッシュクリアボタン
    new Setting(parentContainer)
      .setName('キャッシュクリア')
      .setDesc('ルールキャッシュをクリアして強制的に再読み込みします')
      .addButton(button => button
        .setButtonText('キャッシュクリア')
        .onClick(async () => {
          this.plugin.clearCache();
          this.updateCacheStats(cacheStatsEl);
          button.setButtonText('クリア完了').setDisabled(true);
          setTimeout(() => {
            button.setButtonText('キャッシュクリア').setDisabled(false);
          }, 2000);
        }));
  }

  private updateCacheStats(container: HTMLElement) {
    container.empty();
    
    try {
      const stats = this.plugin.getCacheStats();
      container.createEl('strong', { text: 'キャッシュ統計' });
      container.createEl('br');
      container.createEl('span', { text: `ルール: ${stats.rules.size}個` });
      container.createEl('br');
      container.createEl('span', { text: `設定: ${stats.config.size}個` });
    } catch (error) {
      container.createEl('span', { text: 'キャッシュ統計の取得に失敗しました' });
    }
  }

  private createLargeSection(title: string, description: string) {
    const { containerEl } = this;
    
    const sectionEl = containerEl.createEl('div', {
      attr: { style: 'margin-bottom: 20px;' }
    });
    
    sectionEl.createEl('h3', { 
      text: title,
      attr: { 
        style: 'font-size: 1.3em; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 2px solid var(--background-modifier-border);' 
      }
    });

    sectionEl.createEl('p', { 
      text: description,
      attr: { style: 'margin-bottom: 16px; color: var(--text-muted); font-size: 0.95em; line-height: 1.5;' }
    });
  }

  private showRestartNotice() {
    // 設定変更時にキャッシュクリアを促す
    if (this.plugin.clearCache) {
      this.plugin.clearCache();
    }
  }
} 