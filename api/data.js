// Vercel Serverless Function: đọc Google Sheet "Demo9" (tab Du_lieu_sach) mỗi lần được gọi,
// chuẩn hóa dữ liệu và trả JSON cho dashboard. Không lưu cache.
'use strict';

const DEFAULT_SHEET_ID = '14mQ7rowOPXZt8WEo7Ik3M6K1jIXtLkTYY8DIibwpFUk'; // Demo9
const DEFAULT_GID = '0'; // tab Du_lieu_sach

// Tên cột bắt buộc trong tab Du_lieu_sach (đọc theo tên, không theo vị trí)
const COLS = {
  date: 'Ngày đơn hàng', order: 'Mã đơn hàng', dept: 'Phòng kinh doanh', region: 'Khu vực',
  group: 'Nhóm sản phẩm', product: 'Tên sản phẩm', qty: 'Số lượng', price: 'Đơn giá (VND)',
  disc: 'Chiết khấu (%)', rev: 'Doanh thu (VND)', cost: 'Giá vốn (VND)', status: 'Trạng thái đơn',
  valid: 'Hợp lệ tính KQKD', flag: 'Cờ lỗi', note: 'Ghi chú làm sạch'
};
const OPTIONAL = new Set(['flag', 'note']);
const REGIONS = ['Miền Bắc', 'Miền Trung', 'Miền Nam'];
const STATUS_MAP = { 'hoàn thành': 'Hoàn thành', 'hoàn tất': 'Hoàn thành', 'đang xử lý': 'Đang xử lý', 'đã hủy': 'Đã hủy', 'đã huỷ': 'Đã hủy' };

function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const strip = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();

// Số theo định dạng Việt Nam (65.000 ; 0,05 ; 5%) hoặc quốc tế (65000 ; 0.05)
function num(s) {
  if (s == null) return null;
  let t = String(s).replace(/[\s ₫]|VND/gi, '');
  if (t === '' || t === '-') return null;
  let pct = false;
  if (t.endsWith('%')) { pct = true; t = t.slice(0, -1); }
  let v;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) v = parseFloat(t.replace(/\./g, '').replace(',', '.'));
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) v = parseFloat(t.replace(/,/g, ''));
  else if (/^-?\d+,\d+$/.test(t)) v = parseFloat(t.replace(',', '.'));
  else if (/^-?\d+(\.\d+)?$/.test(t)) v = parseFloat(t);
  else return NaN;
  return pct ? v / 100 : v;
}
function date(s) {
  const t = String(s || '').trim(); let m;
  if ((m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

async function loadSheet() {
  const id = process.env.SHEET_ID || DEFAULT_SHEET_ID, gid = process.env.SHEET_GID || DEFAULT_GID;
  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}&_=${Date.now()}`;
  const r = await fetch(url, { redirect: 'follow', headers: { 'Cache-Control': 'no-cache' } });
  const ct = r.headers.get('content-type') || '';
  if (!r.ok || !/csv|text\/plain/.test(ct)) {
    const e = new Error('Không đọc được Google Sheet (HTTP ' + r.status + '). Kiểm tra file đã được chia sẻ "Bất kỳ ai có đường liên kết – Người xem".');
    e.status = 502; throw e;
  }
  return parseCSV(await r.text());
}

function build(table) {
  const head = (table[0] || []).map(h => h.trim());
  const idx = {}, missing = [];
  for (const [k, name] of Object.entries(COLS)) {
    idx[k] = head.indexOf(name);
    if (idx[k] < 0 && !OPTIONAL.has(k)) missing.push(name);
  }
  if (missing.length) { const e = new Error('Thiếu cột trong tab Du_lieu_sach: ' + missing.join(', ')); e.status = 422; throw e; }
  const get = (r, k) => (idx[k] >= 0 ? (r[idx[k]] || '').trim() : '');
  const rows = [], issues = [], seen = new Map();
  table.slice(1).forEach((r, i) => {
    if (!r.some(c => c && c.trim())) return;
    const line = i + 2;
    const regionRaw = get(r, 'region');
    const region = REGIONS.find(x => strip(x) === strip(regionRaw)) || regionRaw;
    const statusRaw = get(r, 'status');
    const status = STATUS_MAP[statusRaw.toLowerCase()] || statusRaw || 'Chưa xác định';
    const o = {
      line, date: date(get(r, 'date')), order: get(r, 'order').toUpperCase(), dept: get(r, 'dept'), region,
      group: get(r, 'group'), product: get(r, 'product'), qty: num(get(r, 'qty')), price: num(get(r, 'price')),
      disc: num(get(r, 'disc')), rev: num(get(r, 'rev')), cost: num(get(r, 'cost')), status,
      sheetValid: strip(get(r, 'valid')) === 'co', flag: get(r, 'flag'), note: get(r, 'note')
    };
    // Kiểm tra độc lập theo quy tắc đã thống nhất
    const why = [];
    if (!o.date) why.push('ngày không hợp lệ');
    if (o.qty == null || !(o.qty > 0)) why.push('thiếu/sai số lượng');
    if (o.price == null || !(o.price > 0)) why.push('thiếu/sai đơn giá');
    if (o.disc == null || isNaN(o.disc) || o.disc < 0 || o.disc >= 1) why.push('chiết khấu không hợp lệ');
    if (o.rev == null || isNaN(o.rev)) why.push('thiếu doanh thu');
    if (o.cost == null || isNaN(o.cost)) why.push('thiếu giá vốn');
    if (!why.length && Math.abs(o.rev - o.price * o.qty * (1 - o.disc)) > 1) why.push('doanh thu lệch công thức');
    if (seen.has(o.order)) why.push('trùng mã đơn với dòng ' + seen.get(o.order)); else seen.set(o.order, line);
    if (!REGIONS.includes(region)) why.push('khu vực ngoài danh mục');
    o.ruleOk = !why.length && status === 'Hoàn thành';
    o.problems = why;
    // KPI chỉ tính khi CẢ cột "Hợp lệ tính KQKD" = Có VÀ đạt kiểm tra độc lập
    o.valid = o.sheetValid && o.ruleOk;
    if (o.sheetValid !== o.ruleOk) issues.push({ line, order: o.order, sheet: o.sheetValid ? 'Có' : 'Không', rule: o.ruleOk ? 'Đạt' : 'Không đạt', reason: why.join('; ') || ('trạng thái: ' + status) });
    rows.push(o);
  });
  return { rows, issues };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const { rows, issues } = build(await loadSheet());
    // Không trả mã nhân viên, mã khách hàng ra trang public
    const out = rows.map(o => ({ l: o.line, d: o.date, o: o.order, dp: o.dept, r: o.region, g: o.group, p: o.product, q: o.qty, pr: o.price, ck: o.disc, rv: o.rev, c: o.cost, s: o.status, v: o.valid, f: o.flag, pb: o.problems }));
    res.status(200).end(JSON.stringify({ ok: true, fetchedAt: new Date().toISOString(), sheet: 'Demo9 / Du_lieu_sach', total: rows.length, issues, rows: out }));
  } catch (e) {
    res.status(e.status || 500).end(JSON.stringify({ ok: false, error: e.message }));
  }
};
module.exports._test = { parseCSV, num, date, build };
