// 아래 결과 탭 5개 (도면, 재단표, 준비물·비용, 제작 순서, 당근 판매글)
import { renderDrawing, renderJointTable, renderJointDetails } from './drawing.js';
import { partNumbers, numLabel } from '../core/numbering.js';
import { usageOf } from '../core/cutlist.js';
import { MATERIALS, isLinear } from '../core/materials.js';
import { isRef, partBox } from '../core/model.js';

export const TABS = [
  ['drawing', '도면'],
  ['cut', '재단표'],
  ['bom', '준비물·비용'],
  ['steps', '제작 순서'],
  ['listing', '당근 판매글']
];

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const won = n => `${Math.round(Number(n) || 0).toLocaleString('ko-KR')}원`;

const NOTE = '<p class="note">계산값은 참고용이에요. 실제 자재 크기와 현장에 맞춰 한 번 더 확인하세요.</p>';

function drawingTab(ctx) {
  const sub = ctx.template && ctx.template.id !== 'custom' ? ctx.template.name : '직접 설계';
  const numbers = partNumbers(ctx.parts);
  const joints = ctx.joints || [];
  return `<div class="tab-actions">
      <button data-act="print">인쇄 / PDF 저장</button>
      <button data-act="save-svg">도면 파일(SVG) 저장</button>
      <button data-act="zoom-drawing">크게 보기</button>
    </div>
    <div class="drawing-wrap">${renderDrawing(ctx.parts, { title: ctx.design.title, subtitle: sub, joints, numbers, selectedId: ctx.selectedId })}</div>
    ${renderJointTable(joints, ctx.parts, numbers, { note: ctx.template?.jointNote || '' })}
    ${renderJointDetails(joints, ctx.parts, numbers)}${NOTE}`;
}

// ---------- 재단표 ----------
// 원장 배치 그림: 조각마다 부품 번호와 색(같은 번호 = 같은 색, css 의 --cut-1 … --cut-10), 톱날 자리,
// 남는 부분 빗금, 자 눈금, 자르는 위치. 조각을 누르면 data-act="select-part" 로 그 부품 카드가 뜬다.
export const cutColor = n => ((Math.max(1, Math.round(Number(n)) || 1) - 1) % 10) + 1;

const CUT_LEFT = 60;   // 왼쪽 "1번 본" 자리
const CUT_W = 840;     // 막대 폭
const CUT_ROW = 96;    // 줄 간격: 번호 자리 16 + 막대 44 + 자 눈금 + 자르는 위치 글
const BAR_TOP = 16;    // 줄 안에서 막대 위쪽 (그 위는 좁은 조각 번호 자리)
const BAR_H = 44;
const POS_LINE = 14;   // 자르는 위치 글이 길어 줄을 바꾸면 늘어나는 높이
const r1 = v => Math.round(v * 10) / 10;
// 빗금 무늬 (그림마다 한 번). 남는 부분 rect 의 fill 속성(url(#cut-hatch))으로 칠해서 css 없이도 보인다
const HATCH = '<defs><pattern id="cut-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#faf6ee"/><line x1="0" y1="0" x2="0" y2="7" stroke="#d6cbb6" stroke-width="2.2"/></pattern></defs>';

// 글자 폭 어림(px). 크롬에서 잰 값에 맞춤: 한글·원 숫자·×는 글자 크기만큼, m·w 0.88, 숫자·영문 0.6, ·():, 0.36, 띄어쓰기 0.28
function textWidth(s, size) {
  let w = 0;
  for (const ch of String(s)) {
    w += ch === ' ' ? 0.28 : ch.codePointAt(0) >= 0x1100 || ch === '×' ? 1 : 'mwMW'.includes(ch) ? 0.88 : '·.,:;()|'.includes(ch) ? 0.36 : 0.6;
  }
  return w * size;
}

