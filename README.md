# Obsidian Textlint Highlighter Plugin

Obsidianで動作するtextlintプラグインです。リアルタイムで文章を校正し、問題箇所をエディタ上でハイライト表示します。

## 機能

### 主要機能
- **リアルタイムハイライト**: エディタ上で問題箇所を即座にハイライト表示
- **問題一覧表示**: 右サイドバーに検出結果を一覧表示
- **ジャンプ機能**: 問題箇所をクリックで該当行にジャンプ
- **自動チェック**: ファイル切り替え・編集時の自動実行
- **設定画面**: 各プリセットの個別ON/OFF設定
- **CodeMirror 6対応**: 最新のObsidianエディタに完全対応

### 対応ルールセット

| プリセット | 内容 | 対応状況 |
|-----------|------|----------|
| **textlint-rule-preset-ja-technical-writing** | 文の長さ、文体統一、表記統一など | 対応済み |
| **textlint-rule-preset-ja-spacing** | 全角・半角スペース、句読点の統一 | 対応済み |
| **textlint-rule-preset-jtf-style** | 日本翻訳連盟の品質基準に基づく校正 | 対応済み |
| **@textlint-ja/textlint-rule-preset-ai-writing** | AI生成文章特有の不自然な表現を検出 | 対応済み |

### 検出可能な問題

#### textlint-rule-preset-ja-technical-writing
- 一文の長さ制限
- 漢数字と算用数字の混在チェック
- 感嘆符・疑問符の使用チェック
- 文体統一（ですます調・である調）
- 冗長表現の検出
- 不適切な助詞の使用

#### textlint-rule-preset-ja-spacing  
- 全角・半角文字間のスペース調整
- 英数字前後のスペース統一
- 句読点の統一

#### textlint-rule-preset-jtf-style
- 日本翻訳連盟の品質基準チェック
- ひらがな・カタカナの適切な使い分け
- 語句の統一性チェック
- 翻訳品質の向上

#### @textlint-ja/textlint-rule-preset-ai-writing
- AI特有の冗長表現の検出
- 不自然な接続詞の使用
- 決まり文句の検出

## インストール

### 手動インストール

1. [リリースページ](https://github.com/your-username/obsidian-textlint-highlighter-plugin/releases)から最新版をダウンロード
2. `main.js`、`manifest.json`、`styles.css`を `.obsidian/plugins/obsidian-textlint-highlighter-plugin/` フォルダに配置
3. Obsidianの設定 > コミュニティプラグインでプラグインを有効化

### 開発版インストール

```bash
cd .obsidian/plugins
git clone https://github.com/your-username/obsidian-textlint-highlighter-plugin.git
cd obsidian-textlint-highlighter-plugin
npm install
npm run build
```

## 使用方法

1. **自動チェック**: Markdownファイルを開くと自動的にチェックが開始されます
2. **ハイライト表示**: 問題箇所が黄色でハイライトされます
3. **詳細確認**: ハイライト部分にマウスを重ねると詳細が表示されます
4. **問題一覧**: 右サイドバーの「Textlint Issues」パネルで全問題を確認できます
5. **ジャンプ機能**: 問題一覧の項目をクリックすると該当箇所にジャンプします

## 設定

設定画面（設定 > コミュニティプラグイン > Textlint Highlighter > 設定）で以下を調整できます：

### プリセット設定
- **textlint-rule-preset-ja-technical-writing**: 技術的な文書のスタイルチェック
- **textlint-rule-preset-ja-spacing**: 記号・スペースの使い方
- **textlint-rule-preset-jtf-style**: 日本翻訳連盟の品質基準に基づく校正
- **@textlint-ja/textlint-rule-preset-ai-writing**: AI生成文章特有の問題の検出

### 個別ルール設定
各ルールを個別にON/OFFできます：

- **@textlint-ja/textlint-rule-no-dropping-i**: 「見てる」→「見ている」の修正提案
- **@textlint-ja/textlint-rule-no-insert-dropping-sa**: 「食べれない」→「食べられない」の修正提案
- **textlint-rule-no-doubled-joshi**: 「材料不足で代替素材で」の重複助詞チェック
- **textlint-rule-no-mixed-zenkaku-and-hankaku-alphabet**: アルファベットの表記統一チェック
- **textlint-rule-prefer-tari-tari**: 並立助詞「たり」の適切な使用チェック

### システム設定
- **Kuromoji使用**: 日本語形態素解析エンジンの利用（高度な解析）
- **デバッグログ**: 開発者向けの詳細ログ出力

## 技術仕様

- **フレームワーク**: Obsidian Plugin API
- **エディタ拡張**: CodeMirror 6 Decoration API
- **校正エンジン**: textlint kernel
- **言語**: TypeScript
- **ライセンス**: MIT

### 使用ライブラリ

- `@textlint/kernel`: textlintのコアエンジン
- `@textlint/textlint-plugin-markdown`: Markdownサポート
- `textlint-rule-preset-ja-technical-writing`: 技術文書向けルール
- `textlint-rule-preset-ja-spacing`: スペース・句読点ルール
- `textlint-rule-preset-jtf-style`: JTFスタイルガイドルール
- `@textlint-ja/textlint-rule-preset-ai-writing`: AI文章向けルール
- `kuromoji`: 日本語形態素解析エンジン

## パフォーマンス

- **チェック間隔**: 200msのデバウンス処理
- **適応的処理**: ファイルサイズに応じた自動最適化
- **キャッシュ**: SHA-256ベースの高度なキャッシュシステム
- **差分処理**: 変更部分のみを効率的に処理
- **品質重視**: Kuromojiを常時使用して日本語校正の精度を維持

## トラブルシューティング

### ハイライトが表示されない場合
1. プラグインが有効化されているか確認
2. 対象ファイルがMarkdown（.md）形式か確認
3. デバッグログを有効化してコンソールでエラーを確認

### パフォーマンスが遅い場合
1. 大きなファイル（1000行以上）では自動的にチャンク処理が適用されます
2. Kuromojiが常時有効のため、日本語校正の品質を保ちながら最適化されています
3. デバッグログを有効化してパフォーマンス統計を確認してください
4. 不要なプリセットを無効化してください
5. **注意**: Kuromojiは日本語校正の品質維持のため、無効化は推奨されません

## 開発者向け

### ビルド
```bash
npm install
npm run build
```

### 開発モード
```bash
npm run dev
```

### デバッグ
設定でデバッグログを有効化すると、詳細な情報がコンソールに出力されます。

## ライセンス

MIT License

### 依存関係のライセンス

このプラグインは以下のライセンスの依存関係を含みます：
- MIT: 主要な依存関係
- ISC: 一部のユーティリティ
- BSD-2-Clause, BSD-3-Clause: 一部のライブラリ
- Apache-2.0: 一部のライブラリ
- Python-2.0: argparse（js-yaml経由）
- CC-BY-3.0: spdx-exceptions（ライセンス検証ツール経由）

商用利用・再配布には問題ありませんが、企業環境での使用時は組織のライセンスポリシーをご確認ください。

## 貢献

バグレポート、機能リクエスト、プルリクエストを歓迎します。

## 更新履歴

### v1.0.0
- 初回リリース
- CodeMirror 6対応のハイライト機能
- 3つのプリセット対応
- リアルタイムチェック機能
