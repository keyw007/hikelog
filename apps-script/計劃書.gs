/**
 * 登山行程計劃書產生器（Google Apps Script）
 *
 * 從這份試算表的「計劃書資料、成員、費用、公裝、伙食、裝備清單、固定內容、總覽、D0～Dn」
 * 產生一份 Google 文件，並同時輸出 Word（.docx），兩個檔案都存在試算表所在的資料夾。
 *
 * 安裝：擴充功能 → Apps Script → 貼上本檔 → 儲存 → 重新整理試算表
 *       → 上方選單「計劃書」→「產生計劃書」→ 第一次會要求授權。
 * 版本：1.0.0
 */

var PLAN_VERSION = '1.0.0';

var COLOR = {
  label: '#F2DCDB',   // 主表左欄粉紅底
  labelText: '#1F4E79',
  title: '#C00000',
  head: '#9BDCE8',    // 行程表欄位標題（青色）
  dayBar: '#FFF2CC',  // 日期路線列（黃）
  dark: '#D9D9D9',    // 日出前、日落後
  red: '#C00000',
  blue: '#1F4E79',
  orange: '#C55A11',
  grey: '#666666',
  sub: '#F2F2F2',
  border: '#999999'
};

var PAGE = { w: 595.28, h: 841.89, margin: 36 };   // A4 直式，0.5 吋邊界
var CONTENT_W = PAGE.w - PAGE.margin * 2;           // 523 pt

/* ───────────────────────── 選單 ───────────────────────── */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('計劃書')
    .addItem('產生計劃書（Google 文件＋Word）', 'generatePlan')
    .addSeparator()
    .addItem('使用說明', 'showPlanHelp')
    .addToUi();
}

function showPlanHelp() {
  var html =
    '<div style="font-family:sans-serif;font-size:13px;line-height:1.6">' +
    '<b>產生計劃書</b><br>' +
    '1. 填好「計劃書資料、成員、費用、公裝、伙食」黃底欄位，以及每日頁 D0～Dn。<br>' +
    '2. 上方選單「計劃書」→「產生計劃書」。<br>' +
    '3. 完成後會跳出 Google 文件與 Word 檔的連結，兩個檔都存在這份試算表所在的資料夾。<br><br>' +
    '<b>注意</b><br>' +
    '・「計劃書資料」A 欄的名稱不要改，程式是依名稱讀取。<br>' +
    '・每次產生都會建立新檔，舊檔不會被覆蓋。<br>' +
    '・計劃書含成員電話與緊急聯絡人，只傳給領隊、留守人與隊員。<br>' +
    '<br><span style="color:#888">版本 ' + PLAN_VERSION + '</span></div>';
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(420).setHeight(280), '計劃書使用說明');
}

/* ───────────────────────── 主程式 ───────────────────────── */

function generatePlan() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  try {
    ss.toast('讀取試算表…', '計劃書', 30);
    var data = readAll(ss);

    ss.toast('建立 Google 文件…', '計劃書', 60);
    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMdd-HHmm');
    var name = (data.title || data.kv['活動名稱'] || ss.getName()).replace(/[【】]/g, '') + '（' + stamp + '）';
    var doc = DocumentApp.create(name);
    buildDoc(doc, data);
    doc.saveAndClose();

    ss.toast('輸出 Word…', '計劃書', 60);
    var folder = getFolderOf(ss.getId());
    var docFile = DriveApp.getFileById(doc.getId());
    if (folder) docFile.moveTo(folder);
    var docx = exportDocx(doc.getId(), name + '.docx');
    var docxFile = folder ? folder.createFile(docx) : DriveApp.createFile(docx);

    showDone(doc.getUrl(), docxFile.getUrl(), name);
  } catch (e) {
    ui.alert('產生計劃書失敗', String(e && e.message || e) + '\n\n' + (e && e.stack || ''), ui.ButtonSet.OK);
  }
}

function getFolderOf(fileId) {
  var parents = DriveApp.getFileById(fileId).getParents();
  return parents.hasNext() ? parents.next() : null;
}

function exportDocx(docId, filename) {
  var url = 'https://docs.google.com/document/d/' + docId + '/export?format=docx';
  var res = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('Word 匯出失敗（HTTP ' + res.getResponseCode() + '）');
  }
  return res.getBlob().setName(filename);
}

