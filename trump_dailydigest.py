#!/usr/bin/env python3
"""
川普 Truth Social 每日摘要郵件 (終極優化安全版)
用法：python3 trump_dailydigest.py
需求：Python 3.9+，無需額外套件（僅用標準庫）
"""

import json
import os
import re
import sys
import base64
import html
import urllib.error
import urllib.parse
import urllib.request
import ssl
import time
import traceback
from datetime import datetime, timezone, timedelta
from html import unescape
from html.parser import HTMLParser
from zoneinfo import ZoneInfo

# ── 設定與環境變數防呆（最高資安標準） ──────────────────────────────────
# 1. 絕對不可妥協的機密變數（沒抓到直接報錯，不給預設值防洩漏）
WEBHOOK_URL = os.getenv("WEBHOOK_URL", "").strip()
if not WEBHOOK_URL:
    raise ValueError("❌ 嚴重錯誤：找不到 WEBHOOK_URL 環境變數，請檢查 GitHub Secrets！")

MAIL_TO = os.getenv("MAIL_TO", "").strip()
if not MAIL_TO:
    raise ValueError("❌ 嚴重錯誤：找不到 MAIL_TO 環境變數，請檢查 GitHub Secrets！")

# 2. 有預設值也無妨的公開 API / ID
ARCHIVE_URL = os.getenv("CNN_ARCHIVE_URL", "https://ix.cnn.io/data/truth-social/truth_archive.json").strip()
TRUTH_SOCIAL_ACCOUNT_ID = os.getenv("TRUTH_SOCIAL_ACCOUNT_ID", "107780257626128497").strip()
TRUTH_SOCIAL_API_URL = os.getenv(
    "TRUTH_SOCIAL_API_URL", 
    f"https://truthsocial.com/api/v1/accounts/{TRUTH_SOCIAL_ACCOUNT_ID}/statuses?exclude_replies=true"
).strip()

# 3. 數字與布林值轉換防呆
def getenv_int(name, default):
    val = os.getenv(name)
    if val:
        try:
            return int(val.strip())
        except ValueError:
            print(f"⚠️ 警告：環境變數 {name} 的值 '{val}' 無法轉換為整數，將使用預設值 {default}。")
    return default

REQUEST_TIMEOUT = getenv_int("REQUEST_TIMEOUT", 30)
RECENT_HOURS = getenv_int("RECENT_HOURS", 24)

# 只要是 "0", "false", "f", "no" 都視為關閉翻譯
_translate_env = os.getenv("TRANSLATE_ENABLED", "1").strip().lower()
TRANSLATE_ENABLED = _translate_env not in ("0", "false", "f", "no")

TAIPEI_TZ = ZoneInfo("Asia/Taipei")
# ─────────────────────────────────────────────────────────────────

WEEKDAYS = ["一","二","三","四","五","六","日"]

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
}

SSL_CONTEXT = None

class HTMLTextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)

    def handle_entityref(self, name):
        self.parts.append(f"&{name};")

    def handle_charref(self, name):
        self.parts.append(f"&#{name};")

def strip_html(text):
    parser = HTMLTextExtractor()
    parser.feed(text or "")
    parser.close()
    # 修正：使用 "" join，避免英文單字或標點間產生不必要的空格
    plain = unescape("".join(parser.parts))
    plain = re.sub(r"\s+", " ", plain)
    return plain.strip()

def parse_iso8601(ts):
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))

def to_taipei(ts):
    return parse_iso8601(ts).astimezone(TAIPEI_TZ)

def fmt_time(dt):
    return dt.strftime('%H:%M')

def fmt_date(dt):
    wd = WEEKDAYS[dt.weekday()]
    return dt.strftime(f'%Y/%m/%d（{wd}）')

def get_ssl_context():
    global SSL_CONTEXT
    if SSL_CONTEXT is not None:
        return SSL_CONTEXT

    cafile_candidates = []
    env_cafile = os.getenv("SSL_CERT_FILE")
    if env_cafile:
        cafile_candidates.append(env_cafile)

    try:
        import certifi
        cafile_candidates.append(certifi.where())
    except Exception:
        pass

    cafile_candidates.extend([
        "/etc/ssl/cert.pem",
        "/private/etc/ssl/cert.pem",
    ])

    for cafile in cafile_candidates:
        if cafile and os.path.exists(cafile):
            try:
                SSL_CONTEXT = ssl.create_default_context(cafile=cafile)
                print(f"使用 CA 憑證：{cafile}")
                return SSL_CONTEXT
            except Exception as e:
                print(f"CA 憑證載入失敗（{cafile}）：{type(e).__name__}: {e}")

    SSL_CONTEXT = ssl.create_default_context()
    print("使用 Python 預設 CA 憑證設定")
    return SSL_CONTEXT