// 막대 위 한 줄(좁은 조각 번호)이 겹치지 않게 좌우로 민다. 오른쪽 끝을 넘으면 왼쪽으로 당긴다
function spreadLane(items, lo, hi, gap = 6) {
  const list = [...items].sort((a, b) => a.cx - b.cx);
  list.forEach((it, i) => {
    it.x = Math.max(it.cx, lo + it.w / 2);
    if (i) it.x = Math.max(it.x, list[i - 1].x + (list[i - 1].w + it.w) / 2 + gap);
  });
  for (let i = list.length - 1; i >= 0; i--) {
    const it = list[i];
    const next = list[i + 1];
    it.x = Math.min(it.x, next ? next.x - (next.w + it.w) / 2 - gap : hi - it.w / 2);
  }
  return list;
}

// 조각 안 글자: 70 이상이면 "① 좌판 1200", 36 이상이면 "① 1200"(안 들어가면 작은 글자로), 그보다 좁으면 막대 위에 번호만
function segLabel(tag, name, len, w) {
  const full = [tag, name, len].filter(Boolean).join(' ');
  const short = [tag, len].filter(Boolean).join(' ');
  if (w >= 70 && textWidth(full, 12) + 4 <= w) return { text: full, cls: 'cut-lab' };
  if (w >= 36 && textWidth(short, 12) + 4 <= w) return { text: short, cls: 'cut-lab' };
  if (w >= 36 && textWidth(short, 10) + 4 <= w) return { text: short, cls: 'cut-lab cut-lab-s' };
  return null;
}

