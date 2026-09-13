/* content.json を読み込んで index.html / editor の両方に描画するための共通処理。
   canonicalize/canonicalJSON は Apps Script 側 (appsscript/Code.gs の canonicalize) と
   必ず同じ実装にすること。ここを変えたら向こうも変える。 */
(function (global) {
  "use strict";

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
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

  // 背景画像のdivには本来alt属性を書けないので、role="img"+aria-labelで
  // スクリーンリーダー・検索エンジン向けの代替テキストを補う
  function setBg(el, path, label) {
    if (!el) return;
    if (path) el.style.setProperty("--src", "url('" + path + "')");
    else el.style.removeProperty("--src");
    if (label) {
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", label);
    }
  }

  function setMultiline(el, text) {
    if (!el) return;
    el.textContent = text || "";
  }

  function showHide(el, visible) {
    if (!el) return;
    el.hidden = !visible;
  }

  function renderSns(container, items, linkClass) {
    if (!container) return;
    container.innerHTML = "";
    (items || []).forEach(function (item) {
      if (!item || !item.label) return;
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.textContent = item.label;
      a.href = item.url || "#";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      li.appendChild(a);
      container.appendChild(li);
    });
    if (linkClass) container.className = linkClass;
  }

  function bandArticle(band) {
    var art = document.createElement("article");
    art.className = "band";

    var text = document.createElement("div");
    text.className = "bandtext";

    var h3 = document.createElement("h3");
    h3.textContent = band.name || "";
    text.appendChild(h3);

    var span = document.createElement("span");
    span.className = "part";
    span.textContent = band.since || "";
    text.appendChild(span);

    var p = document.createElement("p");
    p.textContent = band.text || "";
    text.appendChild(p);

    var links = document.createElement("ul");
    links.className = "links";
    renderSns(links, band.links);
    text.appendChild(links);

    art.appendChild(text);

    var img = document.createElement("div");
    img.className = "bandimg img";
    setBg(img, band.image, band.name ? band.name + "の写真" : "");
    art.appendChild(img);

    return art;
  }

  function supportRow(row) {
    var div = document.createElement("div");
    var yr = document.createElement("span");
    yr.className = "yr";
    yr.textContent = row.year || "";
    div.appendChild(yr);
    div.appendChild(document.createTextNode(row.name || ""));
    if (row.note) {
      var note = document.createElement("span");
      note.className = "note";
      note.textContent = row.note;
      div.appendChild(note);
    }
    return div;
  }

  /**
   * data (content.json の中身) を root (既定 document) 内の要素に反映する。
   * 要素は index.html / editor/index.html の両方に共通の id を振ってある。
   */
  function render(data, root) {
    root = root || document;
    var p = data.profile || {};
    var $ = function (id) {
      return root.querySelector("#" + id);
    };

    setMultiline($("roleText"), p.role);
    setMultiline($("nameText"), p.name);
    setMultiline($("nameEnText"), p.nameEn);
    setMultiline($("ledeText"), p.lede);
    setBg($("heroShot"), p.heroImage, p.name ? p.name + "（" + (p.role || "ドラマー") + "）" : "");
    setBg($("portraitImg"), p.portraitImage, p.name ? p.name + "のポートレート写真" : "");

    setMultiline($("areaText"), p.area);
    showHide($("areaBlock"), !!p.area);
    setMultiline($("gearText"), p.gear);
    showHide($("gearBlock"), !!p.gear);
    setMultiline($("scheduleText"), p.schedulePolicy);
    showHide($("scheduleBlock"), !!p.schedulePolicy);
    setMultiline($("feeText"), p.fee);
    showHide($("feeBlock"), !!p.fee);

    renderSns($("snsList"), p.sns);
    setMultiline($("emailText"), p.email);
    showHide($("metaBlock"), !!p.email);

    setBg($("stripImg"), data.stripImage, p.name ? p.name + "のライブ写真" : "");

    var bandsList = $("bandsList");
    if (bandsList) {
      bandsList.innerHTML = "";
      (data.bands || []).forEach(function (band) {
        bandsList.appendChild(bandArticle(band));
      });
    }
    showHide($("bandsSection"), !!(data.bands && data.bands.length));

    var supportList = $("supportList");
    if (supportList) {
      supportList.innerHTML = "";
      (data.support || []).forEach(function (row) {
        supportList.appendChild(supportRow(row));
      });
    }
    showHide($("supportSection"), !!(data.support && data.support.length));

    setMultiline($("wordText"), p.word);

    if (global.renderCalendar) {
      global.renderCalendar(data.gigs || []);
    }
  }

  global.Site = {
    canonicalize: canonicalize,
    canonicalJSON: canonicalJSON,
    render: render
  };
})(window);