function showDone(docUrl, docxUrl, name) {
  var html =
    '<div style="font-family:sans-serif;font-size:14px;line-height:1.8">' +
    '<div style="margin-bottom:8px">' + escapeHtml(name) + '</div>' +
    '<a href="' + docUrl + '" target="_blank">開啟 Google 文件</a><br>' +
    '<a href="' + docxUrl + '" target="_blank">下載 Word（.docx）</a>' +
    '<p style="color:#888;font-size:12px">兩個檔都存在試算表所在的資料夾。</p></div>';
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(380).setHeight(170), '計劃書已產生');
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ───────────────────────── 讀取資料 ───────────────────────── */

function readAll(ss) {
  var planSheet = ss.getSheetByName('計劃書資料');
  if (!planSheet) throw new Error('找不到「計劃書資料」工作表。請用新版範本，或先建立這個分頁。');

  var planVals = planSheet.getDataRange().getDisplayValues();
  var kv = {};
  var retreat = [];
  for (var i = 0; i < planVals.length; i++) {
    var k = trim(planVals[i][0]);
    if (!k) continue;
    if (k === '天' && /撤退/.test(planVals[i][1] || '')) {
      for (var j = i + 1; j < planVals.length; j++) {
        var d = trim(planVals[j][0]);
        if (!d) break;
        retreat.push({ day: d, point: clean(planVals[j][1]), note: trim(planVals[j][2]) });
      }
      break;
    }
    if (!(k in kv)) kv[k] = trim(planVals[i][1]);
  }

  var days = readDays(ss);
  var data = {
    kv: kv,
    title: kv['計畫書標題'],
    retreat: retreat,
    members: readRows(ss, '成員', 1).filter(function (r) { return trim(r[0]); }),
    cost: readCost(ss),
    gear: readGear(ss),
    food: readRows(ss, '伙食', 1).filter(function (r) { return trim(r[0]) && (trim(r[1]) || trim(r[2]) || trim(r[3])); }),
    equip: readRows(ss, '裝備清單', 1).filter(function (r) { return trim(r[2]); }),
    fixed: readFixed(ss),
    days: days,
    points: readOverviewPoints(ss)
  };
  return data;
}

function readRows(ss, name, skip) {
  var sh = ss.getSheetByName(name);
  if (!sh) return [];
  var v = sh.getDataRange().getDisplayValues();
  return v.slice(skip || 0);
}

function readFixed(ss) {
  var out = {};
  readRows(ss, '固定內容', 1).forEach(function (r) {
    if (trim(r[0])) out[trim(r[0])] = trim(r[1]);
  });
  return out;
}

function readCost(ss) {
  var rows = readRows(ss, '費用', 1);
  var items = [], total = '';
  rows.forEach(function (r) {
    var a = trim(r[0]);
    if (!a) return;
    if (a === '每人合計') { total = trim(r[4]); return; }
    items.push({ item: a, sum: trim(r[1]), n: trim(r[2]), per: trim(r[4]), note: trim(r[5]) });
  });
  return { items: items, total: total };
}

function readGear(ss) {
  var sh = ss.getSheetByName('公裝');
  if (!sh) return null;
  var v = sh.getDataRange().getDisplayValues();
  if (!v.length) return null;
  var head = v[0];
  var cols = [];
  for (var c = 3; c < head.length; c++) {
    var h = trim(head[c]);
    if (!h || h === '備註' || /先填成員/.test(h)) continue;
    cols.push({ c: c, name: h });
  }
  var noteCol = head.indexOf('備註');
  var items = [], totals = null;
  for (var r = 1; r < v.length; r++) {
    var a = trim(v[r][0]);
    if (!a) continue;
    if (/^每人背負/.test(a)) { totals = cols.map(function (x) { return trim(v[r][x.c]); }); continue; }
    items.push({
      name: a, qty: trim(v[r][1]), unit: trim(v[r][2]),
      by: cols.map(function (x) { return trim(v[r][x.c]); }),
      note: noteCol >= 0 ? trim(v[r][noteCol]) : ''
    });
  }
  return { people: cols.map(function (x) { return x.name; }), items: items, totals: totals };
}

