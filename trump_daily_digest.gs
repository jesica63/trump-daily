/**
 * Trump Truth Social Daily Digest - Google Apps Script only version
 *
 * 功能：
 * 1. 預設直接抓取 CNN archive，可選擇啟用 Truth Social API
 * 2. 篩選近 24 小時貼文
 * 3. 產出繁中摘要與郵件內容
 * 4. 直接透過 GmailApp 寄信
 * 5. 可用 Apps Script Trigger 定期執行
 *
 * 使用方式：
 * - 將本檔貼到 Apps Script 專案
 * - 先執行一次 setupDefaults_()
 * - 視需要修改 Script Properties
 * - 執行一次 setupDailyTrigger() 建立每日排程
 */

var DIGEST_DEFAULTS = {
  MAIL_TO: "reddustblog@gmail.com,imlisaliao@gmail.com,buffycat@gmail.com",
  CNN_ARCHIVE_URL: "https://ix.cnn.io/data/truth-social/truth_archive.json",
  TRUTH_SOCIAL_ACCOUNT_ID: "107780257626128497",
  USE_TRUTH_SOCIAL_PRIMARY: "0",
  REQUEST_TIMEOUT_MS: "30000",
  RECENT_HOURS: "24",
  GMAIL_SENDER_NAME: "Trump Truth Social Daily Digest",
  TRIGGER_HOUR: "13",
  TRIGGER_MINUTE_BUCKET: "7"
};

var TAIPEI_TIMEZONE = "Asia/Taipei";
var WEEKDAYS_ZH = ["日", "一", "二", "三", "四", "五", "六"];

function runTrumpDailyDigest() {
  var config = getConfig_();
  var result = fetchPosts_(config);
  var recent = filterRecentPosts_(result.posts, Number(config.RECENT_HOURS));
  Logger.log("近 " + config.RECENT_HOURS + " 小時共 " + recent.length + " 則貼文（來源：" + result.source + "）");

  var email = buildEmail_(recent, config);
  GmailApp.sendEmail(config.MAIL_TO, email.subject, email.body, {
    name: config.GMAIL_SENDER_NAME,
    htmlBody: email.htmlBody
  });
  Logger.log("寄送完成：" + config.MAIL_TO);
}

function setupDefaults_() {
  PropertiesService.getScriptProperties().setProperties(DIGEST_DEFAULTS, false);
  Logger.log("預設 Script Properties 已寫入");
}

function setupDailyTrigger() {
  deleteDigestTriggers();

  var config = getConfig_();
  ScriptApp.newTrigger("runTrumpDailyDigest")
    .timeBased()
    .everyDays(1)
    .inTimezone(TAIPEI_TIMEZONE)
    .atHour(Number(config.TRIGGER_HOUR))
    .nearMinute(Number(config.TRIGGER_MINUTE_BUCKET))
    .create();

  Logger.log("每日排程已建立：台北時間約 " + config.TRIGGER_HOUR + ":" + pad2_(Number(config.TRIGGER_MINUTE_BUCKET)));
}

function deleteDigestTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "runTrumpDailyDigest") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  Logger.log("既有 digest triggers 已清除");
}

function testRunTrumpDailyDigest() {
  runTrumpDailyDigest();
}

function getConfig_() {
  var props = PropertiesService.getScriptProperties();
  var accountId = getPropertyOrDefault_(props, "TRUTH_SOCIAL_ACCOUNT_ID");
  return {
    MAIL_TO: getPropertyOrDefault_(props, "MAIL_TO"),
    CNN_ARCHIVE_URL: getPropertyOrDefault_(props, "CNN_ARCHIVE_URL"),
    TRUTH_SOCIAL_ACCOUNT_ID: accountId,
    TRUTH_SOCIAL_API_URL: getPropertyOrDefault_(
      props,
      "TRUTH_SOCIAL_API_URL",
      "https://truthsocial.com/api/v1/accounts/" + accountId + "/statuses?exclude_replies=true"
    ),
    USE_TRUTH_SOCIAL_PRIMARY: getPropertyOrDefault_(props, "USE_TRUTH_SOCIAL_PRIMARY"),
    REQUEST_TIMEOUT_MS: getPropertyOrDefault_(props, "REQUEST_TIMEOUT_MS"),
    RECENT_HOURS: getPropertyOrDefault_(props, "RECENT_HOURS"),
    GMAIL_SENDER_NAME: getPropertyOrDefault_(props, "GMAIL_SENDER_NAME"),
    TRIGGER_HOUR: getPropertyOrDefault_(props, "TRIGGER_HOUR"),
    TRIGGER_MINUTE_BUCKET: getPropertyOrDefault_(props, "TRIGGER_MINUTE_BUCKET")
  };
}

function getPropertyOrDefault_(props, key, fallback) {
  var value = props.getProperty(key);
  if (value !== null && String(value).trim() !== "") {
    return String(value).trim();
  }
  if (fallback !== undefined) {
    return fallback;
  }
  return DIGEST_DEFAULTS[key];
}

