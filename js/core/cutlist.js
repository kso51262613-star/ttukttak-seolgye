// 재단표: 자를 목록 + 원장(통 자재) 배치
import { MATERIALS, KERF, getMaterial, isLinear } from './materials.js';

export function partCutDims(part) {
  const m = MATERIALS[part.material];
  if (!m) return {};
  if (m.kind === 'item') return { count: 1 };
  if (isLinear(part.material)) return { length: Math.round(Math.max(...part.size)) };
  const s = [...part.size].sort((a, b) => b - a);
  return { w: Math.round(s[0]), h: Math.round(s[1]), t: m.thickness };
}

// 길이 자재: 긴 것부터 들어갈 수 있는 첫 원장에 넣는다 (톱날 두께는 조각 사이에만)
export function packLinear(cuts, stock, kerf) {
  const bins = [];
  const oversize = [];
  const sorted = [...cuts].sort((a, b) => b.len - a.len);
  for (const c of sorted) {
    if (c.len > stock) { oversize.push(c); continue; }
    let bin = bins.find(b => b.sum + c.len + kerf * b.cuts.length <= stock);
    if (!bin) { bin = { cuts: [], sum: 0 }; bins.push(bin); }
    bin.cuts.push(c);
    bin.sum += c.len;
  }
  for (const b of bins) {
    b.used = b.sum + kerf * Math.max(0, b.cuts.length - 1);
    b.waste = stock - b.used;
  }
  return { bins, oversize };
}

// 판 자재: 줄(선반) 단위로 채운다. 조각은 90도 돌릴 수 있다.
export function packSheets(pieces, W, H, kerf) {
  const sheets = [];
  const oversize = [];
  const norm = pieces.map(p => ({ ...p, a: Math.max(p.w, p.h), b: Math.min(p.w, p.h) }))
    .sort((x, y) => y.b - x.b || y.a - x.a);

  const orients = p => [[p.a, p.b, false], [p.b, p.a, true]].filter(([w, h]) => w <= W && h <= H);

  function tryPlace(sheet, p) {
    for (const shelf of sheet.shelves) {
      for (const [w, h, rot] of orients(p)) {
        if (shelf.x + w <= W && h <= shelf.h) {
          sheet.placements.push({ x: shelf.x, y: shelf.y, w, h, name: p.name, rot });
          shelf.x += w + kerf;
          return true;
        }
      }
    }
    for (const [w, h, rot] of orients(p).sort((m, n) => m[1] - n[1])) {
      if (sheet.nextY + h <= H) {
        sheet.shelves.push({ y: sheet.nextY, h, x: w + kerf });
        sheet.placements.push({ x: 0, y: sheet.nextY, w, h, name: p.name, rot });
        sheet.nextY += h + kerf;
        return true;
      }
    }
    return false;
  }

  for (const p of norm) {
    if (!orients(p).length) { oversize.push(p); continue; }
    let ok = sheets.some(s => tryPlace(s, p));
    if (!ok) {
      const s = { shelves: [], placements: [], nextY: 0 };
      sheets.push(s);
      tryPlace(s, p);
    }
  }
  return {
    sheets: sheets.map(s => ({
      placements: s.placements,
      usedArea: s.placements.reduce((t, p) => t + p.w * p.h, 0)
    })),
    oversize
  };
}

export function cutList(parts, priceOverrides = {}) {
  const rowsMap = new Map();
  const linearCuts = {};
  const sheetPieces = {};
  const items = {};
  const warnings = [];

  for (const p of parts) {
    const m = MATERIALS[p.material];
    if (!m) continue;
    const d = partCutDims(p);
    let label;
    if (m.kind === 'item') {
      label = '1개 통째로';
      items[p.material] = (items[p.material] || 0) + 1;
    } else if (d.length) {
      label = `${d.length}`;
      (linearCuts[p.material] ||= []).push({ len: d.length, name: p.name });
    } else {
      label = `${d.w} x ${d.h}`;
      (sheetPieces[p.material] ||= []).push({ w: d.w, h: d.h, name: p.name });
    }
    const key = `${p.material}|${label}`;
    const row = rowsMap.get(key) || { key, material: p.material, materialName: m.name, label, count: 0, names: [], notes: [] };
    row.count += 1;
    if (!row.names.includes(p.name)) row.names.push(p.name);
    if (p.note && !row.notes.includes(p.note)) row.notes.push(p.note);
    rowsMap.set(key, row);
  }

  const linear = {};
  const sheets = {};
  const stock = {};
  const addStock = (key, qty) => {
    const mat = getMaterial(key, priceOverrides);
    stock[key] = { name: mat.name, unit: mat.unit, price: mat.price, qty, cost: qty * mat.price };
  };

  for (const [key, cuts] of Object.entries(linearCuts)) {
    const m = MATERIALS[key];
    const kerf = KERF[m.group];
    const r = packLinear(cuts, m.stock, kerf);
    let extra = 0;
    for (const c of r.oversize) {
      extra += Math.ceil(c.len / m.stock);
      warnings.push(`'${c.name}' ${c.len}mm는 ${m.name} 원장 ${m.stock}mm보다 길어요. 이어 붙이거나 긴 자재를 따로 구하세요.`);
    }
    linear[key] = { stock: m.stock, kerf, ...r };
    addStock(key, r.bins.length + extra);
  }
  for (const [key, pieces] of Object.entries(sheetPieces)) {
    const m = MATERIALS[key];
    const kerf = KERF[m.group];
    const [W, H] = m.stock;
    const r = packSheets(pieces, W, H, kerf);
    for (const c of r.oversize) warnings.push(`'${c.name}' ${c.a}x${c.b}mm는 ${m.name} 원장(${W}x${H})보다 커요. 판을 이어 붙여야 해요.`);
    sheets[key] = { stockW: W, stockH: H, kerf, ...r };
    // 원장보다 큰 판은 이어 붙일 만큼 장수를 더한다
    const big = r.oversize.reduce((n, c) => n + Math.min(Math.ceil(c.a / W) * Math.ceil(c.b / H), Math.ceil(c.a / H) * Math.ceil(c.b / W)), 0);
    addStock(key, r.sheets.length + big);
  }
  for (const [key, qty] of Object.entries(items)) addStock(key, qty);

  const rows = [...rowsMap.values()].sort((a, b) => a.material.localeCompare(b.material) || parseFloat(b.label) - parseFloat(a.label));
  return { rows, linear, sheets, items, stock, warnings };
}

// 자재별 원장 사용률 (0~1)
export function usageOf(cut, key) {
  const l = cut.linear[key];
  if (l) {
    const total = l.bins.length * l.stock;
    return total ? l.bins.reduce((t, b) => t + b.used, 0) / total : 1;
  }
  const s = cut.sheets[key];
  if (s) {
    const total = s.sheets.length * s.stockW * s.stockH;
    return total ? s.sheets.reduce((t, sh) => t + sh.usedArea, 0) / total : 1;
  }
  return 1;
}