function readOverviewPoints(ss) {
  var v = readRows(ss, '總覽', 0);
  var start = -1;
  for (var i = 0; i < v.length; i++) if (trim(v[i][0]) === '沿途重點') { start = i + 2; break; }
  var out = {};
  if (start < 0) return out;
  for (var j = start; j < v.length; j++) {
    var d = trim(v[j][0]);
    if (!/^D\d+$/.test(d)) break;
    out[d] = { water: clean(v[j][1]), camp: clean(v[j][2]), comm: clean(v[j][3]), retreat: clean(v[j][4]) };
  }
  return out;
}

/** 讀每日頁（名稱為 D0、D1…），只回傳有資料的天。 */
function readDays(ss) {
  var sheets = ss.getSheets().filter(function (s) { return /^D\d+$/.test(s.getName()); });
  sheets.sort(function (a, b) { return +a.getName().slice(1) - +b.getName().slice(1); });
  var days = [];
  sheets.forEach(function (sh) {
    var d = parseDaySheet(sh.getName(), sh.getDataRange().getDisplayValues());
    if (d && d.rows.length) days.push(d);
  });
  return days;
}

function parseDaySheet(name, v) {
  var head = -1;
  for (var i = 0; i < Math.min(v.length, 15); i++) if (trim(v[i][0]) === '類型') { head = i; break; }
  if (head < 0) return null;
  var H = v[head].map(trim);
  function col(prefix) {
    for (var c = 0; c < H.length; c++) if (H[c].indexOf(prefix) === 0) return c;
    return -1;
  }
  var C = {
    type: col('類型'), name: col('地點'), eta: col('預計抵達'), sh: col('上河'), coef: col('速度係數'),
    custom: col('自訂'), spend: col('花費'), km: col('距離'), up: col('爬升'), down: col('下降'),
    alt: col('海拔'), x97: col('TWD97 X'), y97: col('TWD97 Y'), lat: col('緯度'), lng: col('經度'),
    water: col('水源'), comm: col('通訊點'), camp: col('營地'), retreat: col('撤退點'),
    note: col('備註'), close: col('關門'), est: col('估算'), actual: col('實際')
  };
  var r1 = v[0] || [];
  var info = pairs(r1);
  var route = '';
  for (var k = 0; k < head; k++) if (trim(v[k][0]) === '路線') { route = firstNonEmpty(v[k], 1); break; }

  // 小計：標題列「行走、休息…」與下一列數值
  var sum = {};
  for (var s = 0; s < head; s++) {
    if (trim(v[s][0]) === '行走' && v[s + 1]) {
      v[s].forEach(function (lab, ci) { if (trim(lab)) sum[trim(lab)] = trim(v[s + 1][ci]); });
      break;
    }
  }

  var rows = [], notes = '';
  for (var r = head + 1; r < v.length; r++) {
    var row = v[r];
    if (trim(row[0]) === '備註' && !trim(row[1])) { notes = firstNonEmpty(row, 1); break; }
    var nm = g(row, C.name);
    if (!nm) continue;
    rows.push({
      type: g(row, C.type), name: nm, eta: g(row, C.eta), sh: g(row, C.sh), custom: g(row, C.custom),
      spend: g(row, C.spend), km: g(row, C.km), up: g(row, C.up), down: g(row, C.down), alt: g(row, C.alt),
      x97: g(row, C.x97), y97: g(row, C.y97), lat: g(row, C.lat), lng: g(row, C.lng),
      water: isTrue(g(row, C.water)), comm: isTrue(g(row, C.comm)), camp: isTrue(g(row, C.camp)),
      retreat: isTrue(g(row, C.retreat)),
      note: g(row, C.note), close: g(row, C.close), est: g(row, C.est)
    });
  }
  return {
    sheet: name,
    day: info['天數'] || name.slice(1),
    date: info['日期'] || '',
    sunrise: info['日出'] || '',
    sunset: info['日落'] || '',
    start: info['出發時間'] || '',
    route: route, sum: sum, rows: rows, notes: notes
  };
}