// 긴 자재(각재·각파이프·평철) 한 종류의 원장 그림. 원장 하나가 한 줄
export function linearSvg(key, l, { numbers, colorOf = cutColor } = {}) {
  if (!l?.bins?.length) return '';
  const label = numbers?.label || numLabel;
  const k = CUT_W / l.stock;
  const X = mm => CUT_LEFT + mm * k;
  const right = CUT_LEFT + CUT_W;
  const kw = Math.max(1.5, l.kerf * k);
  const step = l.stock <= 2000 ? 250 : 500;
  let top = 0;
  const rows = l.bins.map((b, i) => {
    const y = top + BAR_TOP;
    const mid = r1(y + BAR_H / 2 + 4);
    const back = [`<text class="cut-bar-t" x="0" y="${mid}">${i + 1}번 본</text>`, `<rect class="cut-stock" x="${CUT_LEFT}" y="${y}" width="${CUT_W}" height="${BAR_H}"/>`];
    const kerfs = [];
    const labs = [];
    const lane = [];
    const cuts = [];
    let run = null;   // 붙어 있는 같은 번호 좁은 조각은 막대 위 글 하나("⑦×2")로
    let pos = 0;
    b.cuts.forEach(c => {
      const x = X(pos);
      const w = c.len * k;
      const tag = c.num ? label(c.num) : '';
      const title = [tag, c.name, `${c.len}mm`].filter(Boolean).join(' ');
      back.push(`<rect class="cut-seg" data-act="select-part" data-id="${esc(c.id)}" x="${r1(x)}" y="${y}" width="${r1(w)}" height="${BAR_H}" style="fill:var(--cut-${colorOf(c.num)})"><title>${esc(title)}</title></rect>`);
      const lab = segLabel(tag, c.name, c.len, w);
      if (lab) {
        labs.push(`<text class="${lab.cls}" x="${r1(x + w / 2)}" y="${lab.cls === 'cut-lab' ? mid : r1(mid - 0.5)}" text-anchor="middle">${esc(lab.text)}</text>`);
        run = null;
      } else if (run && run.num === c.num) {
        run.n += 1;
        run.x1 = x + w;
      } else {
        run = { num: c.num, tag, n: 1, x0: x, x1: x + w };
        lane.push(run);
      }
      pos += c.len;
      if (pos < l.stock) {
        cuts.push(pos);
        kerfs.push(`<rect class="cut-kerf" x="${r1(X(pos + l.kerf / 2) - kw / 2)}" y="${y}" width="${r1(kw)}" height="${BAR_H}"/>`);
      }
      pos += l.kerf;
    });
    const above = spreadLane(lane.filter(r => r.tag).map(r => {
      const text = r.n > 1 ? `${r.tag}×${r.n}` : r.tag;
      return { text, w: textWidth(text, 10), cx: (r.x0 + r.x1) / 2 };
    }), CUT_LEFT, right).map(it => `<text class="cut-lab cut-lab-s cut-up" x="${r1(it.x)}" y="${top + 12}" text-anchor="middle">${esc(it.text)}</text>`);
    // 자 눈금: 원장 2000 이하는 250mm, 아니면 500mm. 끝에 원장 길이 (끝 숫자와 붙는 눈금 숫자는 뺀다)
    const ty = y + BAR_H;
    const ticks = [];
    for (let t = 0; t < l.stock; t += step) {
      const x = r1(X(t));
      ticks.push(`<line class="cut-tick" x1="${x}" y1="${ty}" x2="${x}" y2="${ty + 5}"/>`);
      if (right - x >= 30) ticks.push(`<text class="cut-tick-t" x="${x}" y="${ty + 16}" text-anchor="middle">${t}</text>`);
    }
    ticks.push(`<line class="cut-tick" x1="${right}" y1="${ty}" x2="${right}" y2="${ty + 5}"/><text class="cut-tick-t" x="${right}" y="${ty + 16}" text-anchor="middle">${l.stock}</text>`);
    // 자르는 위치(mm): 조각 길이 + 톱날을 더해 간 자리. 막대보다 길면 줄을 바꾼다
    const words = cuts.length ? cuts.map(String) : ['없음 (통째로 써요)'];
    const lines = [];
    let cur = '자르는 위치(mm): ';
    words.forEach((wd, n) => {
      if (n && textWidth(`${cur} · ${wd}`, 11) * 1.05 > CUT_W) { lines.push(`${cur} ·`); cur = wd; }
      else cur += n ? ` · ${wd}` : wd;
    });
    lines.push(cur);
    // 남는 부분: 빗금 + "남음 N mm". 빗금 안에 안 들어가면 자르는 위치 줄 오른쪽 끝에 (모자라면 한 줄 더)
    let wasteTail = '';
    if (b.waste >= 1) {
      const wx = X(b.used);
      const ww = right - wx;
      const t = `남음 ${b.waste}mm`;
      const tw = textWidth(t, 11);
      back.push(`<rect class="cut-waste" x="${r1(wx)}" y="${y}" width="${r1(ww)}" height="${BAR_H}" fill="url(#cut-hatch)"/>`);
      if (ww >= 50 && tw + 6 <= ww) labs.push(`<text class="cut-waste-t" x="${r1(wx + ww / 2)}" y="${mid}" text-anchor="middle">${t}</text>`);
      else {
        if (textWidth(lines[lines.length - 1], 11) * 1.05 + 16 + tw > CUT_W) lines.push('');
        wasteTail = `<text class="cut-waste-t" x="${right}" y="${ty + 30 + (lines.length - 1) * POS_LINE}" text-anchor="end">${t}</text>`;
      }
    }
    const posText = lines.map((t, n) => (t ? `<text class="cut-pos" x="${CUT_LEFT}" y="${ty + 30 + n * POS_LINE}">${esc(t)}</text>` : '')).join('');
    top += CUT_ROW + (lines.length - 1) * POS_LINE;
    return [...back, ...kerfs, ...labs, ...above, ...ticks, posText, wasteTail].join('');
  });
  const name = MATERIALS[key]?.name || key;
  return `<svg class="cutsvg cut-linear" viewBox="0 0 ${CUT_LEFT + CUT_W + 20} ${top + 8}" role="img" aria-label="${esc(name)} 원장 배치">${HATCH}${rows.join('')}</svg>`;
}

