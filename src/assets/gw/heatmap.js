/**
 * GW Heatmap JS — 提取自 ginger_wechat_portrait/report.py _HEATMAP_JS 变量
 * GitHub 风格聊天热力图，支持双人对比 + 年份切换 + tooltip
 *
 * 用法：initHeatmap(selfDailyData, partnerDailyData, hasPartner)
 *   selfDailyData:    { "YYYY-MM-DD": count, ... } — 自己的每日消息数
 *   partnerDailyData: { "YYYY-MM-DD": count, ... } — 对方的每日消息数（可选）
 *   hasPartner:       boolean — 是否有对方数据
 */
function initHeatmap(selfData, partnerData, hasPartner) {
  var SELF_PAL    = ['#EDE5DC','#D4A882','#B87040','#8B5E3C','#5A3020'];
  var PARTNER_PAL = ['#D8EDEA','#8ABFB8','#5A9B93','#4A7B6F','#2E5048'];
  var MON = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

  // Collect years from both datasets
  var allKeys = Object.keys(selfData).concat(hasPartner ? Object.keys(partnerData) : []);
  var yearSet = {};
  allKeys.forEach(function(k) { yearSet[k.slice(0, 4)] = true; });
  var years = Object.keys(yearSet).sort();
  if (!years.length) return;

  var curYear = years[years.length - 1];

  // Year toggle buttons
  var btnBox = document.getElementById('hm-year-btns');
  years.forEach(function(y) {
    var btn = document.createElement('button');
    btn.className = 'hm-yr-btn' + (y === curYear ? ' hm-active' : '');
    btn.textContent = y;
    btn.onclick = function() {
      document.querySelectorAll('.hm-yr-btn').forEach(function(b) { b.classList.remove('hm-active'); });
      btn.classList.add('hm-active');
      curYear = y;
      renderGrid('hm-self-grid', selfData, SELF_PAL);
      if (hasPartner) renderGrid('hm-partner-grid', partnerData, PARTNER_PAL);
    };
    btnBox.appendChild(btn);
  });

  function getColor(n, mx, pal) {
    if (!n || mx === 0) return pal[0];
    var r = n / mx;
    return r < 0.15 ? pal[1] : r < 0.40 ? pal[2] : r < 0.72 ? pal[3] : pal[4];
  }

  function ymd(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function renderGrid(elId, data, pal) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = '';

    var yr = parseInt(curYear, 10);
    var yrVals = [];
    Object.keys(data).forEach(function(k) {
      if (k.startsWith(curYear)) yrVals.push(+data[k]);
    });
    var mx = yrVals.length ? Math.max.apply(null, yrVals) : 1;

    // Outer flex container (day labels + scrollable weeks)
    var wrap = document.createElement('div');
    wrap.className = 'hm-flex';

    // Day-of-week labels (left column)
    var dayCol = document.createElement('div');
    dayCol.className = 'hm-daycol';
    var sp = document.createElement('div');
    sp.className = 'hm-month-sp';
    dayCol.appendChild(sp);
    ['一','二','三','四','五','六','日'].forEach(function(lbl, i) {
      var d = document.createElement('div');
      d.className = 'hm-daylbl';
      d.textContent = (i % 2 === 0) ? lbl : '';
      dayCol.appendChild(d);
    });
    wrap.appendChild(dayCol);

    // Scrollable weeks
    var scroll = document.createElement('div');
    scroll.className = 'hm-scroll';

    // Start: Monday on or before Jan 1
    var jan1 = new Date(yr, 0, 1);
    var dow0 = (jan1.getDay() + 6) % 7;
    var startD = new Date(jan1);
    startD.setDate(startD.getDate() - dow0);

    // End: Sunday on or after Dec 31
    var dec31 = new Date(yr, 11, 31);
    var dow31 = (dec31.getDay() + 6) % 7;
    var endD = new Date(dec31);
    endD.setDate(endD.getDate() + (6 - dow31));

    var cur = new Date(startD);
    var seenMon = {};

    while (cur <= endD) {
      var col = document.createElement('div');
      col.className = 'hm-col';

      var monLbl = document.createElement('div');
      monLbl.className = 'hm-monlbl';

      var weekEl = document.createElement('div');
      weekEl.className = 'hm-weekcol';

      for (var i = 0; i < 7; i++) {
        var inYr = cur.getFullYear() === yr;

        if (inYr && cur.getDate() === 1 && !seenMon[cur.getMonth()]) {
          monLbl.textContent = MON[cur.getMonth()];
          seenMon[cur.getMonth()] = true;
        }

        var cell = document.createElement('div');
        if (inYr) {
          var ds = ymd(cur);
          var n = +(data[ds] || 0);
          cell.className = 'hm-cell';
          cell.style.backgroundColor = getColor(n, mx, pal);
          cell.dataset.d = ds;
          cell.dataset.n = n;
        } else {
          cell.className = 'hm-cell hm-out';
        }
        weekEl.appendChild(cell);
        cur.setDate(cur.getDate() + 1);
      }

      col.appendChild(monLbl);
      col.appendChild(weekEl);
      scroll.appendChild(col);
    }

    wrap.appendChild(scroll);
    el.appendChild(wrap);
  }

  renderGrid('hm-self-grid', selfData, SELF_PAL);
  if (hasPartner) renderGrid('hm-partner-grid', partnerData, PARTNER_PAL);

  // Tooltip
  var tip = document.createElement('div');
  tip.className = 'hm-tip';
  document.body.appendChild(tip);

  document.addEventListener('mouseover', function(e) {
    var t = e.target;
    if (t.classList && t.classList.contains('hm-cell') && t.dataset && t.dataset.d) {
      var n = +t.dataset.n;
      tip.textContent = t.dataset.d + (n > 0 ? '  ·  ' + n + ' 条' : '  ·  无消息');
      tip.style.display = 'block';
    }
  });
  document.addEventListener('mouseout', function(e) {
    if (e.target.classList && e.target.classList.contains('hm-cell')) {
      tip.style.display = 'none';
    }
  });
  document.addEventListener('mousemove', function(e) {
    tip.style.left = (e.clientX + 14) + 'px';
    tip.style.top  = (e.clientY - 38) + 'px';
  });
}