function pairs(row) {
  var o = {};
  for (var i = 0; i + 1 < row.length; i += 2) if (trim(row[i])) o[trim(row[i])] = trim(row[i + 1]);
  return o;
}
function firstNonEmpty(row, from) {
  for (var i = from; i < row.length; i++) if (trim(row[i])) return trim(row[i]);
  return '';
}
function g(row, c) { return c >= 0 ? trim(row[c]) : ''; }
function trim(s) { return s == null ? '' : String(s).trim(); }
function clean(s) { s = trim(s); return (s === '—' || s === '-') ? '' : s; }
function isTrue(s) { return s === 'TRUE' || s === 'true' || s === '✓' || s === 'V' || s === 'v'; }

/* ───────────────────────── 時間工具 ───────────────────────── */

function toMin(s) {
  var m = /^(\d{1,3}):(\d{2})/.exec(trim(s));
  return m ? (+m[1]) * 60 + (+m[2]) : null;
}
function fmtHM(min) {
  if (min == null) return '';
  var h = Math.floor(min / 60), m = min % 60;
  return h + ':' + (m < 10 ? '0' : '') + m;
}
/** 2024/2/12 (週一) → 2/12（週一） */
function shortDate(s) {
  var m = /(\d{4})\/(\d{1,2})\/(\d{1,2})\s*\((.+?)\)/.exec(s || '');
  if (m) return m[2] + '/' + m[3] + '（' + m[4] + '）';
  return s || '';
}

/** 每列加上累積時間、是否摸黑、是否晚於關門。 */
function decorateDay(d) {
  var sr = toMin(d.sunrise), ss = toMin(d.sunset);
  var firstWalk = -1;
  for (var i = 0; i < d.rows.length; i++) if (d.rows[i].type === '行走') { firstWalk = i; break; }
  var base = null;
  if (firstWalk > 0) base = toMin(d.rows[firstWalk - 1].eta);
  else if (firstWalk === 0) base = toMin(d.start);
  var prev = null, offset = 0;
  d.rows.forEach(function (r, idx) {
    var t = toMin(r.eta);
    if (t != null && prev != null && t < prev) offset += 1440;   // 跨午夜
    if (t != null) prev = t;
    var abs = t == null ? null : t + offset;
    r.cum = (firstWalk >= 0 && idx >= firstWalk && base != null && abs != null) ? fmtHM(abs - base) : '';
    r.dark = (t != null && sr != null && ss != null && (t < sr || t > ss));
    var c = toMin(r.close);
    r.late = (t != null && c != null && t > c);
    r.isEst = (!r.sh && !r.custom && !!r.est && !!r.spend && r.type === '行走');
  });
  return d;
}

/* ───────────────────────── 建立文件 ───────────────────────── */

function buildDoc(doc, data) {
  var body = doc.getBody();
  body.setPageWidth(PAGE.w).setPageHeight(PAGE.h)
      .setMarginTop(PAGE.margin).setMarginBottom(PAGE.margin)
      .setMarginLeft(PAGE.margin).setMarginRight(PAGE.margin);
  var base = {};
  base[DocumentApp.Attribute.FONT_SIZE] = 10;
  body.setAttributes(base);

  var privacy = data.fixed['隱私提醒'];
  if (privacy) {
    var footer = doc.addFooter();
    var fp = footer.getParagraphs()[0] || footer.appendParagraph('');
    fp.setText(privacy);
    fp.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    fp.editAsText().setFontSize(8).setForegroundColor(COLOR.grey);
  }

  // 標題
  var first = body.getParagraphs()[0];
  first.setText(data.title || data.kv['活動名稱'] || '行程計畫書');
  first.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  first.editAsText().setBold(true).setFontSize(16).setForegroundColor(COLOR.title);

  buildMainTable(body, data);

  // 附件一
  body.appendPageBreak();
  sectionTitle(body, '【附件一：個人裝備檢查表】');
  buildEquip(body, data);

  // 附件二
  data.days.forEach(decorateDay);
  if (data.days.length) {
    body.appendPageBreak();
    sectionTitle(body, '【附件二：行程路線】');
    legend(body);
    data.days.forEach(function (d, i) {
      if (i > 0) body.appendPageBreak();
      buildDay(body, d);
    });
  }

  // 附件三
  var pts = collectPoints(data.days);
  if (pts.length) {
    body.appendPageBreak();
    sectionTitle(body, '【附件三：水源、營地、通訊點、撤退點座標】');
    buildPoints(body, pts);
  }
}

