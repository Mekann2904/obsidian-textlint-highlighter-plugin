export interface TextlintPluginSettings {
  // デバウンス時間(ms): 入力時の連続実行を抑制
  debounceMs: number;
  // 解析対象の最大ファイルサイズ(KB)
  maxFileSizeKB: number;
  // 自動解析の有効/無効（リボンおよび設定から切り替え）
  enableAutoLint: boolean;
  // ステータスバー表示
  showStatusBar: boolean;
  useTechnicalWritingPreset: boolean;
  useSpacingPreset: boolean;
  useJtfStylePreset: boolean;
  useJapanesePreset: boolean;
  useCustomRules: boolean;
  enableDebugLog: boolean;
  useKuromoji: boolean;
  // PRH設定ファイル（Vault内パス/絶対パス）
  prhYamlPath?: string;
  prhYamlAbsPath?: string;
  // 個別ルール設定
  useNoDroppingI: boolean;
  useNoInsertDroppingSa: boolean;
  useNoDoubledJoshi: boolean;
  useNoMixedZenkakuHankakuAlphabet: boolean;
  usePreferTariTari: boolean;
  useWriteGood: boolean;
  useJaNoOrthographicVariants: boolean;
  useNoMixDearuDesumasu: boolean;
  useNoStartDuplicatedConjunction: boolean;
  useDateWeekdayMismatch: boolean;
  useJaHiraku: boolean;
  usePrh: boolean;
  useAlex: boolean;
}

export const DEFAULT_SETTINGS: TextlintPluginSettings = {
  debounceMs: 600,
  maxFileSizeKB: 512,
  enableAutoLint: true,
  showStatusBar: true,
  useTechnicalWritingPreset: true,
  useSpacingPreset: true,
  useJtfStylePreset: true,
  useJapanesePreset: true,
  useCustomRules: true,
  enableDebugLog: true,
  useKuromoji: true,
  prhYamlPath: '',
  prhYamlAbsPath: '',
  useNoDroppingI: true,
  useNoInsertDroppingSa: true,
  useNoDoubledJoshi: true,
  useNoMixedZenkakuHankakuAlphabet: true,
  usePreferTariTari: true,
  useWriteGood: true,
  useJaNoOrthographicVariants: true,
  useNoMixDearuDesumasu: true,
  useNoStartDuplicatedConjunction: true,
  useDateWeekdayMismatch: true,
  useJaHiraku: true,
  usePrh: true,
  useAlex: true
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
  options?: any;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  hash?: string;
}

export const VIEW_TYPE_TEXTLINT = "textlint-view"; 
