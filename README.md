# iStudio 学習支援・予約管理プロトタイプ

麗澤大学 iStudio の学習支援を検証する、独立した日本語 Web アプリです。Next.js / TypeScript / Tailwind CSS / Prisma / SQLite / Recharts を使用しています。既存の SimplyBook.me 等は変更・接続していません。画面の学生・TA・履歴・回答は架空のデモデータです。ヒアリング原文は初期データに追加していません。

専門科目の一致だけを必須にせず、対応可能・関連分野・未確認の 3 段階で案内します。関連分野は TA が対応可否を確認し、未確認 TA に自動割当しません。一般相談・教員への相談経路を残します。TA の順位づけは行いません。

## Windows での起動

必要環境: Node.js 24 以上、pnpm 11。SQLite のバックアップ・復元には Node.js 24 の `node:sqlite` を使用します。以下はアプリのフォルダーで PowerShell から実行します。PowerShell の実行ポリシーに影響されないよう `pnpm.cmd` と記載しています。

Node.js 24 を導入後、pnpm がなければ `npm.cmd install --global pnpm@11` で導入できます。`node --version` と `pnpm.cmd --version` で確認してください。

```powershell
Set-Location "C:\path\to\istudio"
Copy-Item .env.example .env
pnpm.cmd install --frozen-lockfile
pnpm.cmd db:generate
pnpm.cmd db:push
pnpm.cmd db:seed
pnpm.cmd dev
```

ブラウザーで <http://127.0.0.1:3000> を開いてください。`.env` の初期接続先は `DATABASE_URL="file:./dev.db"` で、ファイルは `prisma/dev.db` に作成されます。起動を止めるには端末で Ctrl+C。ポートを変更する場合は `pnpm.cmd dev --port 3002` を使用します。

ビルド済みの本番用起動方式を試す場合は、開発サーバーを停止して `pnpm.cmd build` → `pnpm.cmd start` を実行します。今回の最終画面確認はこの方式で実施しています。独立したローカル検証環境であり、大学の本番運用設定は別途必要です。

`db:seed` は架空データ用の初期登録です。登録済みのデモ環境では保存済みデータを保持し、公開枠を追加します。デモ専用スクリプトなので実データ環境で実行しないでください。大学承認前に実在学生の個人情報を入力しないでください。`start-demo.ps1` はこの起動準備とサーバー起動をまとめた補助スクリプトです。

## デモアカウント

共通パスワード: `Demo2026!`。メールはすべて予約済みのテスト用ドメイン `example.test` で、実在人物ではありません。

| 権限           | メール                                             | 件数 |
| -------------- | -------------------------------------------------- | ---- |
| 学生           | `student1@example.test` ～ `student5@example.test` | 5    |
| TA             | `ta1@example.test` ～ `ta5@example.test`           | 5    |
| 教員           | `teacher@example.test`                             | 1    |
| システム管理者 | `admin@example.test`                               | 1    |

## 機能と使い方

- 学生: TA 情報と空き枠検索、簡単/詳細予約、関連分野の対応確認依頼、一般/教員相談、予約変更・キャンセル、チェックイン、自身の学習履歴、任意の指導後アンケート。
- TA: 担当予約、5 秒間隔で自動更新する通知と確認状態、関連分野の対応可否確認、準備状態、指導開始/完了、学習カルテと引き継ぎ、自身の対応科目・在室状態。
- 教員: 予約状況、TA 情報の管理、閲覧許可がある学生の学習履歴。権限のないカルテは表示しません。
- 管理者: 受付・飛び込み、来室状態、科目/単元、アカウント有効状態、履歴閲覧許可、集計期間・データ区分を指定したグラフ、目標・導入前値、ヒアリング原文・引用許可・検証段階、集計 CSV 出力。
- セキュリティ: パスワードハッシュ、HttpOnly セッション、CSRF・Origin 検証、サーバー側権限制御、入力検証、枠競合対策、監査記録。
- 保守: 非公開フォルダーへの整合性検査付き SQLite バックアップと停止確認付き復元。

