/**
 * musashi_profile /editor 用の Apps Script ウェブアプリ。
 * README.md の追記 B・E・F 節に対応する実装。
 *
 * デプロイ手順・スクリプトプロパティの設定値は appsscript/SETUP.md を参照。
 *
 * 重要：canonicalize()/canonicalJSON() は docs/render.js の同名関数と
 * 必ず同じ実装にすること。片方だけ変えると署名検証が通らなくなる。
 */

// ============================================================
// エントリポイント
// ============================================================

function doGet(e) {
  return jsonOut({ ok: true, message: "POST only" });
}

function doPost(e) {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty("HMAC_SECRET");

  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut({ ok: false, error: "bad_request" });
  }

  var action = body.action;
  var ts = Number(body.ts);
  var payload = body.payload;
  var sig = body.sig;

  if (!secret) {
    return jsonOut({ ok: false, error: "server_error" });
  }

  if (action === "auth") {
    return handleAuth(props, secret, ts, sig);
  }

  if (action === "uploadImage" || action === "publish") {
    var v = verifySignature(props, secret, ts, payload, sig, { skipReplay: false });
    if (!v.ok) return jsonOut(v);

    var limit = action === "publish" ? 20 : 30;
    if (!checkAndBumpRate(props, action, limit)) {
      return jsonOut({ ok: false, error: "rate_limited" });
    }

    // 全チェック通過後にはじめて ts を「最後に受理した ts」として保存する（E節）
    props.setProperty("LAST_TS", String(ts));

    if (action === "uploadImage") return handleUploadImage(props, payload);
    return handlePublish(props, payload);
  }

  return jsonOut({ ok: false, error: "unknown_action" });
}

// ============================================================
// D-0 / F: auth（GitHubには触れない。失敗回数だけをレート制限の対象にする）
// ============================================================

function handleAuth(props, secret, ts, sig) {
  if (!checkAuthFailLimit(props)) {
    return jsonOut({ ok: false, error: "rate_limited" });
  }
  var v = verifySignature(props, secret, ts, {}, sig, { skipReplay: true });
  if (!v.ok) {
    bumpAuthFail(props);
    return jsonOut(v);
  }
  return jsonOut({ ok: true });
}

// ============================================================
// E節: 署名検証
// ============================================================

/**
 * @param {{skipReplay: boolean}} opts auth は replay 判定の対象外（E節）
 */
function verifySignature(props, secret, ts, payload, sig, opts) {
  opts = opts || {};

  if (!ts || !sig || typeof sig !== "string") {
    return { ok: false, error: "bad_request" };
  }

  var now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) {
    return { ok: false, error: "ts_skew" };
  }

  if (!opts.skipReplay) {
    var lastTs = Number(props.getProperty("LAST_TS") || "0");
    if (ts <= lastTs) {
      return { ok: false, error: "replay" };
    }
  }

  var expected = hmacHex(secret, String(ts) + "." + canonicalJSON(payload));
  if (!timingSafeEqual(expected, sig.toLowerCase())) {
    return { ok: false, error: "bad_signature" };
  }

  return { ok: true };
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    var sorted = {};
    Object.keys(value)
      .sort()
      .forEach(function (k) {
        sorted[k] = canonicalize(value[k]);
      });
    return sorted;
  }
  return value;
}

function canonicalJSON(value) {
  return JSON.stringify(canonicalize(value));
}