function sectionTitle(body, text) {
  var p = body.appendParagraph(text);
  p.editAsText().setBold(true).setFontSize(13).setForegroundColor(COLOR.title);
  p.setSpacingAfter(4);
  return p;
}

function para(container, text, opt) {
  var p = container.appendParagraph(text || '');
  var t = p.editAsText();
  opt = opt || {};
  if (text) {
    t.setFontSize(opt.size || 10);
    if (opt.bold) t.setBold(true);
    if (opt.color) t.setForegroundColor(opt.color);
  }
  p.setSpacingBefore(0).setSpacingAfter(opt.after || 0);
  return p;
}

/** 表格共用樣式 */
function styleTable(t, widths, size) {
  t.setBorderColor(COLOR.border).setBorderWidth(0.5);
  if (widths) widths.forEach(function (w, i) { t.setColumnWidth(i, w); });
  for (var r = 0; r < t.getNumRows(); r++) {
    var row = t.getRow(r);
    for (var c = 0; c < row.getNumCells(); c++) {
      var cell = row.getCell(c);
      cell.setPaddingTop(1).setPaddingBottom(1).setPaddingLeft(3).setPaddingRight(3);
      cell.editAsText().setFontSize(size || 9);
    }
  }
  return t;
}

function headRow(t, bg) {
  var row = t.getRow(0);
  for (var c = 0; c < row.getNumCells(); c++) {
    var cell = row.getCell(c);
    cell.setBackgroundColor(bg || COLOR.head);
    cell.editAsText().setBold(true);
  }
}

/** 在儲存格裡放一個子表格，並移除子表格前的空白段落。 */
function nestTable(cell, rows, widths, size) {
  var t = cell.appendTable(rows);
  styleTable(t, widths, size || 8);
  headRow(t, COLOR.sub);
  return t;
}

/* ─────────── 主表 ─────────── */

