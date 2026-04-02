/**
 * Trump Truth Social Daily Digest - Gmail Webhook
 *
 * 部署為 Google Apps Script Web App 後，
 * 遠端 Claude Code agent 可透過 POST 呼叫此 endpoint 寄信。
 *
 * POST body (JSON):
 *   { "to": "a@gmail.com,b@gmail.com", "subject": "主旨", "body": "內容" }
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    var to = data.to;
    var subject = decodeUtf8Field_(data.subject_b64, data.subject);
    var body = decodeUtf8Field_(data.body_b64, data.body);
    var htmlBody = decodeUtf8Field_(data.html_body_b64, data.html_body);

    if (!to || !subject || !body) {
      return ContentService.createTextOutput(
        JSON.stringify({ status: "error", message: "Missing required fields: to, subject, body" })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // 以純文字內容為主，HTML 僅用來保留換行，避免出現桌面感較重的表格版型
    GmailApp.sendEmail(to, subject, body, {
      name: "Trump Truth Social Daily Digest",
      htmlBody: htmlBody || formatPlainTextHtml_(body)
    });

    return ContentService.createTextOutput(
      JSON.stringify({ status: "ok", message: "Email sent successfully to " + to })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: "error", message: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function decodeUtf8Field_(base64Value, fallbackValue) {
  if (base64Value) {
    var bytes = Utilities.base64Decode(base64Value);
    return Utilities.newBlob(bytes).getDataAsString("UTF-8");
  }
  return fallbackValue || "";
}

function formatPlainTextHtml_(body) {
  var escaped = (body || "")
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

// 測試用 - 可在 Apps Script 編輯器直接執行
function testSend() {
  GmailApp.sendEmail(
    "reddustblog@gmail.com",
    "Webhook 測試",
    "這是一封測試信，確認 Apps Script 寄信功能正常。"
  );
  Logger.log("測試信已寄出");
}
