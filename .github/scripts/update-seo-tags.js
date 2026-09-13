"use strict";
// docs/content.json の内容から docs/index.html の <head> 内SEOブロック
// （SEO:AUTO-GENERATED:START〜END の間）を再生成する。
// content-update.yml から、validate-and-write.js で content.json を
// 書き出した直後に実行される。

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const CONTENT_PATH = path.join(ROOT, "docs", "content.json");
const INDEX_PATH = path.join(ROOT, "docs", "index.html");
const SITE_URL = "https://www.musashi-drums.com";
const START_MARKER = "<!-- SEO:AUTO-GENERATED:START -->";
const END_MARKER = "<!-- SEO:AUTO-GENERATED:END -->";

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function absUrl(p) {
  if (!p) return "";
  return SITE_URL + "/" + String(p).replace(/^\/+/, "");
}

// 会場名(v)と日付(d)が無い行はイベントとして成立しない（「詳細未解禁」等の
// プレースホルダー行）ので構造化データには含めない
function buildEvents(content) {
  const gigs = content.gigs || [];
  return gigs
    .filter(function (g) { return g && g.d && g.v; })
    .map(function (g) {
      const time = g.st || g.o || "";
      const startDate = time ? g.d + "T" + time + ":00+09:00" : g.d;
      const event = {
        "@context": "https://schema.org",
        "@type": "MusicEvent",
        name: g.e || (g.b ? g.b + " のライブ" : "ライブ"),
        startDate: startDate,
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: {
          "@type": "Place",
          name: g.v,
          address: g.c || undefined
        },
        url: SITE_URL + "/"
      };
      if (g.b) {
        event.performer = { "@type": "MusicGroup", name: g.b };
      }
      return event;
    });
}

function buildBlock(content) {
  const p = content.profile || {};
  const name = p.name || "";
  const nameEn = p.nameEn || "";
  const role = p.role || "";
  const title = name ? name + " — Drums" : "Drums";
  const description =
    (role ? role + "として活動する" : "") +
    name +
    (nameEn ? "（" + nameEn + "）" : "") +
    "のプロフィールサイト。参加バンド、サポート歴、ライブスケジュールを掲載しています。";
  const heroUrl = absUrl(p.heroImage);
  const portraitUrl = absUrl(p.portraitImage || p.heroImage);

  const sameAs = (p.sns || [])
    .map(function (s) { return s && s.url; })
    .filter(function (u) { return /^https?:\/\//.test(u || ""); });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: name,
    jobTitle: "Drummer",
    url: SITE_URL + "/"
  };
  if (nameEn) jsonLd.alternateName = nameEn;
  if (portraitUrl) jsonLd.image = portraitUrl;
  if (sameAs.length) jsonLd.sameAs = sameAs;

  const lines = [];
  lines.push(START_MARKER);
  lines.push("<title>" + esc(title) + "</title>");
  lines.push('<meta name="description" content="' + esc(description) + '">');
  lines.push('<link rel="canonical" href="' + SITE_URL + '/">');
  lines.push('<meta property="og:type" content="profile">');
  lines.push('<meta property="og:site_name" content="' + esc(name) + " Drums" + '">');
  lines.push('<meta property="og:title" content="' + esc(title) + '">');
  lines.push('<meta property="og:description" content="' + esc(description) + '">');
  lines.push('<meta property="og:url" content="' + SITE_URL + '/">');
  if (heroUrl) lines.push('<meta property="og:image" content="' + esc(heroUrl) + '">');
  lines.push('<meta property="og:locale" content="ja_JP">');
  lines.push('<meta name="twitter:card" content="summary_large_image">');
  lines.push('<meta name="twitter:title" content="' + esc(title) + '">');
  lines.push('<meta name="twitter:description" content="' + esc(description) + '">');
  if (heroUrl) lines.push('<meta name="twitter:image" content="' + esc(heroUrl) + '">');
  lines.push('<script type="application/ld+json">');
  lines.push(JSON.stringify(jsonLd, null, 2));
  lines.push("</script>");

  // 会場が確定しているライブ予定はMusicEventとしても構造化データ化する
  // （Google検索でイベント情報として扱われる可能性がある）
  buildEvents(content).forEach(function (event) {
    lines.push('<script type="application/ld+json">');
    lines.push(JSON.stringify(event, null, 2));
    lines.push("</script>");
  });

  lines.push(END_MARKER);
  return lines.join("\n");
}

function main() {
  const content = JSON.parse(fs.readFileSync(CONTENT_PATH, "utf8"));
  const html = fs.readFileSync(INDEX_PATH, "utf8");

  const startIdx = html.indexOf(START_MARKER);
  const endIdx = html.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error("docs/index.html: SEO:AUTO-GENERATED マーカーが見つかりません");
  }

  const block = buildBlock(content);
  const newHtml = html.slice(0, startIdx) + block + html.slice(endIdx + END_MARKER.length);

  if (newHtml !== html) {
    fs.writeFileSync(INDEX_PATH, newHtml);
    console.log("docs/index.html のSEOブロックを更新しました");
  } else {
    console.log("docs/index.html のSEOブロックに変更なし");
  }
}

main();