function buildMainTable(body, data) {
  var kv = data.kv, fx = data.fixed;
  var LW = 96, VW = CONTENT_W - LW;
  var rows = [];   // {label, text, table: fn(cell)}

  function add(label, text, tableFn) {
    if (!trim(text) && !tableFn) return;
    rows.push({ label: label, text: trim(text), table: tableFn });
  }
  function lines(arr) { return arr.filter(function (x) { return trim(x); }).join('\n'); }
  function lv(label, key) { return trim(kv[key || label]) ? (label + '：' + kv[key || label]) : ''; }

  add('活動日期', kv['活動日期']);
  add('集合時間地點', kv['集合時間地點']);
  add('入山／出口', lines([lv('入山處'), lv('出口處')]));
  add('車輛安排', kv['車輛安排']);

  if (data.members.length) {
    add('參加人員', '共 ' + data.members.length + ' 人', function (cell) {
      var t = [['姓名', '手機', '緊急聯絡人', '緊急聯絡人電話', '個人要準備的公裝']];
      data.members.forEach(function (m) { t.push([m[0], m[1], m[2], m[3], m[4]].map(trim)); });
      nestTable(cell, t, [44, 64, 52, 66, VW - 6 - 226]);
    });
  }

  if (data.cost.items.length) {
    add('費用', data.cost.total ? ('每人合計：$' + data.cost.total) : '', function (cell) {
      var t = [['項目', '總額', '每人', '備註']];
      data.cost.items.forEach(function (c) {
        t.push([c.item, c.sum ? ('$' + c.sum) : '', c.per ? ('$' + c.per) : '', c.note]);
      });
      nestTable(cell, t, [170, 52, 46, VW - 6 - 268]);
    });
  }

  add('申請編號', lines([lv('入園申請編號'), lv('入山申請編號'), lv('山屋營地申請')]));
  add('氣象概況', kv['氣象概況']);
  add('隊伍分工', lines(['領隊', '壓隊', '跟留守人回報', '紀錄', '氣象', '保險'].map(function (k) { return lv(k); })));
  add('下山與管制時間', lines([
    lv('預計下山', '預計下山時間'),
    trim(kv['山難管制時間']) ? ('山難管制：' + kv['山難管制時間'] + '（超過此時間未聯絡，留守人啟動通報）') : ''
  ]));
  add('留守人', lines([trim(kv['留守人']) + (trim(kv['留守人電話']) ? '　' + kv['留守人電話'] : ''), lv('回報方式')]));
  add('留守人職責', fx['留守人職責']);
  add('留守平台 MapShare', lines([
    kv['衛星通訊機'],
    lv('MapShare', 'MapShare 網址'),
    lv('密碼', 'MapShare 密碼'),
    kv['MapShare 說明']
  ]));

  var routeLines = data.days.map(function (d) {
    return d.sheet + ' ' + shortDate(d.date) + '：' + d.route;
  }).filter(function (s) { return !/：$/.test(s); });
  if (routeLines.length) routeLines.push('詳細行程請看【附件二：行程路線】');
  add('行程路線', routeLines.join('\n'));

  add('伙食', kv['伙食說明'], data.food.length ? function (cell) {
    var t = [['天', '早餐', '午餐', '晚餐']];
    data.food.forEach(function (f) { t.push([f[0], f[1], f[2], f[3]].map(trim)); });
    var w = Math.floor((VW - 6 - 36) / 3);
    nestTable(cell, t, [36, w, w, w]);
  } : null);

  add('水源', pointLines(data, 'water', '座標請看【附件三】'));
  add('營地／山屋', pointLines(data, 'camp', ''));
  add('帳篷床位分配', kv['帳篷床位分配']);

  if (data.gear && data.gear.items.length) {
    var gearIntro = lines([kv['公裝補充說明'], '下表是公裝分配，讓大家知道自己要背的公裝重量，不是每個人要攜帶的東西。']);
    add('公裝', gearIntro, function (cell) {
      var g = data.gear;
      var head = ['公裝', '數目', '單重 (g)'].concat(g.people);
      var t = [head];
      g.items.forEach(function (it) {
        t.push([it.name + (it.note ? '（' + it.note + '）' : ''), it.qty, it.unit].concat(it.by));
      });
      if (g.totals) t.push(['每人背負重量 (g)', '', ''].concat(g.totals));
      var pw = Math.max(30, Math.min(44, Math.floor((VW - 6 - 150) / Math.max(1, g.people.length))));
      var nameW = VW - 6 - 24 - 34 - pw * g.people.length;
      var tbl = nestTable(cell, t, [nameW, 24, 34].concat(g.people.map(function () { return pw; })), 7.5);
      if (g.totals) {
        var last = tbl.getRow(tbl.getNumRows() - 1);
        for (var c = 0; c < last.getNumCells(); c++) last.getCell(c).editAsText().setBold(true);
      }
    });
  }

  add('個人裝備', lines(['請參閱【附件一：個人裝備檢查表】', kv['個人裝備補充']]));
  add('急救包內容', fx['急救包內容']);
  add('手機通訊點', lines([kv['手機通訊點'], pointLines(data, 'comm', '')]));
  add('無線電頻率', lines([
    (trim(kv['無線電主頻']) ? '主頻 ' + kv['無線電主頻'] : '') + (trim(kv['無線電副頻']) ? '　副頻 ' + kv['無線電副頻'] : ''),
    kv['區域無線電頻率'],
    fx['呼叫頻率']
  ]));

  var rt = data.retreat.filter(function (r) { return r.point || r.note; });
  add('撤退／應變計劃', kv['撤退/應變計劃'], rt.length ? function (cell) {
    var t = [['天', '撤退點', '撤退路線與說明']];
    rt.forEach(function (r) { t.push([r.day, r.point, r.note]); });
    nestTable(cell, t, [30, 120, VW - 6 - 150]);
  } : null);

  add('求援流程', fx['求援流程']);
  add('團隊公約', fx['團隊公約']);
  add('注意事項', kv['注意事項']);

  var table = body.appendTable(rows.map(function (r) { return [r.label, r.text]; }));
  styleTable(table, [LW, VW], 9.5);
  for (var i = 0; i < rows.length; i++) {
    var row = table.getRow(i);
    var lc = row.getCell(0), vc = row.getCell(1);
    lc.setBackgroundColor(COLOR.label).setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
    lc.editAsText().setBold(true).setForegroundColor(COLOR.labelText);
    if (rows[i].table) {
      rows[i].table(vc);
      if (!rows[i].text) removeLeadingEmpty(vc);
    }
  }
}