// 판 조각 글자: 폭 90 이상이면 "① 선반 판 900x300", 50 이상이면 "① 900x300"(안 들어가면 작은 글자), 그보다 좁으면 번호만.
// 가로로 넣어 보고, 세로로 긴 조각은 세워서도 넣어 본다. 더 많이 들어가는 쪽을 쓴다
function sheetLabel(tag, name, size, x, y, w, h) {
  const full = [tag, name, size].filter(Boolean).join(' ');
  const mid = [tag, size].filter(Boolean).join(' ');
  const fit = (len, thick) => {
    if (len >= 90 && thick >= 16 && textWidth(full, 12) + 8 <= len) return { text: full, cls: 'cut-lab', rank: 3 };
    if (len >= 50 && thick >= 16 && textWidth(mid, 12) + 8 <= len) return { text: mid, cls: 'cut-lab', rank: 2 };
    if (len >= 50 && thick >= 14 && textWidth(mid, 10) + 6 <= len) return { text: mid, cls: 'cut-lab cut-lab-s', rank: 1 };
    return null;
  };
  const flat = fit(w, h);
  const up = h > w ? fit(h, w) : null;
  const cx = r1(x + w / 2);
  const cy = r1(y + h / 2);
  const pick = up && (!flat || up.rank > flat.rank) ? up : flat;
  if (pick) {
    const base = r1(cy + (pick.cls === 'cut-lab' ? 4 : 3.5));
    const turn = pick === up ? ` transform="rotate(-90 ${cx} ${cy})"` : '';
    return `<text class="${pick.cls}" x="${cx}" y="${base}" text-anchor="middle"${turn}>${esc(pick.text)}</text>`;
  }
  if (!tag) return '';
  const small = Math.min(w, h) < 16;
  return `<text class="cut-lab${small ? ' cut-lab-s' : ''}" x="${cx}" y="${r1(cy + (small ? 3.5 : 4))}" text-anchor="middle">${tag}</text>`;
}

// 판재 한 종류의 원장 그림. 판마다 하나. 판 전체를 빗금(남는 부분)으로 깔고 조각을 위에 그린다.
// 톱날은 그리지 않는다 (판재는 목재소 재단 서비스 기준)
export function sheetSvg(key, s, { numbers, colorOf = cutColor } = {}) {
  const label = numbers?.label || numLabel;
  const W = 480;
  const k = W / s.stockW;
  const H = r1(s.stockH * k);
  const name = MATERIALS[key]?.name || key;
  return (s.sheets || []).map((sh, i) => {
    const segs = [];
    const labs = [];
    for (const p of sh.placements) {
      const x = p.x * k;
      const y = p.y * k;
      const w = p.w * k;
      const h = p.h * k;
      const size = `${p.rot ? p.h : p.w}x${p.rot ? p.w : p.h}`;
      const tag = p.num ? label(p.num) : '';
      const title = [tag, p.name, `${size}mm`].filter(Boolean).join(' ');
      segs.push(`<rect class="cut-seg" data-act="select-part" data-id="${esc(p.id)}" x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" style="fill:var(--cut-${colorOf(p.num)})"><title>${esc(title)}</title></rect>`);
      labs.push(sheetLabel(tag, p.name, size, x, y, w, h));
    }
    return `<div class="sheet"><div class="sheet-title">${i + 1}번째 판 (${s.stockW}x${s.stockH})</div>
      <div class="cut-wrap"><svg class="cutsvg cut-sheet" viewBox="-2 -2 ${W + 4} ${r1(H + 4)}" role="img" aria-label="${esc(name)} ${i + 1}번째 판">${HATCH}<rect class="cut-waste" x="0" y="0" width="${W}" height="${H}" fill="url(#cut-hatch)"/>${segs.join('')}${labs.join('')}</svg></div></div>`;
  }).join('');
}