def _make_request(url, extra_headers=None):
    """底層網路請求函數，集中處理 Timeout 與 Error"""
    headers = dict(DEFAULT_HEADERS)
    if extra_headers:
        headers.update(extra_headers)

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT, context=get_ssl_context()) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            body = response.read().decode(charset, "replace")
            return response.status, body
    except urllib.error.HTTPError as e:
        print(f"⚠️ HTTP 錯誤：{e.code} {e.reason} (URL: {url})")
        raise

def request_json(url, extra_headers=None):
    status, body = _make_request(url, extra_headers)
    try:
        return status, json.loads(body)
    except json.JSONDecodeError:
        print(f"⚠️ JSON 解析失敗！伺服器回傳了非 JSON 格式。前 200 個字元：\n{body[:200]}")
        raise

def request_text(url, extra_headers=None):
    status, body = _make_request(url, extra_headers)
    return body

def normalize_posts(data):
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("posts", "archive", "data"):
            value = data.get(key)
            if isinstance(value, list):
                return value
    return []

def fetch_posts_from_truth_social():
    print(f"正在抓取 Truth Social API：{TRUTH_SOCIAL_API_URL}")
    status, data = request_json(
        TRUTH_SOCIAL_API_URL,
        extra_headers={"Referer": "https://truthsocial.com/"},
    )
    posts = normalize_posts(data)
    print(f"Truth Social API 回應 {status}，共 {len(posts)} 筆")
    return posts, "truthsocial"

def fetch_posts_from_cnn():
    print(f"正在抓取 CNN 備援資料：{ARCHIVE_URL}")
    status, data = request_json(
        ARCHIVE_URL,
        extra_headers={"Referer": "https://www.cnn.com/"},
    )
    posts = normalize_posts(data)
    print(f"CNN 備援回應 {status}，共 {len(posts)} 筆")
    return posts, "cnn"

def fetch_posts():
    errors = []
    fetchers = [fetch_posts_from_truth_social, fetch_posts_from_cnn]

    for fetcher in fetchers:
        try:
            posts, source = fetcher()
            if posts:
                return posts, source
            errors.append(f"{fetcher.__name__}: empty result")
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as e:
            errors.append(f"{fetcher.__name__}: {type(e).__name__}: {e}")
            print(f"{fetcher.__name__} 失敗：{type(e).__name__}: {e}")

    raise RuntimeError("；".join(errors))

def filter_recent(posts, hours=24):
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    recent = []
    for p in posts:
        ts = p.get('created_at', '')
        try:
            dt = parse_iso8601(ts)
            if dt >= cutoff:
                content = strip_html(p.get('content', ''))
                tp_dt = to_taipei(ts)
                recent.append({
                    'ts': ts,
                    'dt_utc': dt,
                    'dt_tp': tp_dt,
                    'taipei': fmt_time(tp_dt),
                    'content': content,
                    'url': p.get('url', ''),
                    'fav': p.get('favourites_count', 0),
                    'rb': p.get('reblogs_count', 0),
                    'rep': p.get('replies_count', 0),
                    'is_text': len(content.strip()) > 0  # 修正：只要非空白即算文字貼文
                })
        except Exception as e:
            print(f"跳過一筆（解析失敗）：{e}")
            
    # 修正：以實際時間物件排序更精準
    recent.sort(key=lambda x: x['dt_utc'], reverse=True)
    return recent

def split_sentences(text):
    return [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if s.strip()]

def summarize_english(text, max_sentences=2, max_chars=300):
    sentences = split_sentences(text)
    summary = " ".join(sentences[:max_sentences]) if sentences else text[:max_chars]
    if len(summary) > max_chars:
        summary = summary[: max_chars - 3].rstrip() + "..."
    return summary

def fallback_chinese_summary(text):
    excerpt = summarize_english(text, max_sentences=1, max_chars=90)
    return f"此則貼文重點圍繞這段內容：{excerpt}"

