# 川普 Truth Social 每日摘要

這個專案會每天抓取 Donald Trump 在 Truth Social 的最新貼文，整理成繁體中文摘要，並透過 Gmail webhook 寄送郵件。

目前主要流程如下：

1. 優先抓取 Truth Social 公開 API
2. 若失敗，退回 CNN 的 `truth_archive.json` 備援來源
3. 篩選近 24 小時貼文
4. 將文字貼文整理成英文重點與繁中摘要
5. 產生相容性較高的 HTML 表格郵件
6. 透過 Google Apps Script webhook 寄出

## 專案檔案

- `trump_dailydigest.py`
  核心 Python 腳本，負責抓文、篩選、翻譯、組信、寄送。

- `gmail_webhook.gs`
  Google Apps Script webhook，負責接收 Python 傳來的內容並透過 Gmail 寄信。

- `.github/workflows/trump-daily-digest.yml`
  GitHub Actions 排程設定，會在台灣時間每天 09:07 自動執行。

- `trump_daily_digest_prompt_v2.md`
  早期排程／提示稿備份，目前不是主要執行流程。

- `trump-truth-social-archive/`
  React 範例專案，主要作為資料來源與前端比對參考，不是目前正式寄信流程的一部分。

## 本機執行

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

## Gmail webhook 說明

`gmail_webhook.gs` 需要部署為 Google Apps Script Web App。

建議設定：

- Execute as: `Me`
- Who has access: `Anyone`

每次修改 Apps Script 後，都要重新 `Deploy`，否則線上 webhook 不會更新。

## GitHub Actions 自動寄送

此專案已內建 GitHub Actions 排程：

- 每天台灣時間 `09:07`

對應 workflow：

- `.github/workflows/trump-daily-digest.yml`

GitHub repository 需要設定以下 Secrets：

- `WEBHOOK_URL`
- `MAIL_TO`
- `TRUTH_SOCIAL_ACCOUNT_ID`

建議值：

```text
TRUTH_SOCIAL_ACCOUNT_ID=107780257626128497
MAIL_TO=reddustblog@gmail.com,imlisaliao@gmail.com
```

GitHub Actions 可手動執行一次測試，再交由每日排程自動跑。

## 已知限制

- Truth Social 的公開端點或資料格式未來可能變動
- Google Translate 公開端點不保證永遠可用
- GitHub Actions `schedule` 在尖峰時段可能略有延遲
- Gmail 顯示特殊符號相容性不好，因此郵件已改為偏保守的純文字與 HTML 表格格式

## 建議維護方向

- 若之後要提高穩定性，可把翻譯改成正式 API 或自有服務
- 若要提高內容品質，可再加入真正的重點分析生成
- 若要擴展到更多人物或帳號，可把抓取設定抽成多帳號配置