// 조각 표의 가공 칸: 부품 이름별로 그 부품에 뚫는 구멍(연결부 구멍의 parts 에 부품 id 가 있는 것)을 모은다.
// 구멍 자리(at)는 두 부품이 맞닿은 면 위라서 피스·드릴은 반대쪽 면으로 들어간다. 그래서 위아래 축은
// 맞닿은 곳이 부품 아래쪽이면 "윗면", 위쪽이면 "아랫면". 가로 두 축은 "옆면" 하나로 쓴다
// (앞뒤·좌우로 뒤집혀 놓인 같은 부품이 같은 글이 되게). 개수는 부품 하나 기준이고, 같은 이름 부품끼리 다르면 "4~8개"
const FACES = ['윗면', '아랫면', '옆면'];
function holeFace(p, h) {
  if (h.axis !== 1 || !Array.isArray(h.at)) return h.axis === 1 ? '윗면' : '옆면';
  const b = partBox(p);
  const half = (b.max[1] - b.min[1]) / 2;
  return h.at[1] - (b.min[1] + half) > half / 2 ? '아랫면' : '윗면';
}

export function holeNotes(parts, joints) {
  const all = new Map((parts || []).filter(Boolean).map(p => [p.id, p]));
  const real = [...all.values()].filter(p => !isRef(p));
  const metal = id => MATERIALS[all.get(id)?.material]?.group === 'metal';
  const per = new Map();   // 부품 id 마다 Map("면|지름|종류" 별 { n, letters })
  for (const j of joints || []) {
    for (const h of j.holes || []) {
      const ids = h.parts || [];
      const kind = h.depth === 'through' ? (j.type === 'screw' && !ids.every(metal) ? '선구멍' : '관통') : `${h.depth}mm 깊이`;
      for (const id of ids) {
        const p = all.get(id);
        if (!p || isRef(p)) continue;
        const face = holeFace(p, h);
        const key = `${face}|${h.dia}|${kind}`;
        const m = per.get(id) || new Map();
        per.set(id, m);
        const e = m.get(key) || { face, dia: h.dia, kind, n: 0, letters: new Set() };
        m.set(key, e);
        e.n += 1;
        if (j.group) e.letters.add(j.group);
      }
    }
  }
  const out = new Map();
  for (const name of new Set(real.map(p => p.name))) {
    const same = real.filter(p => p.name === name);
    const keys = new Map();
    for (const p of same) {
      for (const [key, e] of per.get(p.id) || []) {
        const t = keys.get(key) || { face: e.face, dia: e.dia, kind: e.kind, letters: new Set() };
        keys.set(key, t);
        e.letters.forEach(x => t.letters.add(x));
      }
    }
    if (!keys.size) { out.set(name, '없음'); continue; }
    const text = [...keys.entries()]
      .sort(([, a], [, b]) => FACES.indexOf(a.face) - FACES.indexOf(b.face) || a.dia - b.dia || a.kind.localeCompare(b.kind, 'ko'))
      .map(([key, t]) => {
        const counts = same.map(p => per.get(p.id)?.get(key)?.n || 0);
        const lo = Math.min(...counts);
        const hi = Math.max(...counts);
        const letters = [...t.letters].sort((a, b) => a.length - b.length || a.localeCompare(b));
        return `${t.face} ⌀${t.dia} ${t.kind} ${lo === hi ? hi : `${lo}~${hi}`}개${letters.length ? ` (상세 ${letters.join(', ')})` : ''}`;
      }).join(', ');
    out.set(name, text);
  }
  return out;
}