function fetchPosts_(config) {
  var errors = [];
  var useTruthSocial = String(config.USE_TRUTH_SOCIAL_PRIMARY) === "1";

  if (useTruthSocial) {
    try {
      Logger.log("正在抓取 Truth Social API：" + config.TRUTH_SOCIAL_API_URL);
      var truthPosts = requestJson_(config.TRUTH_SOCIAL_API_URL, {
        referer: "https://truthsocial.com/"
      });
      if (truthPosts.length > 0) {
        return { posts: truthPosts, source: "truthsocial" };
      }
      errors.push("truthsocial: empty result");
    } catch (err1) {
      errors.push("truthsocial: " + err1);
      Logger.log("Truth Social 抓取失敗：" + err1);
    }
  } else {
    Logger.log("已略過 Truth Social 直抓，直接使用 CNN 備援來源");
  }

  try {
    Logger.log("正在抓取 CNN 備援資料：" + config.CNN_ARCHIVE_URL);
    var cnnPosts = requestJson_(config.CNN_ARCHIVE_URL, {
      referer: "https://www.cnn.com/"
    });
    if (cnnPosts.length > 0) {
      return { posts: cnnPosts, source: "cnn" };
    }
    errors.push("cnn: empty result");
  } catch (err2) {
    errors.push("cnn: " + err2);
    Logger.log("CNN 抓取失敗：" + err2);
  }

  throw new Error("抓取失敗：" + errors.join("；"));
}

function requestJson_(url, options) {
  options = options || {};
  var response = UrlFetchApp.fetch(url, {
    method: "get",
    muteHttpExceptions: true,
    followRedirects: true,
    validateHttpsCertificates: true,
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; GAS Trump Digest)",
      "Accept": "application/json, text/plain, */*",
      "Referer": options.referer || "https://www.cnn.com/"
    },
    escaping: false
  });

  var code = response.getResponseCode();
  var text = response.getContentText("UTF-8");
  if (code < 200 || code >= 300) {
    throw new Error("HTTP " + code + ": " + trimText_(text, 200));
  }

  var data = JSON.parse(text);
  return normalizePosts_(data);
}

function normalizePosts_(data) {
  if (Object.prototype.toString.call(data) === "[object Array]") {
    return data;
  }
  if (data && typeof data === "object") {
    if (Object.prototype.toString.call(data.posts) === "[object Array]") return data.posts;
    if (Object.prototype.toString.call(data.archive) === "[object Array]") return data.archive;
    if (Object.prototype.toString.call(data.data) === "[object Array]") return data.data;
  }
  return [];
}

function filterRecentPosts_(posts, hours) {
  var cutoffMs = Date.now() - hours * 60 * 60 * 1000;
  var recent = [];

  for (var i = 0; i < posts.length; i++) {
    var post = posts[i];
    try {
      var createdAt = post.created_at || "";
      var utcDate = new Date(createdAt);
      if (isNaN(utcDate.getTime()) || utcDate.getTime() < cutoffMs) {
        continue;
      }

      var content = stripHtml_(post.content || "");
      var taipeiDate = toTaipeiDate_(utcDate);
      recent.push({
        ts: utcDate.getTime(),
        dtUtc: utcDate,
        dtTaipei: taipeiDate,
        taipeiTime: Utilities.formatDate(taipeiDate, TAIPEI_TIMEZONE, "HH:mm"),
        content: content,
        url: post.url || "",
        fav: Number(post.favourites_count || 0),
        rb: Number(post.reblogs_count || 0),
        rep: Number(post.replies_count || 0),
        isText: content.length > 10
      });
    } catch (err) {
      Logger.log("跳過一筆貼文：" + err);
    }
  }

  recent.sort(function(a, b) { return b.ts - a.ts; });
  return recent;
}