def html_escape(text):
    return html.escape(text or "", quote=True)

def build_html_email(body):
    escaped = html_escape(body)
    
    # 將 URL 轉換為可點擊的超連結
    url_pattern = re.compile(r'(https?://[^\s<>]+)')
    escaped = url_pattern.sub(r'<a href="\1" target="_blank" style="color:#0056b3;">\1</a>', escaped)
    
    # 換行轉換為 <br>
    escaped = escaped.replace("\n", "<br>")
    
    return (
        "<html><body style='margin:0;padding:20px;background:#ffffff;"
        "font-family:Arial,\"PingFang TC\",\"Microsoft JhengHei\",sans-serif;"
        "color:#222;line-height:1.8;'>"
        f"<div style='max-width:720px;margin:0 auto;white-space:normal;'>{escaped}</div>"
        "</body></html>"
    )

def translate_to_zh_tw(text):
    if not text or not TRANSLATE_ENABLED:
        return None

    query = urllib.parse.urlencode(
        {
            "client": "gtx",
            "sl": "en",
            "tl": "zh-TW",
            "dt": "t",
            "q": text,
        }
    )
    url = f"https://translate.googleapis.com/translate_a/single?{query}"
    try:
        body = request_text(url, extra_headers={"Referer": "https://translate.google.com/"})
        data = json.loads(body)
        translated = "".join(part[0] for part in data[0] if part and part[0])
        translated = re.sub(r"\s+", " ", translated).strip()
        return translated or None
    except Exception as e:
        print(f"翻譯失敗，改用備援摘要：{type(e).__name__}: {e}")
        return None

def build_post_summaries(recent_posts):
    for post in recent_posts:
        english = summarize_english(post["content"])
        chinese = translate_to_zh_tw(english) or fallback_chinese_summary(post["content"])
        post["key_quote"] = english
        post["zh_summary"] = chinese
        
        # 加上短暫延遲，避免排程連續發送被 Google 封鎖 IP
        if TRANSLATE_ENABLED:
            time.sleep(0.5)

def build_email(recent):
    now_tp = datetime.now(TAIPEI_TZ)
    date_str = fmt_date(now_tp)

    subject = f"川普 Truth Social 每日摘要｜{date_str}"

    if not recent:
        body = f"主旨：{subject}\n\n過去 24 小時川普未在 Truth Social 發文。"
        html_body = build_html_email(body)
        return subject, body, html_body

    a_posts = [p for p in recent if p['is_text']]
    b_posts = [p for p in recent if not p['is_text']]
    build_post_summaries(a_posts)

    oldest = min(recent, key=lambda x: x['ts'])
    newest = max(recent, key=lambda x: x['ts'])
    period_start = fmt_time(oldest['dt_tp'])
    period_end = fmt_time(newest['dt_tp'])

    top = max(recent, key=lambda x: x['fav'] + x['rb'] + x['rep'])
    top_preview = top['content'][:30] + '...' if len(top['content']) > 30 else top['content'] or '（圖片/影片）'

    lines = []
    lines.append(f"主旨：{subject}")
    lines.append("")
    lines.append("==== 今日總覽 ====")
    lines.append("")
    lines.append(f"• 發文總數：{len(recent)} 則（有文字 {len(a_posts)} 則 / 純圖片影片 {len(b_posts)} 則）")
    lines.append(f"• 統計期間：{period_start} ~ {period_end}（台北時間）")
    lines.append(f"• 最高互動貼文：{top_preview}（喜愛 {top['fav']} / 轉發 {top['rb']} / 回覆 {top['rep']}）")
    lines.append("")
    lines.append("==== A類：有文字貼文（中英對照，由新到舊） ====")
    lines.append("")

    a_full = a_posts[:10]
    a_brief = a_posts[10:]

    for i, p in enumerate(a_full, 1):
        lines.append(f"【{i}】{p['taipei']}｜喜愛 {p['fav']}｜轉發 {p['rb']}｜回覆 {p['rep']}")
        lines.append("")
        lines.append("原文重點：")
        lines.append(p["key_quote"])
        lines.append("")
        lines.append("中文摘要：")
        lines.append(p["zh_summary"])
        lines.append("")
        if p['url']:
            lines.append(f"連結：{p['url']}")
        lines.append("")

    if a_brief:
        lines.append(f"── 其餘 {len(a_brief)} 則文字貼文（簡列）──")
        for p in a_brief:
            preview = p['content'][:60] + '...' if len(p['content']) > 60 else p['content']
            lines.append(f"• {p['taipei']}｜{preview}｜連結：{p['url']}")
        lines.append("")

    if b_posts:
        lines.append("==== B類：圖片或影片貼文（僅列連結） ====")
        lines.append("")
        for p in b_posts:
            lines.append(f"• {p['taipei']}｜喜愛 {p['fav']}｜轉發 {p['rb']}｜連結：{p['url']}")
        lines.append("")

    lines.append("==== 今日重點分析 ====")
    lines.append("")
    lines.append("（由遠見編輯部Jesica、Lisa發想，Claude協助生成）")
    lines.append("")

    body = '\n'.join(lines)
    html_body = build_html_email(body)
    return subject, body, html_body