function removeLeadingEmpty(cell) {
  try {
    var c0 = cell.getChild(0);
    if (c0.getType() === DocumentApp.ElementType.PARAGRAPH && !c0.asParagraph().getText() && cell.getNumChildren() > 1) {
      c0.removeFromParent();
    }
  } catch (e) { /* 無法移除時保留空白行 */ }
}

/** 依天列出水源／營地／通訊點（取自每日頁勾選）。 */
function pointLines(data, key, tail) {
  var out = [];
  data.days.forEach(function (d) {
    var names = [];
    d.rows.forEach(function (r) { if (r[key] && names.indexOf(r.name) < 0) names.push(r.name); });
    if (names.length) out.push(d.sheet + '：' + names.join('、'));
  });
  if (out.length && tail) out.push(tail);
  return out.join('\n');
}

/* ─────────── 附件一 ─────────── */

function buildEquip(body, data) {
  if (data.fixed['裝備準備原則']) para(body, data.fixed['裝備準備原則'], { size: 9, after: 6 });
  if (!data.equip.length) { para(body, '（裝備清單是空的）', { color: COLOR.grey }); return; }
  var t = [['分類', '確認', '品項', '用途及說明']];
  var groups = [];
  data.equip.forEach(function (e) {
    var cat = trim(e[0]) + (trim(e[1]) ? '／' + trim(e[1]) : '');
    var item = trim(e[2]);
    var isGroup = /^【.*】$/.test(item);
    t.push([cat, isGroup ? '' : '☐', item, trim(e[3])]);
    groups.push(isGroup);
  });
  var tbl = body.appendTable(t);
  styleTable(tbl, [78, 30, 150, CONTENT_W - 258], 8.5);
  headRow(tbl, COLOR.head);
  for (var i = 0; i < groups.length; i++) {
    var row = tbl.getRow(i + 1);
    row.getCell(1).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    if (groups[i]) {
      for (var c = 0; c < 4; c++) row.getCell(c).setBackgroundColor(COLOR.sub);
      row.getCell(2).editAsText().setBold(true);
    }
  }
}

/* ─────────── 附件二 ─────────── */

function legend(body) {
  var p = para(body, '灰底：日出前或日落後抵達（需頭燈）　紅字：關門時間，或預計抵達晚於關門　估：沒有上河時間，依坡度估算　藍字：休息、營地、交通', { size: 8, color: COLOR.grey, after: 6 });
  return p;
}

