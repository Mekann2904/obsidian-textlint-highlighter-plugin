# textlint 検査テスト（Kuromoji依存確認版）

## Kuromoji依存ルールの特別テスト

### no-double-negative-ja（二重否定）のテスト
これは間違いないとは言えなくもないです。
それが正しくないとも言えないことはないでしょう。
そんなことはないではない。

### ja-no-abusage（日本語誤用）のテスト  
彼は確信犯的にその行為を行った。
このシステムは汎用性がない。
全然問題ありません。

### max-comma（カンマ数制限）のテスト
この文では、カンマが、多すぎて、読みにくく、なっています。

### 文字エンコーディング系のテスト

#### no-nfd（UTF8-MAC濁点）
バガグゾダデゲ（合成済み文字）
バ゛カ゛ク゛ソ゛タ゛テ゛ケ゛（分解済み文字）

#### no-invalid-control-character（制御文字）
この文には制御文字が含まれています。

#### no-zero-width-spaces（ゼロ幅スペース）
この文に​は​ゼロ幅​ス​ペース​が​含まれています。

## 既存テスト（参考）

### preset-ja-technical-writing 機能テスト

### 1. sentence-length (1文の長さ)
これは非常に長い文章のテストです、このように一つの文章に多くの情報を詰め込んでしまうと読者にとって理解しにくくなってしまうため、適切な長さに区切って複数の文に分けることが重要になります、特に技術文書においては簡潔で分かりやすい表現を心がけることが求められています。

### 2. max-comma & max-ten (カンマ・読点制限)
この文では、カンマが、多すぎて、読みにくく、なっています。

### 3. max-kanji-continuous-len (連続漢字制限)
政治経済社会情勢分析という言葉は漢字が連続しすぎています。

### 4. arabic-kanji-numbers (数字表記統一)
１つ目のアプリケーションと2つ目のシステムを作成します。

### 5. no-mix-dearu-desumasu (文体統一)
この機能は便利です。しかし、実装が困難である。

### 6. ja-no-mixed-period (句点統一)
文末は句点で終わります:
別の行は句点で終わります。

### 7. no-double-negative-ja (二重否定)
この機能は使えなくないです。

### 8. no-dropping-the-ra (ら抜き言葉)
このファイルは見れます。食べれます。

### 9. no-doubled-conjunctive-particle-ga (「が」連続)
今日は早朝から出発したが、定刻には間に合わなかったが、無事到着した。

### 10. no-doubled-conjunction (接続詞重複)
しかし、この機能は便利です。しかし、設定が必要です。

### 11. no-doubled-joshi (助詞重複)
私は彼は好きです。

### 12. no-exclamation-question-mark (感嘆符・疑問符)
この機能は素晴らしい！本当に便利ですか？

### 13. no-hankaku-kana (半角カナ)
ﾌｧｲﾙを開いてください。

### 14. ja-no-weak-phrase (弱い表現)
これはうまく動くかもしれません。そう思います。

### 15. ja-no-successive-word (単語連続)
この機能機能は便利です。

### 16. ja-no-redundant-expression (冗長表現)
設定をすることができます。

### 17. ja-unnatural-alphabet (不自然な英字)
このファlルは重要です。

### 18. no-unmatched-pair (括弧不一致)
この設定（重要な項目は正しく動作します。

### 19. no-start-duplicated-conjunction (文頭接続詞重複)
しかし、これは問題です。
しかし、別の問題もあります。

### 20. prh (表記統一)
作業を行う際には注意が必要です。

## その他のプリセットテスト

### spacing preset
JavaScript の配列は便利です。
文字列間にスペースがありません。

### AI writing preset  
このような素晴らしい機能により、開発者はより効率的に作業を行うことが可能になります。さらに詳しく見ていきましょう。

### JTF style preset
半角文字と全角文字の混在をチェックします。 

## write-good（英語ライティング品質）テスト

### 受動態チェック
The code was written by the developer.
The bug was fixed by our team.
The system is being tested by the QA team.

### 冗長表現チェック
This is really very important.
It seems like this feature might be useful.
There are many errors that need to be fixed.

### 語彙選択チェック
This function is really awesome and super cool.
The implementation is quite difficult to understand.
The code quality is obviously bad.

### 副詞・修飾語チェック
This is extremely difficult and very complex.
It's obviously the best solution.
The performance is really quite good.

### "there is/are" チェック
There are several bugs in the code.
There is a problem with the implementation.
There are many ways to solve this issue.

## ja-no-orthographic-variants（日本語表記ゆれ）テスト

### 表記ゆれの例
組立作業と組み立て作業を行います。
設置、設備、設営の確認。
手続き、手続、手つづきを完了してください。

### 数字表記の統一
２つの要素と2つの項目。
10個と１０個を比較しました。
3番目と３番目を確認。

### カタカナ表記の統一
コンピューターとコンピュータを使用。
プリンターとプリンタで印刷。
ユーザーとユーザを管理。

### 漢字とひらがなの表記ゆれ
下さいと下さい。
有難うございますとありがとうございます。
良いとよい機能です。

## no-mix-dearu-desumasu（である調・ですます調混在）テスト

### 本文での混在
これは問題のある文章である。しかし、次の文はですます調です。
このような混在は読みにくくなります。統一した方が良いでしょう。

### 見出し間での混在は許可
以下は見出し間での混在テストです。

#### これはである調の見出しである
内容はですます調で書きます。

#### これはですます調の見出しです
内容はである調で書く。

### 箇条書きでの混在
- これは箇条書きの項目である
- この項目はですます調です
- 箇条書き内での混在は検出されます

## no-start-duplicated-conjunction（文頭接続詞重複）テスト

### 英語文頭接続詞の重複
But the implementation is complex. So we need to simplify it. But there are many constraints.

Therefore, we must consider all options. However, the deadline is approaching. Therefore, we need to act quickly.

### 短い間隔での重複
However, this is a good approach. But we have some limitations. However, the results are promising.

### 許可される間隔
But the system works well. After some investigation, we found the root cause. Therefore, we can proceed with confidence.

### リンクは除外対象
[import, file-a.js](file-a.js)
[import, file-b.js](file-b.js)

## date-weekday-mismatch（日付曜日不一致）テスト

### 英語形式の日付曜日不一致
2016-12-29(Friday) is incorrect.
2025-01-15(Monday) should be checked.
2024-02-29(Thursday) is wrong.

### 日本語形式の日付曜日不一致
2016年12月29日(金曜日)は間違いです。
2025年1月15日(月曜日)もチェックされます。
2024年2月29日(木曜日)は正しくありません。

### 正しい日付曜日（エラーなし）
2016-12-29(Thursday) is correct.
2025年1月15日(水曜日)は正しいです。

### 年省略の日付（useCurrentYearIfMissing設定時）
4月23日(月曜日)
12月25日(金曜日)