function buildEmail_(recent, config) {
  var now = new Date();
  var subject = "川普 Truth Social 每日摘要｜" + formatTaipeiDate_(now);

  if (!recent.length) {
    var emptyBody = "主旨：" + subject + "\n\n過去 " + config.RECENT_HOURS + " 小時川普未在 Truth Social 發文。";
    return {
      subject: subject,
      body: emptyBody,
      htmlBody: formatPlainTextHtml_(emptyBody)
    };
  }

  var textPosts = [];
  var mediaPosts = [];
  for (var i = 0; i < recent.length; i++) {
    if (recent[i].isText) {
      enrichPostSummary_(recent[i]);
      textPosts.push(recent[i]);
    } else {
      mediaPosts.push(recent[i]);
    }
  }

  var oldest = recent[recent.length - 1];
  var newest = recent[0];
  var top = recent.slice().sort(function(a, b) {
    return (b.fav + b.rb + b.rep) - (a.fav + a.rb + a.rep);
  })[0];

  var lines = [];
  lines.push("主旨：" + subject);
  lines.push("");
  lines.push("==== 今日總覽 ====");
  lines.push("");
  lines.push("• 發文總數：" + recent.length + " 則（有文字 " + textPosts.length + " 則 / 純圖片影片 " + mediaPosts.length + " 則）");
  lines.push("• 統計期間：" + oldest.taipeiTime + " ~ " + newest.taipeiTime + "（台北時間）");
  lines.push("• 最高互動貼文：" + topPreview_(top) + "（喜愛 " + top.fav + " / 轉發 " + top.rb + " / 回覆 " + top.rep + "）");
  lines.push("");
  lines.push("==== A類：有文字貼文（中英對照，由新到舊） ====");
  lines.push("");

  var aFull = textPosts.slice(0, 10);
  var aBrief = textPosts.slice(10);
  for (var j = 0; j < aFull.length; j++) {
    var post = aFull[j];
    lines.push("【" + (j + 1) + "】" + post.taipeiTime + "｜喜愛 " + post.fav + "｜轉發 " + post.rb + "｜回覆 " + post.rep);
    lines.push("");
    lines.push("原文重點：");
    lines.push(post.keyQuote);
    lines.push("");
    lines.push("中文摘要：");
    lines.push(post.zhSummary);
    lines.push("");
    if (post.url) {
      lines.push("連結：" + post.url);
      lines.push("");
    }
  }

  if (aBrief.length) {
    lines.push("── 其餘 " + aBrief.length + " 則文字貼文（簡列）──");
    for (var k = 0; k < aBrief.length; k++) {
      lines.push("• " + aBrief[k].taipeiTime + "｜" + trimText_(aBrief[k].content, 60) + "｜連結：" + aBrief[k].url);
    }
    lines.push("");
  }

  if (mediaPosts.length) {
    lines.push("==== B類：圖片或影片貼文（僅列連結） ====");
    lines.push("");
    for (var m = 0; m < mediaPosts.length; m++) {
      lines.push("• " + mediaPosts[m].taipeiTime + "｜喜愛 " + mediaPosts[m].fav + "｜轉發 " + mediaPosts[m].rb + "｜連結：" + mediaPosts[m].url);
    }
    lines.push("");
  }

  lines.push("==== 今日重點分析 ====");
  lines.push("");
  lines.push("（由遠見編輯部 Jesica、Lisa 發想，Google Apps Script 自動整理）");

  var body = lines.join("\n");
  return {
    subject: subject,
    body: body,
    htmlBody: formatPlainTextHtml_(body)
  };
}

function enrichPostSummary_(post) {
  var english = summarizeEnglish_(post.content, 2, 300);
  var chinese = translateToZhTw_(english) || fallbackChineseSummary_(post.content);
  post.keyQuote = english;
  post.zhSummary = chinese;
}

function summarizeEnglish_(text, maxSentences, maxChars) {
  var sentences = String(text || "").split(/(?<=[.!?])\s+/);
  var clean = [];
  for (var i = 0; i < sentences.length; i++) {
    if (String(sentences[i]).trim()) clean.push(String(sentences[i]).trim());
  }
  var summary = clean.length ? clean.slice(0, maxSentences).join(" ") : String(text || "").slice(0, maxChars);
  return trimText_(summary, maxChars);
}

function translateToZhTw_(text) {
  if (!text) return "";
  try {
    return LanguageApp.translate(text, "en", "zh-TW");
  } catch (err) {
    Logger.log("翻譯失敗，改用備援摘要：" + err);
    return "";
  }
}

function fallbackChineseSummary_(text) {
  return "此則貼文重點圍繞這段內容：" + summarizeEnglish_(text, 1, 90);
}

function stripHtml_(text) {
  return String(text || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function topPreview_(post) {
  return trimText_(post.content || "（圖片/影片）", 30);
}

function trimText_(text, limit) {
  var value = String(text || "").trim();
  if (value.length <= limit) return value;
  return value.slice(0, limit - 3).trim() + "...";
}

function toTaipeiDate_(date) {
  return new Date(Utilities.formatDate(date, TAIPEI_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX"));
}

function formatTaipeiDate_(date) {
  var yyyy = Utilities.formatDate(date, TAIPEI_TIMEZONE, "yyyy");
  var mm = Utilities.formatDate(date, TAIPEI_TIMEZONE, "MM");
  var dd = Utilities.formatDate(date, TAIPEI_TIMEZONE, "dd");
  var jsDate = toTaipeiDate_(date);
  return yyyy + "/" + mm + "/" + dd + "（" + WEEKDAYS_ZH[jsDate.getDay()] + "）";
}

function formatPlainTextHtml_(body) {
  var escaped = String(body || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  return (
    "<html><body style='margin:0;padding:20px;background:#ffffff;" +
    "font-family:Arial,\"PingFang TC\",\"Microsoft JhengHei\",sans-serif;" +
    "color:#222;line-height:1.8;'>" +
    "<div style='max-width:720px;margin:0 auto;'>" +
    escaped +
    "</div></body></html>"
  );
}

function pad2_(n) {
  return n < 10 ? "0" + n : String(n);
}