function buildDay(body, d) {
  // 日期路線列（黃底單格表）
  var bar = body.appendTable([[
    d.sheet + '　' + shortDate(d.date) +
    (d.sunrise ? '　日出 ' + d.sunrise : '') + (d.sunset ? '　日落 ' + d.sunset : '') +
    (d.start ? '　出發 ' + d.start : '')
  ], [d.route ? '路線：' + d.route : '']]);
  styleTable(bar, [CONTENT_W], 9);
  bar.getRow(0).getCell(0).setBackgroundColor(COLOR.dayBar).editAsText().setBold(true).setFontSize(10);
  bar.getRow(1).getCell(0).setBackgroundColor(COLOR.dayBar);
  if (!d.route) bar.getRow(1).removeFromParent();

  var hasClose = d.rows.some(function (r) { return r.close; });
  var cols = [
    { h: '抵達', w: 34, f: function (r) { return r.eta; } },
    hasClose ? { h: '關門', w: 32, f: function (r) { return r.close; } } : null,
    { h: '花費', w: 34, f: function (r) { return r.spend === '0' ? '' : (r.isEst ? '估 ' + r.spend : r.spend); } },
    { h: '累積', w: 34, f: function (r) { return r.cum; } },
    { h: '爬升', w: 30, f: function (r) { return r.up; } },
    { h: '下降', w: 30, f: function (r) { return r.down; } },
    { h: '公里', w: 30, f: function (r) { return r.km; } },
    { h: '海拔', w: 32, f: function (r) { return r.alt; } },
    { h: '地點', w: 112, f: function (r) { return r.name; } },
    { h: '上河', w: 28, f: function (r) { return r.sh; } },
    { h: '備註', w: 0, f: function (r) { return r.note; } }
  ].filter(Boolean);
  var used = cols.reduce(function (s, c) { return s + c.w; }, 0);
  cols[cols.length - 1].w = CONTENT_W - used;

  var t = [cols.map(function (c) { return c.h; })];
  d.rows.forEach(function (r) { t.push(cols.map(function (c) { return c.f(r) || ''; })); });
  var tbl = body.appendTable(t);
  styleTable(tbl, cols.map(function (c) { return c.w; }), 8);
  headRow(tbl, COLOR.head);

  var iEta = 0, iClose = hasClose ? 1 : -1;
  var iName = cols.map(function (c) { return c.h; }).indexOf('地點');
  var iSpend = cols.map(function (c) { return c.h; }).indexOf('花費');
  d.rows.forEach(function (r, k) {
    var row = tbl.getRow(k + 1);
    if (r.dark) for (var c = 0; c < row.getNumCells(); c++) row.getCell(c).setBackgroundColor(COLOR.dark);
    if (r.type && r.type !== '行走') row.getCell(iName).editAsText().setBold(true).setForegroundColor(COLOR.blue);
    if (iClose >= 0 && r.close) row.getCell(iClose).editAsText().setForegroundColor(COLOR.red).setBold(true);
    if (r.late) row.getCell(iEta).editAsText().setForegroundColor(COLOR.red).setBold(true);
    if (r.isEst) row.getCell(iSpend).editAsText().setItalic(true).setForegroundColor(COLOR.grey);
  });

  var s = d.sum, parts = [];
  if (s['行走']) parts.push('行走 ' + s['行走']);
  if (s['休息']) parts.push('休息 ' + s['休息']);
  if (s['距離 (km)']) parts.push('距離 ' + s['距離 (km)'] + ' km');
  if (s['爬升 (m)']) parts.push('爬升 ' + s['爬升 (m)'] + ' m');
  if (s['下降 (m)']) parts.push('下降 ' + s['下降 (m)'] + ' m');
  if (s['日落前餘裕 (分)']) parts.push('日落前餘裕 ' + s['日落前餘裕 (分)'] + ' 分');
  if (s['碳水目標 (g)'] && s['碳水目標 (g)'] !== '0') parts.push('碳水目標 ' + s['碳水目標 (g)'] + ' g');
  if (/^\d/.test(s['行動糧重 (g)'] || '')) parts.push('行動糧 ' + s['行動糧重 (g)'] + ' g');
  if (/^\d/.test(s['需水 (ml)'] || '')) parts.push('需水 ' + s['需水 (ml)'] + ' ml');
  if (parts.length) para(body, '小計：' + parts.join('　'), { size: 9, bold: true, color: COLOR.orange, after: 2 });
  if (d.notes) para(body, d.notes, { size: 8.5, after: 4 });
}

/* ─────────── 附件三 ─────────── */

function collectPoints(days) {
  var out = [];
  days.forEach(function (d) {
    d.rows.forEach(function (r) {
      var tags = [];
      if (r.water) tags.push('水源');
      if (r.camp) tags.push('營地');
      if (r.comm) tags.push('通訊');
      if (r.retreat) tags.push('撤退');
      if (!tags.length) return;
      out.push([d.sheet, r.name, tags.join('、'), r.alt, r.x97, r.y97, r.lat, r.lng]);
    });
  });
  return out;
}

function buildPoints(body, pts) {
  var t = [['天', '地點', '類別', '海拔', 'TWD97 X', 'TWD97 Y', '緯度', '經度']].concat(pts);
  var tbl = body.appendTable(t);
  styleTable(tbl, [28, 150, 66, 36, 56, 60, 60, CONTENT_W - 456], 8);
  headRow(tbl, COLOR.head);
  para(body, '座標：TWD97 為二度分帶（中央經線 121°），經緯度為 WGS84。', { size: 8, color: COLOR.grey });
}
