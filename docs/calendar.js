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
        h += '<span class="ev"><u>' + g.e + "</u><em>" + g.b + "</em></span>";
      });
      h += "</div>";
    }
    h += '</div><ul class="gigs">';
    list.forEach(function (g) {
      var dd = new Date(g.d.replace(/-/g, "/"));
      h +=
        '<li><span class="gd">' +
        (dd.getMonth() + 1) +
        "/" +
        dd.getDate() +
        "<em>" +
        W[dd.getDay()] +
        "</em></span>" +
        '<span class="gmain"><b>' +
        g.e +
        '</b><span class="ge">' +
        g.b +
        (g.n ? '<u class="gn">' + g.n + "</u>" : "") +
        "</span></span>" +
        '<span class="gv"><em>' +
        g.c +
        "</em>" +
        g.v +
        "</span>" +
        '<span class="gt">OPEN ' +
        g.o +
        "<em>出番 " +
        g.st +
        "</em></span></li>";
    });
    if (!list.length) h += '<li class="none">この月の予定はまだありません。</li>';
    h += "</ul>";
    body.innerHTML = h;
  }
  draw(0);
}
