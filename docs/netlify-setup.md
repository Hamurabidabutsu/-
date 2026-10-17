# Netlify Free + PayPal

Next.jsサイトをNetlify FreeとPayPalで運用するための配置手順。アカウント登録とAPI接続は別の手続きです。

## 課金なしで試す

1. Netlifyで **Add new project → Import an existing project → GitHub** を選ぶ。
2. `Hamurabidabutsu/-` を選ぶ。GitHubへのアクセスはこのリポジトリだけを許可すればよい。
3. ブランチは `codex/netlify-free`。Base directoryは空欄、Build commandは `npm run build`、Publish directoryは `.next`。Nodeは24。netlify.tomlに記載済み。
4. 環境変数を **Functionsで使えるスコープ** に設定：`STORAGE_BACKEND=netlify`、`APP_MODE=demo`、`PAYMENT_MODE=demo`、`MAIL_MODE=preview`。Buildsだけに限定しない。
5. Free（$0）を維持してデプロイする。公式の`@netlify/database`と`netlify/database/migrations/`で自動DB作成・マイグレーションを行う構成。DBが作られなければ **Data & Storage → Database → Create a database** を確認して再デプロイする。
6. 発行された `https://…netlify.app` を`SITE_URL`に設定し、再デプロイする。独自ドメイン購入は不要。
7. デモ表示を確認し、架空のデータだけで登録・申請・デモ支払い・管理者審査・会話・問い合わせを試す。デモでは誰でも管理者切替を使えるため、実在の身分証や医療情報を登録しない。

デモ用DBテーブル（demo_接頭辞）とBlobストアは本番用から分離。APP_MODEをliveへ切り替えても架空の管理者・申請は本番へ移らない。Deploy Previewやブランチ公開も必ずdemo設定とし、本番決済・SMTPの秘密情報を渡さない。

## 本番設定

`deploy/netlify.env.example`は空のひな形。実値はNetlifyの環境変数画面に入力し、Gitやチャットへ秘密値を貼らない。

- `STORAGE_BACKEND=netlify`、`APP_MODE=live`。DATA_DIRは使わない。
- `ADMIN_EMAIL`と12文字以上の固有の`ADMIN_PASSWORD`で、本番用管理者を初回作成。既存管理者のログインメールは環境変数だけでは変更しない。
- `SITE_URL`は公開URL。個人／法人、氏名／法人名、住所、電話、代表者、送信者、審査メール先は後で設定を変更できる。請求時開示の実体制も整える。
- Gmailは既存アカウントを維持できる。`MAIL_MODE=smtp`とSMTP設定が必要。Gmailでは2段階認証とアプリパスワードを使う。実送信・到達は外部検証する。
- PayPal DeveloperでまずSandboxのRESTアプリを作り、`PAYMENT_MODE=paypal`、`PAYPAL_ENVIRONMENT=sandbox`、`PAYPAL_CLIENT_ID`、`PAYPAL_CLIENT_SECRET`を設定。
- 同じRESTアプリでWebhook URLを `https://…netlify.app/api/payments/webhook` とし、`PAYMENT.CAPTURE.COMPLETED`を購読。Webhook IDを`PAYPAL_WEBHOOK_ID`へ設定。
- Sandboxで支払い・サイトへの復帰・Webhook・審査通知・重複通知を確認。その後LiveのアプリとWebhookの値へ差し替え、`PAYPAL_ENVIRONMENT=live`にする。当該事業の受入可否確認は技術的な疎通確認とは別に残る。

## 保存と定期処理

- 会員・申請・会話・問い合わせ・メール待ち行列はPostgreSQL。更新はトランザクションで扱う。
- 書類・写真・会話画像は非公開Netlify Blobs。直接URLで公開せず、認証APIで権限確認して返す。取り消し・削除を反映するstrong consistencyを使用。
- ファイルは各3MB以内。アップロード途中の障害で残ったファイルも、DBに事前登録した削除予約から1時間以上の猶予後に削除する。保存確定と削除予約解除は同じDBトランザクション。
- maintenance Scheduled Functionは毎時。最初にBlobsの処理時刻を読み、仕事がなければDBへ接続しない。毎分DBを起こす常駐タイマーは使わない。
- 自動承認は入金確認から30日経過後の定期処理で行うため、通常は最大約1時間のずれがある。無料枠停止や障害中は遅延する。1回の件数を制限し、残りは次回へ残す。
- メールはHTTP応答前に送信を待ち、失敗分は再送する。同時実行はDBリースで抑制。SMTP送信直後にプロセスが停止した場合の再送重複は起こり得る。
- サイト上の退会・審査終了時にレコードと対象Blobを削除する。ホストのバックアップの即時消去ではない。NetlifyのDBバックアップ保持条件（Free料金表では7日）を運用・公開方針へ反映する。独自の自動バックアップは追加しない。

## 費用と検証

Freeは月300 creditsのハード上限で自動追加購入なし。上限到達時は停止する。DB稼働・画像保存・転送等も枠を消費するので、1か月の連続稼働は保証しない。PayPalの決済手数料はホスティング費と別。

ローカルではNext.jsの本番ビルド、既存SQLite経路とPostgreSQL経路の全業務シナリオ、公式ローカルBlobサーバー、PayPal署名API応答を模擬したWebhook検証を行う。PostgreSQL検証はPGliteを使用。BlobローカルサーバーがGETへETagを付けないSDK制限は、テスト内だけで同サーバーのETagを補い、実際の条件付きPUTを検証する。

実Netlifyのデプロイ、実PayPal Sandbox／Live、外部SMTP到達は各アカウント接続後に確認する。

## 公式資料

- [DB開始手順](https://docs.netlify.com/build/data-and-storage/netlify-database/getting-started/)
- [マイグレーション](https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/)
- [Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/)
- [Scheduled Functions](https://docs.netlify.com/build/functions/scheduled-functions/)
- [Freeの課金条件](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/)
- [PayPal Webhook](https://developer.paypal.com/api/webhooks/v1)