公開勤務枠は当日から 7 日後までの検証用デモです。実勤務シフト・休日の管理、QR 専用受付、学生証 IC、大学 SSO、外部メール/SMS、既存予約・出欠システム連携、自動定期バックアップ、PostgreSQL 本番移行、アカウント招待・パスワード再設定は未実装です。詳しくは [保守・引き継ぎ](docs/operations.md) を参照してください。

## 検証

```powershell
pnpm.cmd typecheck
pnpm.cmd build
```

統合テストは隔離した SQLite DB と別ポートを使用します。本体の `dev.db` を変更しません。

```powershell
# 端末 1。毎回破棄可能なテスト DB を使う。
$env:DATABASE_URL = 'file:./test.db'
$env:NEXT_DIST_DIR = '.next-test'
pnpm.cmd db:push
pnpm.cmd db:seed
pnpm.cmd dev --port 3001

# 端末 2。同じアプリフォルダーで実行。
$env:ISTUDIO_BASE_URL = 'http://127.0.0.1:3001'
$env:ISTUDIO_TEST_WRITE = 'isolated-demo'
pnpm.cmd test:integration
# 端末 1 のテストサーバーを Ctrl+C で止めた後、保守テストも実行可能。
node tests/maintenance.mjs
```

テストは予約・カルテ・アンケート・調査記録を実際に保存します。loopback URL、デモアカウント、DEMO データだけの環境を確認してから実行します。当日予約のテストには当日の空き枠が必要なため、09:00～16:30 の開室時間中に実行してください。繰り返して空き枠を消費した場合はサーバーを止め、`file:./test-YYYYMMDD-HHMM.db` のような新しいテスト DB に接続先を変えて `db:push` と `db:seed` から再実行します。保守テストは停止した `test.db` 固定です。

結果は [テスト結果](docs/test-results.md) と `tests/results.json` に実行時刻付きで保存します。テスト後は両端末を閉じるか、`Remove-Item Env:DATABASE_URL, Env:NEXT_DIST_DIR, Env:ISTUDIO_BASE_URL, Env:ISTUDIO_TEST_WRITE -ErrorAction SilentlyContinue` でテスト環境変数を解除してください。

## 設計・保守資料

| 資料                                                           | 内容                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| [データベース設計](docs/database.md)                           | テーブル、個人情報の分離、枠占有、履歴閲覧許可、移行注意点   |
| [実装範囲と未実装機能](docs/features.md)                       | 機能一覧、検証用の仮ルール、要ヒアリング、成果物対応         |
| [指標一覧](docs/metrics.md)                                    | 分子・分母、任意回答の限界、導入前値、目標値、要ヒアリング   |
| [保守・引き継ぎ](docs/operations.md)                           | 日常運用、バックアップ、復元、障害、既存システムへの切り戻し |
| [テスト結果](docs/test-results.md)                             | 実際に実行したテストと結果、検証範囲                         |
| [バックアップ・復元の実検証](docs/maintenance-test-results.md) | バックアップ・復元・拒否条件・seed 保持の実行結果            |
| [ブラウザー確認](docs/browser-tests.md)                        | 簡単・詳細予約、更新不要の通知、PC / モバイルの実観測        |

主なコード: `src/app` は画面と API、`src/components` は権限別 UI、`src/lib` は認証・検証・業務処理、`prisma/schema.prisma` は DB 定義、`scripts/seed.ts` は架空データ、`scripts/backup.mjs` と `restore.mjs` は保守、`tests/integration.mjs` は実 API 統合テストです。

満足度・予約成立率等の現状値・目標値は未確定です。導入前値がなければ「未取得」、実測データがなければ「未取得」と表示し、デモを実績として扱いません。現行方式の理由、キャンセル期限、閲覧範囲、データ保存期限は要ヒアリングです。本番環境での個人情報の取り扱いは大学の承認が必要です。
