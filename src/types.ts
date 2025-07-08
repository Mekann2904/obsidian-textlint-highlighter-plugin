export interface TextlintPluginSettings {
  useTechnicalWritingPreset: boolean;
  useSpacingPreset: boolean;
  useJtfStylePreset: boolean;
  useCustomRules: boolean;
  enableDebugLog: boolean;
  useKuromoji: boolean;
  // 個別ルール設定
  useNoDroppingI: boolean;
  useNoInsertDroppingSa: boolean;
  useNoDoubledJoshi: boolean;
  useNoMixedZenkakuHankakuAlphabet: boolean;
  usePreferTariTari: boolean;
}

export const DEFAULT_SETTINGS: TextlintPluginSettings = {
  useTechnicalWritingPreset: true,
  useSpacingPreset: true,
  useJtfStylePreset: true,
  useCustomRules: true,
  enableDebugLog: true,
  useKuromoji: true,
  useNoDroppingI: true,
  useNoInsertDroppingSa: true,
  useNoDoubledJoshi: true,
  useNoMixedZenkakuHankakuAlphabet: true,
  usePreferTariTari: true
};

export interface TextlintMessage {
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

export interface TextlintKernelMessage {
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

export interface TextlintRule {
  ruleId: string;
  rule: any;
  options: any;
}

export interface RuleConfig {
  name: string;
  module: any;
  setting: boolean;
  description: string;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  hash?: string;
}

export const VIEW_TYPE_TEXTLINT = "textlint-view"; 