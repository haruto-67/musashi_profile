/* /editor のロジック。D節（README.md 追記部分）の要件に対応する実装。
   Apps Script のデプロイ後、下の APPS_SCRIPT_URL を書き換えてから commit すること。 */
(function () {
  "use strict";

  // ===== デプロイ後にここを書き換える ==========================================
  var APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyp8xjrLzal19iRr-1Pe2oLn2jG59LiCHau2qZd3XyxM9KGpS5fIi4cl2MTnZzn7Mxywg/exec";
  // ============================================================================

  // ---------- 要素参照 ----------
  var authGate = document.getElementById("authGate");
  var authForm = document.getElementById("authForm");
  var authPassword = document.getElementById("authPassword");
  var authSubmit = document.getElementById("authSubmit");
  var authStatus = document.getElementById("authStatus");
  var editorRoot = document.getElementById("editorRoot");
  var editorBar = document.getElementById("editorBar");
  var publishBtn = document.getElementById("publishBtn");
  var editorStatus = document.getElementById("editorStatus");

  var roleText = document.getElementById("roleText");
  var nameText = document.getElementById("nameText");
  var nameEnText = document.getElementById("nameEnText");
  var ledeText = document.getElementById("ledeText");
  var areaText = document.getElementById("areaText");
  var gearText = document.getElementById("gearText");
  var scheduleText = document.getElementById("scheduleText");
  var feeText = document.getElementById("feeText");
  var wordText = document.getElementById("wordText");
  var emailText = document.getElementById("emailText");

  var heroShotEl = document.getElementById("heroShot");
  var portraitImgEl = document.getElementById("portraitImg");
  var stripImgEl = document.getElementById("stripImg");

  var snsEditorEl = document.getElementById("snsEditor");
  var bandsEditorEl = document.getElementById("bandsEditor");
  var supportEditorEl = document.getElementById("supportEditor");
  var gigsEditorEl = document.getElementById("gigsEditor");

  var addBandBtn = document.getElementById("addBandBtn");
  var addSupportBtn = document.getElementById("addSupportBtn");
  var addGigBtn = document.getElementById("addGigBtn");

  // ---------- 共有状態 ----------
  var pendingImages = {}; // key -> Blob（アップロード待ちの画像）
  var dirty = false;
  var cidCounter = 0;
  var loadedData = null;
  // 入り口（D-0）で認証に使ったパスワードをページを開いている間だけメモリ上に保持し、
  // 確定時に使い回す。storage には一切書かないので「保存しない」要件は満たしたまま。
  var currentPassword = null;

  function markDirty() {
    dirty = true;
  }
  window.addEventListener("beforeunload", function (e) {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  function newCid() {
    cidCounter += 1;
    return "c" + cidCounter + "_" + Date.now().toString(36);
  }

  function describeError(code) {
    var map = {
      bad_signature: "パスワードが違います",
      ts_skew: "端末の時刻がずれています",
      replay: "この操作はすでに処理されています。もう一度お試しください",
      rate_limited: "回数制限に達しました。しばらく待ってから試してください",
      invalid_path: "保存先が不正です",
      invalid_ext: "対応していない画像形式です",
      too_large: "画像が大きすぎます（2MB以下にしてください）",
      payload_too_large: "データが大きすぎます",
      server_error: "サーバー側でエラーが発生しました"
    };
    return (code && map[code]) || code || "不明なエラー";
  }

  // ---------- HMAC 署名（E節。Apps Script 側の canonicalize と一致させること） ----------
  async function hmacHex(secret, message) {
    var enc = new TextEncoder();
    var key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    var sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(message));
    return Array.from(new Uint8Array(sigBuf))
      .map(function (b) {
        return b.toString(16).padStart(2, "0");
      })
      .join("");
  }
  async function signPayload(secret, ts, payload) {
    var msg = String(ts) + "." + Site.canonicalJSON(payload);
    return await hmacHex(secret, msg);
  }
  // 確定時は画像アップロード→publish と連続してリクエストを送るため、
  // 同じ秒に2回送るとリプレイ判定（ts が単調増加でないと弾かれる。E節）に
  // 引っかかる。クライアント側で ts を単調増加させておく。
  var lastClientTs = 0;
  async function callAppsScript(action, payload, password) {
    var ts = Math.max(Math.floor(Date.now() / 1000), lastClientTs + 1);
    lastClientTs = ts;
    var sig = await signPayload(password, ts, payload);
    var body = JSON.stringify({ action: action, ts: ts, payload: payload, sig: sig });
    var res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: body
    });
    return res.json();
  }

  // ---------- 画像の縮小・向き補正（D-3） ----------
  async function resizeImage(file) {
    var bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    var maxSide = 1600;
    var scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    var w = Math.max(1, Math.round(bitmap.width * scale));
    var h = Math.max(1, Math.round(bitmap.height * scale));
    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();
    return await new Promise(function (resolve, reject) {
      canvas.toBlob(
        function (b) {
          if (b) resolve(b);
          else reject(new Error("toBlob failed"));
        },
        "image/jpeg",
        0.82
      );
    });
  }
  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result).split(",")[1]);
      };
      reader.onerror = function () {
        reject(new Error("read failed"));
      };
      reader.readAsDataURL(blob);
    });
  }
  async function uploadImage(key, blob, password) {
    var base64 = await blobToBase64(blob);
    var kind = key.indexOf("band:") === 0 ? "band" : key;
    var path = "images/" + kind + "-" + Math.floor(Date.now() / 1000) + "-" + Math.random().toString(36).slice(2, 7) + ".jpg";
    var res = await callAppsScript("uploadImage", { path: path, base64: base64 }, password);
    if (!res || !res.ok) throw new Error(describeError(res && res.error));
    return res.path || path;
  }

  // ---------- 画像フィールド（クリックで変更・削除。D-3） ----------
  function setupImageField(el, initialPath, key) {
    var fileInput = el.querySelector("input[type=file]");
    var delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "delImgBtn";
    delBtn.textContent = "×";
    delBtn.title = "削除";
    el.appendChild(delBtn);
    var currentPath = initialPath || "";

    function refresh() {
      var hasImage = !!(currentPath || pendingImages[key]);
      el.classList.toggle("empty", !hasImage);
      var overlay = el.querySelector(".editOverlay");
      overlay.textContent = hasImage ? "変更" : "＋ 写真を追加";
      delBtn.hidden = !hasImage;
    }

    el.addEventListener("click", function (e) {
      if (e.target !== delBtn) fileInput.click();
    });
    fileInput.addEventListener("change", async function () {
      var file = fileInput.files[0];
      fileInput.value = "";
      if (!file) return;
      try {
        var blob = await resizeImage(file);
        var url = URL.createObjectURL(blob);
        el.style.setProperty("--src", "url('" + url + "')");
        pendingImages[key] = blob;
        refresh();
        markDirty();
      } catch (err) {
        alert("画像の処理に失敗しました: " + err.message);
      }
    });
    delBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (!confirm("この写真を削除しますか？")) return;
      currentPath = "";
      delete pendingImages[key];
      el.style.removeProperty("--src");
      refresh();
      markDirty();
    });

    refresh();
    return { currentPath: function () { return currentPath; } };
  }

  // ---------- SNS・リンク編集（D-4） ----------
  function makeLinkRow(item) {
    var row = document.createElement("div");
    row.className = "linkRow";
    var label = document.createElement("input");
    label.className = "label";
    label.value = (item && item.label) || "";
    label.placeholder = "X";
    var url = document.createElement("input");
    url.className = "url";
    url.value = (item && item.url) || "";
    url.placeholder = "https://...";
    function validate() {
      url.classList.toggle("invalid", !!url.value && url.value.indexOf("https://") !== 0);
    }
    url.addEventListener("input", function () { validate(); markDirty(); });
    label.addEventListener("input", markDirty);
    validate();
    var del = document.createElement("button");
    del.type = "button";
    del.textContent = "×";
    del.addEventListener("click", function () {
      if (confirm("このリンクを削除しますか？")) {
        row.remove();
        markDirty();
      }
    });
    row.appendChild(label);
    row.appendChild(url);
    row.appendChild(del);
    return row;
  }
  function buildLinksEditor(container, items) {
    container.innerHTML = "";
    var list = document.createElement("div");
    list.className = "linksList";
    (items || []).forEach(function (item) {
      list.appendChild(makeLinkRow(item));
    });
    container.appendChild(list);
    var addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "addLinkBtn";
    addBtn.textContent = "＋ リンクを追加";
    addBtn.addEventListener("click", function () {
      var row = makeLinkRow({ label: "", url: "https://" });
      list.appendChild(row);
      row.querySelector("input.label").focus();
      markDirty();
    });
    container.appendChild(addBtn);
    container._linksList = list;
  }
  function readLinks(container) {
    return Array.from(container._linksList.children)
      .map(function (row) {
        return {
          label: row.querySelector("input.label").value.trim(),
          url: row.querySelector("input.url").value.trim()
        };
      })
      .filter(function (l) { return l.label || l.url; });
  }

  // ---------- 汎用パーツ ----------
  function ce(tag, text, placeholder) {
    var el = document.createElement(tag);
    el.contentEditable = "true";
    el.textContent = text || "";
    if (placeholder) el.dataset.placeholder = placeholder;
    return el;
  }
  function fieldInput(label, value, type) {
    var wrap = document.createElement("div");
    wrap.className = "field";
    var l = document.createElement("label");
    l.textContent = label;
    var input = document.createElement("input");
    input.type = type || "text";
    input.value = value || "";
    wrap.appendChild(l);
    wrap.appendChild(input);
    return { wrap: wrap, input: input };
  }
  function moveRow(card, dir) {
    if (dir < 0) {
      var prev = card.previousElementSibling;
      if (prev) card.parentNode.insertBefore(card, prev);
    } else {
      var next = card.nextElementSibling;
      if (next) card.parentNode.insertBefore(next, card);
    }
  }
  function toolsRow(card, opts) {
    var tools = document.createElement("div");
    tools.className = "rowTools";
    if (opts.move) {
      var up = document.createElement("button");
      up.type = "button";
      up.textContent = "↑";
      up.addEventListener("click", function () { moveRow(card, -1); markDirty(); });
      var down = document.createElement("button");
      down.type = "button";
      down.textContent = "↓";
      down.addEventListener("click", function () { moveRow(card, 1); markDirty(); });
      tools.appendChild(up);
      tools.appendChild(down);
    }
    var del = document.createElement("button");
    del.type = "button";
    del.className = "danger";
    del.textContent = "× 削除";
    del.addEventListener("click", function () {
      if (confirm(opts.confirmMsg)) {
        if (opts.onDelete) opts.onDelete();
        card.remove();
        markDirty();
      }
    });
    tools.appendChild(del);
    return tools;
  }

  // ---------- バンド行（D-3, D-4, D-5） ----------
  function makeBandRow(band) {
    var cid = newCid();
    var card = document.createElement("div");
    card.className = "rowCard";
    card.dataset.cid = cid;
    card.appendChild(
      toolsRow(card, {
        move: true,
        confirmMsg: "このバンドを削除しますか？",
        onDelete: function () { delete pendingImages["band:" + cid]; }
      })
    );

    var grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "1fr 168px";
    grid.style.gap = "16px";
    grid.style.alignItems = "start";

    var textWrap = document.createElement("div");
    var h3 = ce("h3", band.name, "バンド名");
    h3.style.fontFamily = "var(--fdisp)";
    h3.style.fontWeight = "600";
    h3.style.fontSize = "clamp(22px,5vw,34px)";
    var part = ce("span", band.since, "在籍期間（例 2024 — 現在）");
    part.className = "part";
    var p = ce("p", band.text, "紹介文");
    var linksWrap = document.createElement("div");
    textWrap.appendChild(h3);
    textWrap.appendChild(part);
    textWrap.appendChild(p);
    textWrap.appendChild(linksWrap);

    var img = document.createElement("div");
    img.className = "bandimg img imgEdit";
    var overlay = document.createElement("div");
    overlay.className = "editOverlay";
    img.appendChild(overlay);
    var fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    img.appendChild(fileInput);

    grid.appendChild(textWrap);
    grid.appendChild(img);
    card.appendChild(grid);

    buildLinksEditor(linksWrap, band.links);
    var imgCtl = setupImageField(img, band.image, "band:" + cid);
    card._imgCtl = imgCtl;

    [h3, part, p].forEach(function (el) {
      el.addEventListener("input", markDirty);
    });

    card._read = function () {
      return {
        name: h3.textContent.trim(),
        since: part.textContent.trim(),
        text: p.textContent,
        links: readLinks(linksWrap)
      };
    };
    return card;
  }

  // ---------- サポート行（D-5） ----------
  function makeSupportRow(row) {
    var card = document.createElement("div");
    card.className = "rowCard";
    card.appendChild(toolsRow(card, { move: true, confirmMsg: "このサポート実績を削除しますか？" }));
    var fr = document.createElement("div");
    fr.className = "fieldRow";
    var year = fieldInput("年", row.year, "text");
    var name = fieldInput("バンド名", row.name, "text");
    var note = fieldInput("内容", row.note, "text");
    fr.appendChild(year.wrap);
    fr.appendChild(name.wrap);
    fr.appendChild(note.wrap);
    card.appendChild(fr);
    [year.input, name.input, note.input].forEach(function (i) {
      i.addEventListener("input", markDirty);
    });
    card._read = function () {
      return { year: year.input.value.trim(), name: name.input.value.trim(), note: note.input.value.trim() };
    };
    return card;
  }

  // ---------- ライブ行（D-5。日付順は publish 時に自動整列） ----------
  function makeGigRow(g) {
    var card = document.createElement("div");
    card.className = "rowCard";
    card.appendChild(toolsRow(card, { move: false, confirmMsg: "このライブを削除しますか？" }));

    var fr1 = document.createElement("div");
    fr1.className = "fieldRow";
    var d = fieldInput("日付", g.d, "date");
    var b = fieldInput("バンド名", g.b, "text");
    var e = fieldInput("ライブ名", g.e, "text");
    fr1.appendChild(d.wrap);
    fr1.appendChild(b.wrap);
    fr1.appendChild(e.wrap);

    var fr2 = document.createElement("div");
    fr2.className = "fieldRow";
    var c = fieldInput("地名", g.c, "text");
    var v = fieldInput("会場", g.v, "text");
    var o = fieldInput("OPEN", g.o, "time");
    var st = fieldInput("出番", g.st, "time");
    var n = fieldInput("備考", g.n, "text");
    fr2.appendChild(c.wrap);
    fr2.appendChild(v.wrap);
    fr2.appendChild(o.wrap);
    fr2.appendChild(st.wrap);
    fr2.appendChild(n.wrap);

    card.appendChild(fr1);
    card.appendChild(fr2);

    // 編集中は日付を変えても並び替えない（確定時に buildContent() 側でまとめてソートする。
    // 編集中に行が動くと操作しづらいため、最後に追加したものは確定を押すまで末尾のまま）
    [d.input, b.input, e.input, c.input, v.input, o.input, st.input, n.input].forEach(function (i) {
      i.addEventListener("input", markDirty);
    });

    card._read = function () {
      return {
        d: d.input.value,
        b: b.input.value.trim(),
        e: e.input.value.trim(),
        c: c.input.value.trim(),
        v: v.input.value.trim(),
        o: o.input.value,
        st: st.input.value,
        n: n.input.value.trim()
      };
    };
    return card;
  }

  // ---------- 画面の組み立て ----------
  // ヘッダー（写真・肩書き・名前）は編集対象外。表示のみで固定
  var portraitCtl, stripCtl;

  function buildEditor(data) {
    loadedData = data;
    var p = data.profile || {};
    roleText.textContent = p.role || "";
    nameText.textContent = p.name || "";
    nameEnText.textContent = p.nameEn || "";
    heroShotEl.style.setProperty("--src", "url('" + (p.heroImage || "") + "')");
    ledeText.textContent = p.lede || "";
    areaText.textContent = p.area || "";
    gearText.textContent = p.gear || "";
    scheduleText.textContent = p.schedulePolicy || "";
    feeText.textContent = p.fee || "";
    wordText.textContent = p.word || "";
    emailText.textContent = p.email || "";

    [ledeText, areaText, gearText, scheduleText, feeText, wordText, emailText].forEach(function (el) {
      el.addEventListener("input", markDirty);
    });

    portraitCtl = setupImageField(portraitImgEl, p.portraitImage, "portrait");
    stripCtl = setupImageField(stripImgEl, data.stripImage, "strip");

    buildLinksEditor(snsEditorEl, p.sns);

    bandsEditorEl.innerHTML = "";
    (data.bands || []).forEach(function (b) { bandsEditorEl.appendChild(makeBandRow(b)); });

    supportEditorEl.innerHTML = "";
    (data.support || []).forEach(function (s) { supportEditorEl.appendChild(makeSupportRow(s)); });

    gigsEditorEl.innerHTML = "";
    (data.gigs || [])
      .slice()
      .sort(function (a, b2) { return a.d < b2.d ? -1 : a.d > b2.d ? 1 : 0; })
      .forEach(function (g) { gigsEditorEl.appendChild(makeGigRow(g)); });
  }

  addBandBtn.addEventListener("click", function () {
    var card = makeBandRow({ name: "", since: "", text: "", image: "", links: [] });
    bandsEditorEl.appendChild(card);
    card.querySelector("h3").focus();
    markDirty();
  });
  addSupportBtn.addEventListener("click", function () {
    var card = makeSupportRow({ year: "", name: "", note: "" });
    supportEditorEl.appendChild(card);
    card.querySelector("input").focus();
    markDirty();
  });
  addGigBtn.addEventListener("click", function () {
    var card = makeGigRow({ d: "", b: "", e: "", c: "", v: "", o: "", st: "", n: "" });
    gigsEditorEl.appendChild(card);
    card.querySelector('input[type=date]').focus();
    markDirty();
  });

  // ---------- 送信内容の組み立て（D-6） ----------
  function collectImageJobs() {
    var jobs = [];
    if (pendingImages.portrait) jobs.push({ key: "portrait", blob: pendingImages.portrait });
    if (pendingImages.strip) jobs.push({ key: "strip", blob: pendingImages.strip });
    Array.from(bandsEditorEl.children).forEach(function (card) {
      var k = "band:" + card.dataset.cid;
      if (pendingImages[k]) jobs.push({ key: k, blob: pendingImages[k] });
    });
    return jobs;
  }

  function buildContent(resolved) {
    var loadedProfile = (loadedData && loadedData.profile) || {};
    var profile = {
      // 名前・肩書き・ヘッダー写真は編集対象外なので、読み込んだ値をそのまま使う
      name: loadedProfile.name || "",
      nameEn: loadedProfile.nameEn || "",
      role: loadedProfile.role || "",
      heroImage: loadedProfile.heroImage || "",
      lede: ledeText.textContent,
      area: areaText.textContent,
      gear: gearText.textContent,
      schedulePolicy: scheduleText.textContent,
      fee: feeText.textContent,
      word: wordText.textContent,
      email: emailText.textContent.trim(),
      sns: readLinks(snsEditorEl),
      portraitImage: resolved.portrait || portraitCtl.currentPath()
    };
    var stripImage = resolved.strip || stripCtl.currentPath();

    var bands = Array.from(bandsEditorEl.children).map(function (card) {
      var b = card._read();
      var k = "band:" + card.dataset.cid;
      b.image = resolved[k] || card._imgCtl.currentPath();
      return b;
    });
    var support = Array.from(supportEditorEl.children).map(function (card) { return card._read(); });
    var gigs = Array.from(gigsEditorEl.children)
      .map(function (card) { return card._read(); })
      .sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });

    return {
      version: (loadedData && loadedData.version) || 1,
      updatedAt: new Date().toISOString(),
      profile: profile,
      stripImage: stripImage,
      bands: bands,
      support: support,
      gigs: gigs
    };
  }

  // ---------- 確定バー ----------
  function setStatus(msg, kind) {
    editorStatus.textContent = msg;
    editorStatus.className = "editorStatus" + (kind ? " " + kind : "");
  }
  function setBarBusy(busy) {
    publishBtn.disabled = busy;
  }

  publishBtn.addEventListener("click", async function () {
    if (!currentPassword) {
      setStatus("ログインし直してください", "err");
      return;
    }
    setBarBusy(true);
    try {
      var jobs = collectImageJobs();
      var resolved = {};
      for (var i = 0; i < jobs.length; i++) {
        setStatus("画像をアップロード中… (" + (i + 1) + "/" + jobs.length + ")");
        resolved[jobs[i].key] = await uploadImage(jobs[i].key, jobs[i].blob, currentPassword);
      }
      setStatus("送信中…");
      var content = buildContent(resolved);
      var res = await callAppsScript("publish", content, currentPassword);
      if (res && res.ok) {
        dirty = false;
        setStatus("反映しました。反映まで1分ほどかかります。", "ok");
      } else {
        setStatus(describeError(res && res.error), "err");
      }
    } catch (err) {
      setStatus("通信エラー: " + (err && err.message ? err.message : err), "err");
    } finally {
      setBarBusy(false);
    }
  });

  // ---------- D-0. パスワードゲート ----------
  function setAuthStatus(msg, isErr) {
    authStatus.textContent = msg || "";
    authStatus.className = "status" + (isErr ? " err" : "");
  }

  async function loadAndBuildEditor() {
    var res = await fetch("../content.json", { cache: "no-store" });
    if (!res.ok) throw new Error("content.json の取得に失敗しました");
    var data = await res.json();
    buildEditor(data);
  }

  authForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var password = authPassword.value;
    authSubmit.disabled = true;
    setAuthStatus("確認中…");
    try {
      var res = await callAppsScript("auth", {}, password);
      if (res && res.ok) {
        currentPassword = password;
        await loadAndBuildEditor();
        authGate.hidden = true;
        editorRoot.hidden = false;
        editorBar.hidden = false;
      } else {
        setAuthStatus(describeError(res && res.error), true);
      }
    } catch (err) {
      setAuthStatus("通信エラー: " + (err && err.message ? err.message : err), true);
    } finally {
      authSubmit.disabled = false;
    }
  });
})();