// 자재 한 종류의 조각 표: 번호(색 칩) | 부품 | 길이·크기 | 개수 | 가공 | 확인. 같은 이름·길이는 한 줄로 합친다
export function pieceTable(key, pieces, { numbers, notes, checked = {}, colorOf = cutColor } = {}) {
  const label = numbers?.label || numLabel;
  const rows = new Map();
  for (const pc of pieces || []) {
    const byLen = pc.len != null;
    const size = byLen ? String(pc.len) : `${Math.max(pc.w, pc.h)} x ${Math.min(pc.w, pc.h)}`;
    const k = `${pc.name}|${size}`;
    const r = rows.get(k) || { name: pc.name, num: pc.num || numbers?.byName?.get(pc.name), size, mm: byLen ? pc.len : Math.max(pc.w, pc.h), count: 0 };
    r.count += 1;
    rows.set(k, r);
  }
  if (!rows.size) return '';
  const body = [...rows.values()]
    .sort((a, b) => (a.num || 999) - (b.num || 999) || b.mm - a.mm)
    .map(r => {
      const id = `cut:${key}|${r.name}|${r.size}`;
      const no = r.num ? `<span class="cut-chip" style="background:var(--cut-${colorOf(r.num)})"></span>${label(r.num)}` : '';
      return `<tr><td class="cut-no">${no}</td><td>${esc(r.name)}</td><td class="num">${esc(r.size)}</td><td class="num">${r.count}</td><td>${esc(notes?.get?.(r.name) || '없음')}</td>
        <td class="cut-ok"><input type="checkbox" data-act="check" data-id="${esc(id)}" ${checked?.[id] ? 'checked' : ''} aria-label="${esc(`${r.name} ${r.size} 자름`)}"></td></tr>`;
    }).join('');
  const head = isLinear(key) ? '길이(mm)' : '크기(mm)';
  return `<div class="tbl-wrap"><table class="tbl cut-table"><caption>조각 표 (자른 뒤 하나씩 체크)</caption>
    <thead><tr><th>번호</th><th>부품</th><th>${head}</th><th>개수</th><th>가공 (연결부에서 가져옴)</th><th>확인</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function cutTab(ctx) {
  const { cut } = ctx;
  if (!cut.rows.length) return '<p class="empty">자를 부품이 없어요.</p>';
  const numbers = partNumbers(ctx.parts);
  const notes = holeNotes(ctx.parts, ctx.joints || []);
  const opts = { numbers, notes, checked: ctx.design?.checked || {}, colorOf: cutColor };
  const pct = key => Math.round(usageOf(cut, key) * 100);
  const rows = cut.rows.map(r => `<tr><td class="cut-no">${(r.nums || []).map(n => numbers.label(n)).join(', ')}</td><td>${esc(r.materialName)}</td><td class="num">${esc(r.label)}</td><td class="num">${r.count}</td>
    <td>${esc(r.names.join(', '))}</td><td>${esc(r.notes.join(', '))}</td></tr>`).join('');
  const warn = cut.warnings.length ? `<div class="warn">${cut.warnings.map(esc).join('<br>')}</div>` : '';
  // 자재마다 한 덩어리(제목 + 그림 + 조각 표). 인쇄하면 한 장에 들어가게 css 로 묶는다. 통째·양으로 사는 자재는 위 표에만
  const layouts = [
    ...Object.entries(cut.linear).map(([key, l]) => `<section class="cut-mat"><h4>${esc(MATERIALS[key].name)} · 원장 ${l.stock}mm · ${l.bins.length}본 · 사용률 ${pct(key)}%</h4>
      ${l.bins.length ? `<div class="cut-wrap">${linearSvg(key, l, opts)}</div>` : ''}${pieceTable(key, [...l.bins.flatMap(b => b.cuts), ...(l.oversize || [])], opts)}</section>`),
    ...Object.entries(cut.sheets).map(([key, s]) => `<section class="cut-mat"><h4>${esc(MATERIALS[key].name)} · 원장 ${s.stockW}x${s.stockH}mm · ${s.sheets.length}장 · 사용률 ${pct(key)}%</h4>
      ${sheetSvg(key, s, opts)}${pieceTable(key, [...s.sheets.flatMap(sh => sh.placements), ...(s.oversize || [])], opts)}</section>`)
  ].join('');
  return `<div class="tab-actions"><button data-act="print">인쇄</button></div>${warn}
    <div class="tbl-wrap"><table class="tbl cut-sum"><thead><tr><th>번호</th><th>자재</th><th>길이 / 크기(mm)</th><th>개수</th><th>부품</th><th>가공 메모</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${layouts ? `<h3>원장 배치 (낭비 줄이는 자르기 순서)</h3>
    <p class="note">같은 번호는 같은 부품이고 같은 색이에요. 조각을 누르면 그 부품 카드가 떠요. 톱날 두께(목재 3mm, 철 2mm)를 빼고 계산했고, 빗금 친 곳이 남는 부분이에요. 판재는 목재소 재단 서비스에 이 그림을 보여주면 편해요.</p>
    ${layouts}` : ''}${NOTE}`;
}

function checkList(title, items, checked, withCost) {
  if (!items.length) return '';
  const lis = items.map(x => `<li><label><input type="checkbox" data-act="check" data-id="${esc(x.id)}" ${checked[x.id] ? 'checked' : ''}>
    <span class="name">${esc(x.name)}</span>${x.qty ? `<span class="qty">${x.qty}${esc(x.unit || '')}</span>` : ''}
    ${withCost ? `<span class="cost">${x.cost ? won(x.cost) : '-'}</span>` : ''}</label></li>`).join('');
  return `<section class="check"><h3>${title}</h3><ul>${lis}</ul></section>`;
}

// 6m 철재·통 판재는 택배가 안 돼 화물 운임이 따로 든다 (2026-10 조사)
function shippingNote(cut) {
  const heavy = Object.keys(cut?.stock || {}).some(k => {
    const m = MATERIALS[k];
    return m && (m.kind === 'sheet' || (isLinear(k) && m.stock >= 6000));
  });
  // 90x90 같은 굵은 각재 3.6m 도 택배가 안 된다
  const timber = Object.keys(cut?.stock || {}).some(k => MATERIALS[k]?.kind === 'lumber' && Math.min(...(MATERIALS[k].section || [0])) >= 89);
  const masonry = Object.keys(cut?.stock || {}).some(k => MATERIALS[k]?.group === 'masonry');
  let html = heavy ? '<p class="note ship">6m 철재나 통 판재는 인터넷으로 주문하면 택배가 안 돼서 화물 운임(약 8만~10만 원)이 따로 들 수 있어요. 동네 철물점·목재소에서 잘라서 사면 더 쌀 수 있어요.</p>' : '';
  if (timber) html += '<p class="note ship">굵은 각재(90x90) 3.6m 는 택배가 안 돼서 화물비(약 1.5만~2만 원)가 따로 들어요. 가까운 목재소에서 재단해 달라고 하면 차에 실어 올 수 있어요.</p>';
  if (masonry) html += '<p class="note ship">벽돌·레미탈처럼 무거운 자재는 택배로 사면 배송비 때문에 동네 건재상보다 3~5배 비싸요. 가까운 건재상에서 사세요. 적벽돌은 불이 닿는 안쪽에 쓰면 안 돼요(내화벽돌만).</p>';
  return html;
}

function bomTab(ctx) {
  const { bom, design } = ctx;
  const checked = design.checked || {};
  const all = [...bom.materials, ...bom.hardware, ...bom.finish, ...bom.tools, ...bom.safety];
  const done = all.filter(x => checked[x.id]).length;
  return `<div class="tab-actions"><button data-act="print">인쇄</button><button data-act="open-prices">자재 단가 고치기</button></div>
    <div class="progress"><div style="width:${all.length ? (done / all.length) * 100 : 0}%"></div><span>준비 ${done} / ${all.length}</span></div>
    <div class="check-grid">
      ${checkList('자재', bom.materials, checked, true)}
      ${checkList('부속', bom.hardware, checked, true)}
      ${checkList('마감재', bom.finish, checked, true)}
      ${checkList('공구', bom.tools, checked, false)}
      ${checkList('안전장비', bom.safety, checked, false)}
    </div>
    <div class="total">예상 재료비 합계 <b>${won(bom.total)}</b> <small>(자재를 통째로 살 때, 운송비·재단비 별도)</small>
      <div class="used">쓴 만큼만 따지면 약 <b>${won(bom.usedTotal)}</b> <small>(남는 자투리를 다음 작품에 쓸 때)</small></div>
      ${bom.weight >= 1 ? `<div class="used">예상 무게 약 <b>${Math.round(bom.weight).toLocaleString('ko-KR')}kg</b> <small>(참고값${bom.weight > 100 ? ', 혼자 들 수 없는 무게예요' : ''})</small></div>` : ''}</div>${shippingNote(ctx.cut)}${NOTE}`;
}

function stepsTab(ctx) {
  const checked = ctx.design.checked || {};
  const lis = ctx.steps.map((s, i) => `<li><label><input type="checkbox" data-act="check" data-id="step:${i}" ${checked[`step:${i}`] ? 'checked' : ''}><span>${esc(s)}</span></label></li>`).join('');
  return `<div class="tab-actions"><button data-act="print">인쇄</button></div>
    <ol class="steps">${lis}</ol>
    <p class="note">공구를 쓸 때는 보안경과 귀마개를 꼭 쓰세요. 철 작업은 불꽃이 튀니 주변 인화물을 치우고 소화기를 옆에 두세요.</p>`;
}

function listingTab(ctx) {
  const { design, listing, bom, suggested, market, marketNote } = ctx;
  return `<div class="listing-grid">
    <div class="price-box">
      <h3>가격 정하기</h3>
      <label>재료비 <b>${won(bom.total)}</b> <small class="muted">(쓴 만큼만 따지면 ${won(bom.usedTotal)})</small></label>
      <label>작업 시간 <input type="number" min="0" step="0.5" data-field="laborHours" value="${Number(design.laborHours) || 0}"> 시간</label>
      <label>시간당 내 품삯 <input type="number" min="0" step="1000" data-field="hourlyRate" value="${Number(design.hourlyRate) || 0}"> 원</label>
      <div class="suggest">추천 가격 <b>${won(suggested)}</b></div>
      <label>판매 가격 <input type="number" min="0" step="1000" data-field="price" value="${Number(design.price ?? suggested) || 0}"> 원</label>
      ${market ? `<p class="note">조사한 당근 수제품 시세: ${esc(market)} (추정값, 실제 매물로 다시 확인하세요)</p>` : ''}
      ${!market && marketNote ? `<p class="note">${esc(marketNote)}</p>` : ''}
      <p class="note">추천 가격 = 재료비 + 작업 시간 x 품삯. 처음엔 시세 안에서 올려 보고 반응(관심·채팅 수)을 기록해 보세요.</p>
    </div>
    <div class="post-box">
      <h3>판매글 초안</h3>
      <label>제목<input type="text" readonly value="${esc(listing.title)}" class="listing-title"></label>
      <label>본문<textarea readonly rows="14" class="listing-body">${esc(listing.body)}</textarea></label>
      <div class="tab-actions"><button data-act="copy-listing">제목+본문 복사</button><button data-act="save-png">3D 사진 저장</button></div>
      <p class="note">실제 완성품 사진을 꼭 함께 올리세요. 3D 사진은 주문 제작 안내용으로만 쓰세요.</p>
    </div>
  </div>`;
}

export function renderTab(name, ctx) {
  switch (name) {
    case 'cut': return cutTab(ctx);
    case 'bom': return bomTab(ctx);
    case 'steps': return stepsTab(ctx);
    case 'listing': return listingTab(ctx);
    default: return drawingTab(ctx);
  }
}
