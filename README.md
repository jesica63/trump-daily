# 川普 Truth Social 每日摘要

這個專案目前以 Google Apps Script 為主，會每天抓取 Donald Trump 在 Truth Social 的最新貼文，整理成繁體中文摘要，並直接透過 GmailApp 寄送郵件。

目前主要流程如下：

1. 預設使用 CNN 的 `truth_archive.json` 備援來源
2. 視需要可選擇啟用 Truth Social 公開 API
3. 篩選近 24 小時貼文
4. 將文字貼文整理成英文重點與繁中摘要
5. 產生相容性較高的 HTML 郵件
6. 透過 Google Apps Script 直接寄出

## 專案檔案

- `trump_daily_digest.gs`
  目前正式使用的 Google Apps Script 版本，負責抓文、篩選、翻譯、組信、寄送與排程。

- `gmail_webhook.gs`
  舊版 Google Apps Script webhook，負責接收 Python 傳來的內容並透過 Gmail 寄信。

- `trump_dailydigest.py`
  舊版 Python 腳本，目前保留作為歷史備份與對照。

- `trump_daily_digest_prompt_v2.md`
  早期排程／提示稿備份，目前不是主要執行流程。

- `trump-truth-social-archive/`
  React 範例專案，主要作為資料來源與前端比對參考，不是目前正式寄信流程的一部分。

## 純 GAS 版本

目前正式建議使用：

- `trump_daily_digest.gs`

這個版本會直接在 Google Apps Script 裡完成：

1. 預設使用 CNN 備援資料
2. 篩選近 24 小時貼文
3. 產生中文摘要
4. 用 GmailApp 直接寄信
5. 用 Apps Script trigger 做每日排程

建議流程：

1. 在 Apps Script 建立新專案並貼上 `trump_daily_digest.gs`
2. 手動執行一次 `setupDefaults_()`
3. 到 `Project Settings > Script properties` 視需要修改收件者與時間
4. 手動執行一次 `testRunTrumpDailyDigest()`
5. 確認內容無誤後執行 `setupDailyTrigger()`

可調整的 Script Properties：

- `MAIL_TO`
- `CNN_ARCHIVE_URL`
- `TRUTH_SOCIAL_ACCOUNT_ID`
- `TRUTH_SOCIAL_API_URL`
- `USE_TRUTH_SOCIAL_PRIMARY`
- `REQUEST_TIMEOUT_MS`
- `RECENT_HOURS`
- `GMAIL_SENDER_NAME`
- `TRIGGER_HOUR`
- `TRIGGER_MINUTE_BUCKET`

這一版的優點是：

- 不需要 GitHub Secrets
- 不需要 GitHub Actions schedule
- 不需要額外 webhook
- 所有排程與寄信都在 Google 帳號內完成
- 預設直接使用 CNN 備援來源，避開 Truth Social 在 GAS 常見的 403 問題

限制則是：

- Apps Script 對長時間與大量 HTTP 請求的彈性比 Python 小
- `LanguageApp.translate()` 的翻譯品質與穩定性不一定和外部服務完全一致
- 若資料來源未來改版，仍然需要手動維護抓取邏輯

## 舊版 Python

以下內容保留作為舊版備份；GitHub Actions 排程已移除，不再是正式執行方式。

### 本機執行

需求：

- Python 3.9+

執行方式：

```bash
python3 trump_dailydigest.py
```

## 可設定環境變數

如果沒有設定，程式會使用內建預設值。

- `WEBHOOK_URL`
  Gmail webhook URL

- `MAIL_TO`
  收件者，多人可用逗號分隔

- `TRUTH_SOCIAL_ACCOUNT_ID`
  預設為 `107780257626128497`

- `TRUTH_SOCIAL_API_URL`
  若要覆蓋 Truth Social API URL 可自行指定

- `CNN_ARCHIVE_URL`
  CNN 備援來源 URL

- `REQUEST_TIMEOUT`
  HTTP timeout 秒數，預設 `30`

- `RECENT_HOURS`
  篩選近幾小時貼文，預設 `24`

- `TRANSLATE_ENABLED`
  是否啟用翻譯，預設 `1`

## 翻譯機制

目前中文摘要不是使用付費 LLM API。

程式使用 Google Translate 的公開翻譯端點進行英文轉繁中，因此目前：

- 不需要 API key
- 沒有額外付費設定
- 但不屬於正式商業版 API，穩定性不保證

若翻譯失敗，程式會退回簡單中文摘要，不會整體中斷。

## 舊版 Gmail webhook 說明

`gmail_webhook.gs` 需要部署為 Google Apps Script Web App。

建議設定：

- Execute as: `Me`
- Who has access: `Anyone`

每次修改 Apps Script 後，都要重新 `Deploy`，否則線上 webhook 不會更新。

## 已知限制

- Truth Social 的公開端點或資料格式未來可能變動
- Google Translate 公開端點不保證永遠可用
- Gmail 顯示特殊符號相容性不好，因此郵件已改為偏保守的純文字與 HTML 表格格式

## 建議維護方向

- 若之後要提高穩定性，可把翻譯改成正式 API 或自有服務
- 若要提高內容品質，可再加入真正的重點分析生成
- 若要擴展到更多人物或帳號，可把抓取設定抽成多帳號配置
