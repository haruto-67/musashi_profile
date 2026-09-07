// repository_dispatch (content-update) の client_payload.content を検証して
// docs/content.json に書き出す。README.md 追記 G節の要件に対応する。
"use strict";
const fs = require("fs");

function fail(msg) {
  console.error("Validation failed: " + msg);
  process.exit(1);
}
function isString(v) {
  return typeof v === "string";
}
function isArray(v) {
  return Array.isArray(v);
}

let content;
try {
  content = JSON.parse(process.env.CONTENT_JSON || "null");
} catch (e) {
  fail("CONTENT_JSON is not valid JSON: " + e.message);
}
if (!content || typeof content !== "object") fail("content is missing or not an object");

const p = content.profile;
if (!p || typeof p !== "object") fail("profile is missing");

["name", "nameEn", "role", "lede", "area", "gear", "schedulePolicy", "fee", "word", "email"].forEach((k) => {
  if (!isString(p[k])) fail("profile." + k + " must be a string");
});
if (!isArray(p.sns)) fail("profile.sns must be an array");
p.sns.forEach((s, i) => {
  if (!s || !isString(s.label) || !isString(s.url)) fail("profile.sns[" + i + "] needs label/url strings");
});
if (!isString(p.heroImage)) fail("profile.heroImage must be a string");
if (!isString(p.portraitImage)) fail("profile.portraitImage must be a string");

if (!isString(content.stripImage)) fail("stripImage must be a string");

if (!isArray(content.bands)) fail("bands must be an array");
content.bands.forEach((b, i) => {
  if (!b || !isString(b.name) || !isString(b.since) || !isString(b.text) || !isString(b.image) || !isArray(b.links)) {
    fail("bands[" + i + "] is malformed");
  }
  b.links.forEach((l, j) => {
    if (!l || !isString(l.label) || !isString(l.url)) fail("bands[" + i + "].links[" + j + "] is malformed");
  });
});

if (!isArray(content.support)) fail("support must be an array");
content.support.forEach((s, i) => {
  if (!s || !isString(s.year) || !isString(s.name) || !isString(s.note)) fail("support[" + i + "] is malformed");
});

if (!isArray(content.gigs)) fail("gigs must be an array");
const gigFields = ["d", "b", "e", "c", "v", "o", "st", "n"];
content.gigs.forEach((g, i) => {
  if (!g) fail("gigs[" + i + "] is malformed");
  gigFields.forEach((f) => {
    if (!isString(g[f])) fail("gigs[" + i + "]." + f + " must be a string");
  });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(g.d)) fail("gigs[" + i + "].d must be YYYY-MM-DD");
});

content.version = content.version || 1;
content.updatedAt = new Date().toISOString();

fs.writeFileSync("docs/content.json", JSON.stringify(content, null, 2) + "\n");
console.log("docs/content.json written.");