def send_email(subject, body, html_body):
    print("   -> 正在打包 JSON 並發送 POST 請求...")
    payload = json.dumps({
        "to": MAIL_TO,
        "subject": subject,
        "body": body,
        "html_body": html_body,
        "subject_b64": base64.b64encode(subject.encode("utf-8")).decode("ascii"),
        "body_b64": base64.b64encode(body.encode("utf-8")).decode("ascii"),
        "html_body_b64": base64.b64encode(html_body.encode("utf-8")).decode("ascii"),
    }).encode("utf-8")
    
    req = urllib.request.Request(
        WEBHOOK_URL,
        data=payload,
        headers={"Content-Type": "application/json; charset=utf-8"}
    )
    
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT, context=get_ssl_context()) as r:
        result = r.read().decode()
        
    print(f"   -> Webhook 原始回應：{result[:150]}...")
    
    try:
        data = json.loads(result)
        if data.get("status") != "ok":
            raise RuntimeError(f"Webhook 回報錯誤：{data.get('message', result)}")
        return result
    except json.JSONDecodeError:
        raise RuntimeError(f"Webhook 回傳了非預期的格式 (GAS 異常)：\n{result[:500]}")

def main():
    print(f"[{datetime.now(TAIPEI_TZ).strftime('%Y-%m-%d %H:%M:%S')}] 🚀 開始執行川普每日摘要腳本...")
    
    # 1. 抓取資料
    print("\n>>> [階段 1/4] 開始抓取資料")
    try:
        posts, source = fetch_posts()
        print(f"✅ 成功獲取資料，來源：{source}")
    except Exception as e:
        print("\n❌ [階段 1 失敗] 抓取資料時發生嚴重錯誤！完整錯誤訊息如下：")
        traceback.print_exc()
        sys.exit(1)

    # 2. 過濾資料
    print(f"\n>>> [階段 2/4] 開始過濾近況與解析時間 (篩選近 {RECENT_HOURS} 小時)")
    try:
        recent = filter_recent(posts, hours=RECENT_HOURS)
        print(f"✅ 過濾完成，共 {len(recent)} 則貼文")
    except Exception as e:
        print("\n❌ [階段 2 失敗] 過濾資料時發生錯誤！完整錯誤訊息如下：")
        traceback.print_exc()
        sys.exit(1)

    # 3. 組合與翻譯信件
    print("\n>>> [階段 3/4] 開始產生摘要與建立郵件內容 (可能需要幾秒鐘進行翻譯)")
    try:
        subject, body, html_body = build_email(recent)
        print("✅ 郵件內容建立完成！")
        print(f"   郵件主旨：{subject}")
        print(f"   內文預覽：{body[:150].replace(chr(10), ' ')}...") 
    except Exception as e:
        print("\n❌ [階段 3 失敗] 組合郵件或翻譯時發生錯誤！完整錯誤訊息如下：")
        traceback.print_exc()
        sys.exit(1)

    # 4. 寄送郵件
    print("\n>>> [階段 4/4] 開始透過 Webhook 寄送郵件")
    try:
        send_email(subject, body, html_body)
        print(f"\n🎉 [{datetime.now(TAIPEI_TZ).strftime('%Y-%m-%d %H:%M:%S')}] 任務圓滿完成！")
    except Exception as e:
        print("\n❌ [階段 4 失敗] 寄送郵件時發生錯誤！完整錯誤訊息如下：")
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()