function hmacHex(secret, message) {
  var raw = Utilities.computeHmacSha256Signature(message, secret);
  return raw
    .map(function (b) {
      var v = (b + 256) % 256;
      var h = v.toString(16);
      return h.length === 1 ? "0" + h : h;
    })
    .join("");
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ============================================================
// レート制限（スクリプトプロパティに 1 時間窓のカウンタを持つ）
// ============================================================

function getWindowCount(props, prefix) {
  var now = Date.now();
  var windowStart = Number(props.getProperty(prefix + "_WINDOW") || "0");
  var count = Number(props.getProperty(prefix + "_COUNT") || "0");
  if (now - windowStart > 3600000) {
    windowStart = now;
    count = 0;
    props.setProperty(prefix + "_WINDOW", String(windowStart));
    props.setProperty(prefix + "_COUNT", String(count));
  }
  return count;
}

function bumpWindowCount(props, prefix) {
  var now = Date.now();
  var windowStart = Number(props.getProperty(prefix + "_WINDOW") || "0");
  var count = Number(props.getProperty(prefix + "_COUNT") || "0");
  if (now - windowStart > 3600000) {
    windowStart = now;
    count = 0;
  }
  count += 1;
  props.setProperty(prefix + "_WINDOW", String(windowStart));
  props.setProperty(prefix + "_COUNT", String(count));
  return count;
}

// auth は「失敗した回数」だけを数える（成功は数えない。F節の注意書き参照）
function checkAuthFailLimit(props) {
  return getWindowCount(props, "AUTH_FAIL") < 10;
}
function bumpAuthFail(props) {
  bumpWindowCount(props, "AUTH_FAIL");
}

// publish / uploadImage は呼び出し自体（検証通過分）を数える
function checkAndBumpRate(props, key, limit) {
  return bumpWindowCount(props, key) <= limit;
}

// ============================================================
// F: uploadImage — GitHub Contents API に直接 PUT
// ============================================================

function handleUploadImage(props, payload) {
  var path = payload && payload.path;
  var base64 = payload && payload.base64;

  if (typeof path !== "string" || path.indexOf("images/") !== 0 || path.indexOf("..") !== -1) {
    return jsonOut({ ok: false, error: "invalid_path" });
  }
  var ext = path.split(".").pop().toLowerCase();
  if (["jpg", "jpeg", "png", "webp"].indexOf(ext) === -1) {
    return jsonOut({ ok: false, error: "invalid_ext" });
  }
  if (typeof base64 !== "string" || !base64) {
    return jsonOut({ ok: false, error: "bad_request" });
  }
  var approxBytes = Math.floor((base64.length * 3) / 4);
  if (approxBytes > 2 * 1024 * 1024) {
    return jsonOut({ ok: false, error: "too_large" });
  }

  var repo = props.getProperty("GITHUB_REPO");
  var token = props.getProperty("GITHUB_TOKEN");
  // 公開ルートは docs/ 配下（README.md 4節）。content.json に保存する相対パスは
  // "images/xxx.jpg" のままだが、GitHub 上の実パスは "docs/" を付ける。
  var repoPath = "docs/" + path;
  var url = "https://api.github.com/repos/" + repo + "/contents/" + encodeURI(repoPath);

  var res = UrlFetchApp.fetch(url, {
    method: "put",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" },
    payload: JSON.stringify({
      message: "image: update via editor (" + path + ")",
      content: base64
    }),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  if (code !== 200 && code !== 201) {
    return jsonOut({ ok: false, error: "github_error", detail: res.getContentText() });
  }
  return jsonOut({ ok: true, path: path });
}

// ============================================================
// G: publish — repository_dispatch を発行（GitHub Actions が docs/content.json を書く）
// ============================================================

function handlePublish(props, content) {
  var clientPayload = JSON.stringify({ event_type: "content-update", client_payload: { content: content } });
  if (clientPayload.length > 65536) {
    return jsonOut({ ok: false, error: "payload_too_large" });
  }

  var repo = props.getProperty("GITHUB_REPO");
  var token = props.getProperty("GITHUB_TOKEN");
  var url = "https://api.github.com/repos/" + repo + "/dispatches";

  var res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" },
    payload: clientPayload,
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  if (code !== 204 && code !== 200) {
    return jsonOut({ ok: false, error: "github_error", detail: res.getContentText() });
  }
  return jsonOut({ ok: true });
}

// ============================================================
// util
// ============================================================

function jsonOut(obj) {
  // Apps Script のウェブアプリは HTTP ステータスを自由に設定できない。
  // 常に 200 を返し、成否は本文の ok フィールドで表す。
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
