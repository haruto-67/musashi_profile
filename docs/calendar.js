/* content.json の gigs 配列からカレンダーと一覧を組み立てる。
   render.js から renderCalendar(gigs) として呼ばれる。 */
function renderCalendar(GIGS) {
  GIGS = GIGS || [];
  var W = ["日", "月", "火", "水", "木", "金", "土"];
  var host = document.getElementById("cal");
  if (!host) return;
  host.innerHTML = "";
  var now = new Date(),
    months = [];
  for (var m = 0; m < 3; m++) months.push(new Date(now.getFullYear(), now.getMonth() + m, 1));
  var nav = document.createElement("div");
  nav.className = "calnav";
  var body = document.createElement("div");
  body.className = "calbody";
  host.appendChild(nav);
  host.appendChild(body);

  var ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ESCAPES[c];
    });
  }

  function listOf(d) {
    var key = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2);
    return GIGS.filter(function (g) {
      return g.d.indexOf(key) === 0;
    });
  }
  months.forEach(function (d, i) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "mbtn";
    b.innerHTML = (d.getMonth() + 1) + "月<i>" + listOf(d).length + "本</i>";
    b.addEventListener("click", function () {
      draw(i);
    });
    nav.appendChild(b);
  });

  /* マスをタップしたとき、下の一覧の該当行まで移動して一瞬光らせる。
     body の中身は draw() のたびに作り直すので、監視は body に1つだけ付ける。 */
  var hlTimer = null;
  function focusGig(idx) {
    var li = document.getElementById("gig-" + idx);
    if (!li) return;
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    li.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    var prev = body.querySelector(".gigs li.is-target");
    if (prev) prev.classList.remove("is-target");
    li.classList.add("is-target");
    clearTimeout(hlTimer);
    hlTimer = setTimeout(function () {
      li.classList.remove("is-target");
    }, 1800);
  }
  body.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest(".ev") : null;
    if (btn) focusGig(btn.getAttribute("data-gig"));
  });

  function draw(i) {
    for (var k = 0; k < nav.children.length; k++) {
      nav.children[k].className = "mbtn" + (k === i ? " is-on" : "");
      nav.children[k].setAttribute("aria-current", k === i ? "true" : "false");
    }
    var d0 = months[i],
      y = d0.getFullYear(),
      mo = d0.getMonth();
    var key = y + "-" + ("0" + (mo + 1)).slice(-2),
      list = listOf(d0);
    var last = new Date(y, mo + 1, 0).getDate(),
      pad = d0.getDay();
    var h = '<p class="calcap">' + y + "年" + (mo + 1) + "月</p>";
    h +=
      '<div class="dow">' +
      W.map(function (w) {
        return "<span>" + w + "</span>";
      }).join("") +
      "</div>";
    h += '<div class="days">';
    for (var p = 0; p < pad; p++) h += '<div class="day pad"></div>';
    for (var day = 1; day <= last; day++) {
      var iso = key + "-" + ("0" + day).slice(-2);
      var hit = list.filter(function (g) {
        return g.d === iso;
      });
      h += '<div class="day' + (hit.length ? " hit" : "") + '"><b>' + day + "</b>";
      hit.forEach(function (g) {
        /* ライブ名が未入力のうちは備考（「詳細未解禁」など）を代わりに出す。
           何も無いマスだとタップ先が分からないため。 */
        var t = g.e || g.n || "予定あり";
        h +=
          '<button type="button" class="ev" data-gig="' +
          list.indexOf(g) +
          '" title="' +
          esc(t + (g.b ? " / " + g.b : "")) +
          '"><u>' +
          esc(t) +
          "</u>" +
          (g.b ? "<em>" + esc(g.b) + "</em>" : "") +
          "</button>";
      });
      h += "</div>";
    }
    h += '</div><ul class="gigs">';
    list.forEach(function (g, gi) {
      var dd = new Date(g.d.replace(/-/g, "/"));
      h +=
        '<li id="gig-' +
        gi +
        '"><span class="gd">' +
        (dd.getMonth() + 1) +
        "/" +
        dd.getDate() +
        "<em>" +
        W[dd.getDay()] +
        "</em></span>" +
        '<span class="gmain"><b>' +
        esc(g.e) +
        '</b><span class="ge">' +
        esc(g.b) +
        (g.n ? '<u class="gn">' + esc(g.n) + "</u>" : "") +
        "</span></span>" +
        '<span class="gv"><em>' +
        esc(g.c) +
        "</em>" +
        esc(g.v) +
        "</span>" +
        '<span class="gt">OPEN ' +
        esc(g.o) +
        "<em>出番 " +
        esc(g.st) +
        "</em></span></li>";
    });
    if (!list.length) h += '<li class="none">この月の予定はまだありません。</li>';
    h += "</ul>";
    body.innerHTML = h;
  }
  draw(0);
}
