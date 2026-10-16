// 3면도(정면·측면·윗면) SVG + 연결부 표시 + 연결부 표·확대 그림. 모든 뷰가 같은 축척을 쓴다.
// 순수 문자열 함수라 node 에서 검사한다. SVG 안 <style> 은 페이지 전체에 먹으므로 class 는 전부 dw- 접두어.
import { bounds, hasRot, partCorners, partBox, isRef } from '../core/model.js';
import { MATERIALS, materialProfile, longAxis } from '../core/materials.js';
import { describeMethod, describeHoles, TYPE_NAMES } from '../core/joints.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const r2 = v => Math.round(v * 100) / 100;
const nice = n => Math.round(n);
const MIN_PX = 1.2; // 아무리 작은 부품도 이만큼은 그린다
// 누른 부품 강조 색. <style> 에 .dw-sel 규칙을 두면 선택이 없어도 'dw-sel' 글자가 생기므로
// 강조 색은 선택된 도형의 style 속성으로 넣는다 (class 규칙보다 앞선다). class 의 dw-sel 은 선택 표시용
const SEL_STYLE = 'stroke:#ff7a1a;stroke-width:2.2;fill:#fff1e0';

// 볼록 껍질 (monotone chain). 기울인 부품을 뷰에 비춘 꼭짓점들의 바깥 모양
function convexHull(points) {
  const pts = [...new Map(points.map(([x, y]) => [`${r2(x)},${r2(y)}`, [x, y]])).values()]
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = list => {
    const out = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    return out;
  };
  const lower = half(pts);
  const upper = half([...pts].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

// 뷰마다 [가로축, 세로축, 깊이축(가까운 쪽이 큰 값)]
export const VIEWS = {
  front: { title: '정면도', axes: [0, 1, 2], flipV: true },
  side: { title: '측면도 (오른쪽)', axes: [2, 1, 0], flipV: true, flipH: true },
  top: { title: '평면도 (위에서)', axes: [0, 2, 1], flipV: false }
};
// 구멍 축(맞닿은 면의 축)을 정면으로 보는 뷰
export const VIEW_FOR_AXIS = { 0: 'side', 1: 'top', 2: 'front' };

// 세계 좌표(mm) → 이 뷰의 그림 좌표
export function projector(key, b, ox, oy, scale) {
  const v = VIEWS[key];
  const [ah, av, ad] = v.axes;
  const toX = val => v.flipH ? ox + (b.max[ah] - val) * scale : ox + (val - b.min[ah]) * scale;
  const toY = val => v.flipV ? oy + (b.max[av] - val) * scale : oy + (val - b.min[av]) * scale;
  return { key, v, ah, av, ad, ox, oy, scale, toX, toY, W: b.size[ah] * scale, H: b.size[av] * scale, pt: p => [toX(p[ah]), toY(p[av])] };
}

// 치수선. d 를 주면 class·화살표·선 색·글자 색을 바꾼다 (누른 부품 치수)
const DIM = { cls: 'dw-dim', arrow: 'arr', ls: '', ts: '' };
function dimH(x1, x2, y, label, d = DIM) {
  return `<g class="${d.cls}"><line${d.ls} x1="${r2(x1)}" y1="${r2(y)}" x2="${r2(x2)}" y2="${r2(y)}" marker-start="url(#${d.arrow})" marker-end="url(#${d.arrow})"/>
  <line${d.ls} x1="${r2(x1)}" y1="${r2(y - 6)}" x2="${r2(x1)}" y2="${r2(y + 6)}"/><line${d.ls} x1="${r2(x2)}" y1="${r2(y - 6)}" x2="${r2(x2)}" y2="${r2(y + 6)}"/>
  <text${d.ts} x="${r2((x1 + x2) / 2)}" y="${r2(y - 6)}" text-anchor="middle">${label}</text></g>`;
}
function dimV(y1, y2, x, label, d = DIM) {
  const my = (y1 + y2) / 2;
  return `<g class="${d.cls}"><line${d.ls} x1="${r2(x)}" y1="${r2(y1)}" x2="${r2(x)}" y2="${r2(y2)}" marker-start="url(#${d.arrow})" marker-end="url(#${d.arrow})"/>
  <line${d.ls} x1="${r2(x - 6)}" y1="${r2(y1)}" x2="${r2(x + 6)}" y2="${r2(y1)}"/><line${d.ls} x1="${r2(x - 6)}" y1="${r2(y2)}" x2="${r2(x + 6)}" y2="${r2(y2)}"/>
  <text${d.ts} x="${r2(x - 8)}" y="${r2(my)}" text-anchor="middle" transform="rotate(-90 ${r2(x - 8)} ${r2(my)})">${label}</text></g>`;
}
// 누른 부품 치수는 주황. 색은 속성으로 넣는다 (<style> 에 규칙을 두면 선택이 없어도 'dw-pdim' 글자가 생긴다)
const PDIM = { cls: 'dw-dim dw-pdim', arrow: 'arrp', ls: ' style="stroke:#d35400"', ts: ' style="fill:#d35400"' };

const fillOf = p => MATERIALS[p.material]?.group === 'metal' ? '#e3e6ea' : '#fbf3e4';
const rectXY = (p, P) => {
  const xa = P.toX(p.pos[P.ah] - p.size[P.ah] / 2);
  const xb = P.toX(p.pos[P.ah] + p.size[P.ah] / 2);
  const ya = P.toY(p.pos[P.av] - p.size[P.av] / 2);
  const yb = P.toY(p.pos[P.av] + p.size[P.av] / 2);
  return { x: r2(Math.min(xa, xb)), y: r2(Math.min(ya, yb)), w: r2(Math.max(MIN_PX, Math.abs(xb - xa))), h: r2(Math.max(MIN_PX, Math.abs(yb - ya))) };
};

// 부품 하나를 이 뷰에 그린다 (기울인 부품은 다각형, 둥근 부품은 원, 캐스터·아치는 전용 모양)
function shapeOf(p, P, cls, attrs) {
  const fill = fillOf(p);
  const title = `<title>${esc(p.name)} ${p.size.map(nice).join('x')}</title>`;
  if (hasRot(p)) {
    const hull = convexHull(partCorners(p).map(c => [P.toX(c[P.ah]), P.toY(c[P.av])]));
    return `<polygon points="${hull.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ')}" fill="${fill}" class="${cls}"${attrs}>${title}</polygon>`;
  }
  if (isRef(p)) {
    const r = rectXY(p, P);
    return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" class="dw-ref"><title>${esc(p.name)} (참고용)</title></rect>`;
  }
  const round = p.shape === 'cylinder' || p.shape === 'wheel' || (p.shape !== 'barrel' && materialProfile(p.material) === 'round');
  const axis = p.shape === 'cylinder' ? 1 : p.shape === 'wheel' ? 0 : longAxis(p.size);
  if (round && axis === P.ad) {
    const r = (Math.min(p.size[P.ah], p.size[P.av]) / 2) * P.scale;
    return `<circle cx="${r2(P.toX(p.pos[P.ah]))}" cy="${r2(P.toY(p.pos[P.av]))}" r="${r2(Math.max(MIN_PX, r))}" fill="${fill}" class="${cls}"${attrs}>${title}</circle>`;
  }
  if (p.shape === 'caster' && P.ad === 0) {
    const R = p.size[2] / 2;
    const base = p.pos[1] - p.size[1] / 2;
    const cx = P.toX(p.pos[2]);
    const cy = P.toY(base + R);
    const half = R * 0.45;
    const xa2 = P.toX(p.pos[2] - half);
    const xb2 = P.toX(p.pos[2] + half);
    const yTop = P.toY(base + p.size[1]);
    return `<rect x="${r2(Math.min(xa2, xb2))}" y="${r2(Math.min(yTop, cy))}" width="${r2(Math.abs(xb2 - xa2))}" height="${r2(Math.abs(cy - yTop))}" fill="${fill}" class="${cls}"${attrs}/>`
      + `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(R * P.scale)}" fill="${fill}" class="${cls}"${attrs}>${title}</circle>`;
  }
  if (p.shape === 'barrel' && P.ad === 2) {
    const cx = P.toX(p.pos[0]);
    const yb = P.toY(p.pos[1] - p.size[1] / 2);
    const R = (p.size[0] / 2) * P.scale;
    const r = Number(p.wall) > 0 ? Math.max(0, (p.size[0] / 2 - p.wall) * P.scale) : 0;
    const d = r > 0
      ? `M ${cx - R} ${yb} A ${R} ${R} 0 0 1 ${cx + R} ${yb} L ${cx + r} ${yb} A ${r} ${r} 0 0 0 ${cx - r} ${yb} Z`
      : `M ${cx - R} ${yb} A ${R} ${R} 0 0 1 ${cx + R} ${yb} Z`;
    return `<path d="${d}" fill="${fill}" class="${cls}"${attrs}>${title}</path>`;
  }
  const r = rectXY(p, P);
  return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${fill}" class="${cls}"${attrs}>${title}</rect>`;
}

// 한 뷰: 제목, 부품(먼 것부터), 선택 이름표, 전체 치수 2개. 연결부 표시는 Task 6 의 renderJointMarks 가 덧붙인다
function renderView(parts, b, dims, key, ox, oy, scale, { numbers, selectedId, jointSel, joints, placed }) {
  const P = projector(key, b, ox, oy, scale);
  const near = p => partBox(p).max[P.ad];
  const sorted = [...parts].sort((p, q) => (isRef(q) - isRef(p)) || near(p) - near(q));
  let out = `<text class="dw-vtitle" x="${r2(ox)}" y="${r2(oy - 34)}">${P.v.title}</text>`;
  let label = '';
  let hi = '';
  for (const p of sorted) {
    const sel = selectedId && p.id === selectedId;
    const cls = isRef(p) ? 'dw-ref' : sel ? 'dw-part dw-sel' : 'dw-part';
    const attrs = isRef(p) ? '' : ` data-act="pick-part" data-id="${esc(p.id)}"${sel ? ` style="${SEL_STYLE}"` : ''}`;
    out += shapeOf(p, P, cls, attrs);
    if (sel) {
      // 가까운 부품에 가려도 보이게 테두리만 맨 위에 한 번 더 그린다 (누르기는 아래 도형이 받는다)
      if (!isRef(p)) hi = shapeOf(p, P, 'dw-hi', '');
      const [cx, cy] = P.pt(p.pos);
      label = `<text class="dw-label" x="${r2(cx)}" y="${r2(cy - 8)}" text-anchor="middle">${esc(numbers ? numbers.tag(p) : p.name)}</text>`;
    }
  }
  out += hi;
  out += renderJointMarks(joints, parts, P, selectedId, placed, jointSel);
  // 누른 부품(기울지 않은 것)의 자기 치수: 가로는 부품 아래 12, 세로는 부품 왼쪽 12
  const picked = selectedId ? parts.find(p => p.id === selectedId) : null;
  if (picked && !hasRot(picked)) {
    const r = rectXY(picked, P);
    out += dimH(r.x, r.x + r.w, r.y + r.h + 12, `${nice(picked.size[P.ah])}`, PDIM);
    out += dimV(r.y, r.y + r.h, r.x - 12, `${nice(picked.size[P.av])}`, PDIM);
  }
  out += label;
  out += dimH(P.toX(dims.min[P.ah]), P.toX(dims.max[P.ah]), oy + P.H + 26, `${nice(dims.size[P.ah])}`);
  out += dimV(P.toY(dims.max[P.av]), P.toY(dims.min[P.av]), ox - 22, `${nice(dims.size[P.av])}`);
  return out;
}

// 배치: 정면+측면 한 줄(폭 900 안), 평면도 아래, 제목·범례 상자는 평면도 오른쪽(자리 없으면 아래). 1:1 넘지 않음
export function layout(b, legendLines = 0) {
  const scale = Math.min(840 / Math.max(1, b.size[0] + b.size[2]), 320 / Math.max(1, b.size[1]), 320 / Math.max(1, b.size[2]), 1);
  const padL = 70;
  const padT = 90;
  const gap = 60;
  const fw = b.size[0] * scale;
  const sw = b.size[2] * scale;
  const fh = b.size[1] * scale;
  const th = b.size[2] * scale;
  const frontX = padL;
  const frontY = padT;
  const sideX = frontX + fw + gap;
  const topY = frontY + fh + gap + 30;
  const infoW = 380;
  const infoH = 150 + (legendLines ? 26 + legendLines * 18 : 0);
  const beside = frontX + fw + gap + infoW <= 960;
  const infoX = beside ? frontX + fw + gap : frontX;
  const infoY = beside ? topY : topY + th + 80;
  const totalW = Math.max(sideX + sw + 40, beside ? infoX + infoW + 20 : frontX + Math.max(fw, infoW) + 40, 640);
  const totalH = (beside ? Math.max(topY + th + 60, infoY + infoH) : infoY + infoH) + 20;
  return { scale, frontX, frontY, sideX, topY, infoX, infoY, infoW, infoH, totalW, totalH, fw, sw, fh, th };
}

const STYLE = `<style>
    .dw-part{stroke:#222;stroke-width:1.2}
    .dw-ref,.dw-lg-ref{stroke:#9aa0a6;stroke-width:1;stroke-dasharray:4 3;fill:#f4f5f3}
    .dw-hi{fill:none;stroke:#ff7a1a;stroke-width:1.6;stroke-dasharray:5 3;pointer-events:none}
    .dw-dim line{stroke:#c0392b;stroke-width:1}
    .dw-dim text{fill:#c0392b;font-size:13px;font-weight:600}
    .dw-vtitle{font-size:14px;font-weight:700;fill:#333}
    .dw-info{font-size:12px;fill:#444}
    .dw-label{font-size:13px;font-weight:700;fill:#d35400;paint-order:stroke;stroke:#fff;stroke-width:3px}
    .dw-hole circle,.dw-lg-hole circle{fill:#fff;stroke:#d35400;stroke-width:1.4}
    .dw-hole line,.dw-lg-hole line{stroke:#d35400;stroke-width:1}
    .dw-axis,.dw-lg-axis{stroke:#888;stroke-width:1;stroke-dasharray:4 3}
    .dw-weld,.dw-lg-weld{fill:none;stroke:#555;stroke-width:1.4}
    .dw-mark,.dw-lg-mark{fill:#fff;stroke:#1565c0;stroke-width:1.4}
    .dw-hole,.dw-axis,.dw-weld,.dw-mark{pointer-events:none}
    .dw-bal{cursor:pointer}
    .dw-bal circle,.dw-lg-bal circle{fill:#fff;stroke:#1565c0;stroke-width:1.8}
    .dw-bal text,.dw-lg-bal text{fill:#1565c0;font-size:12px;font-weight:700;text-anchor:middle}
    .dw-lg-bal text{font-size:9px}
    .dw-bal line{stroke:#1565c0;stroke-width:1}
    .dw-faded{opacity:.35}
    .dw-legend{font-size:12px;fill:#444}
    .dw-a{fill-opacity:.8}
    .dw-ghost{opacity:.3}
    .dw-hidden{fill:none;stroke:#888;stroke-width:1;stroke-dasharray:4 3}
    .dw-weldline{stroke:#555;stroke-width:2}
    .dw-plabel{font-size:11px;fill:#666}
    .dw-halo{paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round}
    .dw-lead{stroke:#999;stroke-width:.8}
    .dw-lbg{fill:#fff;fill-opacity:.85}
  </style>`;

export function renderDrawing(parts, { title = '', subtitle = '', joints = [], numbers = null, selectedId = null } = {}) {
  if (!parts.length) return '<p class="empty">부품이 없어요. 템플릿을 고르거나 부품을 추가해 주세요.</p>';
  const b = bounds(parts, { includeRef: true });
  const dims = bounds(parts);
  const realCount = parts.filter(p => !isRef(p)).length;
  const vis = (joints || []).filter(j => j.type !== 'none');
  const legend = legendItems(parts, vis);
  const L = layout(b, legend.length);
  const placed = [];
  // 연결부를 고르면(selectedId = 'joint:A') 부품 강조 없이 그 묶음만 진하게, 나머지 연결부는 흐리게
  const jointSel = typeof selectedId === 'string' && selectedId.startsWith('joint:') ? selectedId.slice(6) : null;
  const opts = { numbers, selectedId: jointSel ? null : selectedId, jointSel, joints: vis, placed };
  const ratio = Math.round(1 / L.scale);
  // 참고용 점선 안내: 넷째 줄에 붙이면 상자를 넘으므로 다섯째 줄 끝에. 범례가 있으면 범례가 설명하므로 뺀다
  const refNote = realCount < parts.length && !legend.length ? ' 점선은 참고용(만들지 않음).' : '';
  const legendSvg = legend.length
    ? `<text class="dw-info" x="14" y="${150}" font-weight="700">기호 설명</text>${legend.map((l, i) => `<g transform="translate(14, ${162 + i * 18})">${l.symbol}<text class="dw-legend" x="26" y="4">${esc(l.text)}</text></g>`).join('')}`
    : '';
  return `<svg class="drawing" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(L.totalW)} ${r2(L.totalH)}" font-family="Pretendard, 'Noto Sans KR', sans-serif">
  <defs><marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#c0392b"/></marker><marker id="arrp" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#d35400"/></marker></defs>
  ${STYLE}
  <rect x="1" y="1" width="${r2(L.totalW - 2)}" height="${r2(L.totalH - 2)}" fill="#fff" stroke="#999"/>
  ${renderView(parts, b, dims, 'front', L.frontX, L.frontY, L.scale, opts)}
  ${renderView(parts, b, dims, 'side', L.sideX, L.frontY, L.scale, opts)}
  ${renderView(parts, b, dims, 'top', L.frontX, L.topY, L.scale, opts)}
  <g transform="translate(${r2(L.infoX)}, ${r2(L.infoY)})">
    <rect x="0" y="-20" width="${L.infoW}" height="${L.infoH}" fill="#f7f7f5" stroke="#bbb"/>
    <text x="14" y="8" font-size="16" font-weight="700" fill="#222">${esc(title)}</text>
    <text class="dw-info" x="14" y="32">${esc(subtitle)}</text>
    <text class="dw-info" x="14" y="54">전체 크기: 폭 ${dims.size[0]} x 깊이 ${dims.size[2]} x 높이 ${dims.size[1]} mm</text>
    <text class="dw-info" x="14" y="76">부품 ${realCount}개 · 화면 비율 약 1:${ratio} (인쇄 배율 아님) · 단위 mm</text>
    <text class="dw-info" x="14" y="98">${vis.length ? `연결부 ${vis.length}곳 · 자세한 것은 아래 표와 확대 그림` : '부품별 치수는 재단표를 보세요.'}${refNote}</text>
    <text class="dw-info" x="14" y="118">뚝딱설계 · 참고용 도면, 실제 자재에 맞춰 확인하세요</text>
    ${legendSvg}
  </g>
</svg>`;
}

// ---- 연결부 표시 (풍선·구멍·용접·범례) ----
const BAL_R = 11; // 풍선 반지름

// 용접 이음선이 선으로 보이는 뷰: 맞닿은 면을 정면으로 보는 뷰가 아닌 두 뷰 중 이음선이 더 긴 쪽
function weldView(j) {
  const flat = VIEW_FOR_AXIS[j.face.axis];
  let best = null;
  for (const key of ['front', 'side', 'top']) {
    if (key === flat) continue;
    const [ah, av] = VIEWS[key].axes;
    const seamAxis = ah === j.face.axis ? av : ah;
    const len = j.face.max[seamAxis] - j.face.min[seamAxis];
    if (!best || len > best.len) best = { key, len, seamAxis };
  }
  return best;
}

// 연결부의 기본 보기(풍선을 다는 뷰): 용접은 이음선이 선으로 보이는 뷰, 구멍이 있으면 구멍을 정면으로 보는 뷰
// (끼움의 핀 구멍은 맞닿은 축과 방향이 다르다), 둘 다 아니면 맞닿은 면을 정면으로 보는 뷰
function primaryView(j) {
  if (j.type === 'weld') return weldView(j)?.key;
  return VIEW_FOR_AXIS[j.holes[0]?.axis ?? j.face.axis];
}

// 용접 물결 기호: (cx, cy) 가운데, 이음선 방향으로 톱니 4개 (길이 24)
function zigzag(cx, cy, horizontal) {
  const teeth = Array(4).fill(horizontal ? 'l3 -4 l3 4' : 'l-4 3 l4 3').join(' ');
  return horizontal ? `M${r2(cx - 12)},${r2(cy + 2)} ${teeth}` : `M${r2(cx + 2)},${r2(cy - 12)} ${teeth}`;
}

const hole = (hx, hy, cls) => `<g class="dw-hole${cls}"><circle cx="${r2(hx)}" cy="${r2(hy)}" r="3.5"/><line x1="${r2(hx - 5)}" y1="${r2(hy)}" x2="${r2(hx + 5)}" y2="${r2(hy)}"/><line x1="${r2(hx)}" y1="${r2(hy - 5)}" x2="${r2(hx)}" y2="${r2(hy + 5)}"/></g>`;

// 피스·볼트가 지나가는 구간 (구멍 축 방향 세계 좌표 mm). 피스는 머리 쪽 부품(a) 바깥면에서 받는 쪽으로 부속 길이만큼,
// 볼트·핀은 구멍 가운데 기준. 어느 쪽이든 두 부품 밖(허공)으로는 나가지 않게 자른다. 부속 길이를 모르면 40
function fastenerSpan(j, h, byId) {
  const k = h.axis;
  const len = j.fastener?.len || 40;
  let lo = h.at[k] - len / 2;
  let hi = h.at[k] + len / 2;
  const pa = byId.get(j.a);
  const pb = byId.get(j.b);
  if (!pa || !pb) return [lo, hi];
  const A = partBox(pa);
  const B = partBox(pb);
  if (j.type === 'screw' && j.face.kind === 'face' && k === j.face.axis) {
    const aLow = A.min[k] + A.max[k] < 2 * j.face.center[k]; // a 가 맞닿은 면의 작은 값 쪽에 있나
    [lo, hi] = aLow ? [A.min[k], A.min[k] + len] : [A.max[k] - len, A.max[k]];
  }
  const min = Math.min(A.min[k], B.min[k]);
  const max = Math.max(A.max[k], B.max[k]);
  return hi > min && lo < max ? [Math.max(lo, min), Math.min(hi, max)] : [lo, hi];
}

// 구멍 축이 이 뷰 평면에 누워 있으면 피스·볼트 길을 점선으로. 화면에서 8 보다 짧으면 8 로 늘린다
function fastenerPath(j, h, P, cls, byId) {
  if (h.axis !== P.ah && h.axis !== P.av) return '';
  const [lo, hi] = fastenerSpan(j, h, byId);
  const [hx, hy] = P.pt(h.at);
  const flat = h.axis === P.ah;
  let a = flat ? P.toX(lo) : P.toY(lo);
  let b = flat ? P.toX(hi) : P.toY(hi);
  if (Math.abs(b - a) < 8) { const m = (a + b) / 2; a = m - 4; b = m + 4; }
  return flat
    ? `<line class="dw-axis${cls}" x1="${r2(a)}" y1="${r2(hy)}" x2="${r2(b)}" y2="${r2(hy)}"/>`
    : `<line class="dw-axis${cls}" x1="${r2(hx)}" y1="${r2(a)}" x2="${r2(hx)}" y2="${r2(b)}"/>`;
}

// 점 (px, py) 에서 선분 a-b 까지 거리 (지시선이 무엇을 지나가는지 볼 때)
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

// 풍선 자리 (x, y) 의 벌점 (지시점 cx, cy). 큰 순: 그림 밖 > 다른 풍선과 겹침 > 뷰 둘레(제목 아래, 치수선 안쪽) 밖
// > 지시선이 다른 풍선을 지나거나 이 풍선이 다른 지시선을 덮음 > 구멍·용접 표시를 가리거나 지시선이 다른 표시를 지나감
function spotCost(x, y, cx, cy, P, placed, keep) {
  let cost = x < BAL_R + 2 || y < BAL_R + 2 ? 1e5 : 0;
  if (x < P.ox - 4 || x > P.ox + P.W + 6 || y < Math.max(BAL_R + 3, P.oy - 18) || y > P.oy + P.H - 4) cost += 100;
  for (const q of placed) {
    if (Math.hypot(q.x - x, q.y - y) < 2 * BAL_R + 2) cost += 1000;
    else if (segDist(q.x, q.y, cx, cy, x, y) < BAL_R + 2 || segDist(x, y, q.ax, q.ay, q.x, q.y) < BAL_R + 2) cost += 50;
  }
  for (const [kx, ky] of keep) {
    if (Math.hypot(kx - x, ky - y) < BAL_R + 8) cost += 10;
    else if (Math.hypot(kx - cx, ky - cy) > 1 && segDist(kx, ky, cx, cy, x, y) < 6) cost += 10;
  }
  return cost;
}

// 풍선 자리 후보 방향 [바깥쪽, 아래쪽]. 첫 후보는 바깥쪽 위 대각선(30, 26), 그다음 위·바깥·안쪽 위·아래쪽 순
const BAL_DIRS = [[1, -1], [0, -1], [1, 0], [-1, -1], [1, 1], [0, 1], [-1, 0], [-1, 1]];

// 풍선 자리 고르기. 방향을 차례로 보고 다 걸리면 한 고리 더 멀리. 벌점 0 인 첫 자리, 없으면 벌점이 가장 적은 자리
function balloonSpot(cx, cy, P, placed, keep) {
  const out = cx < P.ox + P.W / 2 ? -1 : 1; // 뷰 가운데 기준 바깥쪽
  let best = null;
  for (const grow of [1, 1.6, 2.2, 2.8]) {
    for (const [ux, uy] of BAL_DIRS) {
      const x = cx + out * ux * (uy ? 30 : 38) * grow;
      const y = cy + uy * (ux ? 26 : 38) * grow;
      const cost = spotCost(x, y, cx, cy, P, placed, keep);
      if (!cost) return [x, y];
      if (!best || cost < best.cost) best = { x, y, cost };
    }
  }
  return [best.x, best.y];
}

// 묶음의 지시점: 이 뷰에 그린 그 묶음 표시 자리 중, 앞 묶음들이 쓴 지시점에서 30 이상 떨어진 첫 자리
// (여러 묶음이 한 모서리에 몰리면 같은 종류의 다른 자리로 옮긴다). 다 가까우면 가장 먼 자리
function pickAnchor(points, used) {
  let best = points[0];
  let bestD = -1;
  for (const p of points) {
    const d = Math.min(Infinity, ...used.map(u => Math.hypot(u[0] - p[0], u[1] - p[1])));
    if (d >= 30) return p;
    if (d > bestD) { best = p; bestD = d; }
  }
  return best;
}

// 풍선(연결부 글자). 지시선은 표시 테두리(가운데에서 5)부터 풍선 가운데까지, 끝은 풍선 원이 덮는다
function balloon(group, cx, cy, P, cls, placed, keep = []) {
  const [bx, by] = balloonSpot(cx, cy, P, placed, keep);
  placed.push({ x: bx, y: by, ax: cx, ay: cy });
  const d = Math.hypot(bx - cx, by - cy) || 1;
  const sx = cx + ((bx - cx) / d) * 5;
  const sy = cy + ((by - cy) / d) * 5;
  return `<g class="dw-bal${cls}" data-act="pick-joint" data-id="${esc(group)}"><line x1="${r2(sx)}" y1="${r2(sy)}" x2="${r2(bx)}" y2="${r2(by)}"/><circle cx="${r2(bx)}" cy="${r2(by)}" r="${BAL_R}"/><text x="${r2(bx)}" y="${r2(by + 4)}">${esc(group)}</text></g>`;
}

// 이 뷰의 연결부 표시. 구멍 ⊕ 는 구멍을 정면으로 보는 뷰에, 피스·볼트 길(점선)은 나머지 두 뷰에,
// 용접 물결은 이음선이 선으로 보이는 뷰에, 구멍 없는 연결(클램프·경첩·본드)은 맞닿은 면을 정면으로 보는 뷰에 네모.
// 풍선은 묶음마다 그 묶음의 기본 보기에 한 번 (placed.groups 로 기억, 자리는 placed 로 뷰 공통 겹침 피하기).
// 누른 부품과 상관없는 표시는 흐리게. 풍선은 묶음 단위라 누른 부품이 든 묶음이면 그대로 둔다
function renderJointMarks(joints, parts, P, selectedId, placed, jointSel = null) {
  if (!joints?.length) return '';
  placed.groups = placed.groups || new Set();
  const byId = new Map(parts.map(p => [p.id, p]));
  const mine = jointSel ? j => j.group === jointSel : j => j.a === selectedId || j.b === selectedId;
  const picked = !!(selectedId || jointSel);
  const myGroups = new Set(picked ? joints.filter(mine).map(j => j.group) : []);
  let out = '';
  const keep = []; // 풍선이 가리면 안 되는 표시 자리
  const tags = new Map(); // 이 뷰에 풍선을 달 묶음별 지시점 후보 (그 묶음 표시 자리들)
  for (const j of joints) {
    const cls = picked && !mine(j) ? ' dw-faded' : '';
    for (const h of j.holes) {
      if (VIEW_FOR_AXIS[h.axis] === P.key) {
        const [hx, hy] = P.pt(h.at);
        out += hole(hx, hy, cls);
        keep.push([hx, hy]);
      } else out += fastenerPath(j, h, P, cls, byId);
    }
    if (j.type === 'weld') {
      const wv = weldView(j);
      if (wv?.key === P.key) {
        const [cx, cy] = P.pt(j.face.center);
        out += `<path class="dw-weld${cls}" d="${zigzag(cx, cy, P.ah === wv.seamAxis)}"/>`;
        keep.push([cx, cy]);
      }
    } else if (!j.holes.length && VIEW_FOR_AXIS[j.face.axis] === P.key) {
      const [cx, cy] = P.pt(j.face.center);
      out += `<rect class="dw-mark${cls}" x="${r2(cx - 4)}" y="${r2(cy - 4)}" width="8" height="8"/>`;
      keep.push([cx, cy]);
    }
    if (primaryView(j) === P.key && !placed.groups.has(j.group)) {
      const seen = j.type === 'weld' ? [] : j.holes.filter(h => VIEW_FOR_AXIS[h.axis] === P.key).map(h => h.at);
      tags.set(j.group, [...(tags.get(j.group) || []), ...(seen.length ? seen : [j.face.center]).map(p => P.pt(p))]);
    }
  }
  // 풍선은 표시를 다 그린 뒤 맨 위에 (표시를 덜 가리는 자리를 고르도록). 자리는 누른 부품과 상관없이 늘 같다
  const used = [];
  for (const [g, points] of tags) {
    placed.groups.add(g);
    const [cx, cy] = pickAnchor(points, used);
    used.push([cx, cy]);
    out += balloon(g, cx, cy, P, picked && !myGroups.has(g) ? ' dw-faded' : '', placed, keep);
  }
  return out;
}

// 이 도면에 실제로 쓰인 기호만 범례에. 범례 기호는 도면 표시와 모양은 같고 class 만 따로(dw-lg-) 둔다 (도면 표시 개수와 섞이지 않게)
function legendItems(parts, joints) {
  const items = [];
  const holes = joints.some(j => j.holes.length);
  if (holes) items.push({ symbol: '<g class="dw-lg-hole"><circle cx="8" cy="0" r="3.5"/><line x1="3" y1="0" x2="13" y2="0"/><line x1="8" y1="-5" x2="8" y2="5"/></g>', text: '타공(구멍) 자리. 지름은 연결부 표에' });
  if (holes) items.push({ symbol: '<line class="dw-lg-axis" x1="0" y1="0" x2="16" y2="0"/>', text: '피스·볼트가 지나가는 길 (안 보이는 쪽)' });
  if (joints.some(j => j.type === 'weld')) items.push({ symbol: `<path class="dw-lg-weld" d="${zigzag(8, -1, true)}"/>`, text: '용접선' });
  if (joints.some(j => j.type !== 'weld' && !j.holes.length)) items.push({ symbol: '<rect class="dw-lg-mark" x="4" y="-4" width="8" height="8"/>', text: '클램프·경첩·본드 자리 (구멍 없음)' });
  if (joints.length) items.push({ symbol: '<g class="dw-lg-bal"><circle cx="8" cy="0" r="7"/><text x="8" y="3">A</text></g>', text: '연결부 번호. 같은 글자는 같은 방법 (표·확대 그림)' });
  if (parts.some(isRef)) items.push({ symbol: '<rect class="dw-lg-ref" x="0" y="-5" width="16" height="10"/>', text: '참고용 (만들지 않음)' });
  return items;
}
// ---- 연결부 표와 확대 그림 ----
function groupsOf(joints) {
  const groups = new Map();
  for (const j of joints || []) {
    if (j.type === 'none') continue;
    if (!groups.has(j.group)) groups.set(j.group, []);
    groups.get(j.group).push(j);
  }
  return groups;
}

export function renderJointTable(joints, parts, numbers, { note = '' } = {}) {
  const byId = new Map(parts.map(p => [p.id, p]));
  const groups = groupsOf(joints);
  if (!groups.size) return `<p class="note jt-note">${esc(note || '연결부를 찾지 못했어요. 부품이 서로 맞닿게 놓이면 자동으로 표시돼요.')}</p>`;
  const tag = p => p ? (numbers ? numbers.tag(p) : p.name) : '';
  const rows = [...groups.entries()].map(([g, list]) => {
    const j = list[0];
    const pa = byId.get(j.a);
    const pb = byId.get(j.b);
    const step = j.step ? String(j.step) : (j.auto ? '자동' : '');
    return `<tr data-act="pick-joint" data-id="${esc(g)}"><td><b>${esc(g)}</b> <small>×${list.length}곳</small></td><td>${esc(tag(pa))} + ${esc(tag(pb))}</td><td>${esc(describeMethod(j))}${j.note ? `<br><small>${esc(j.note)}</small>` : ''}</td><td>${esc(describeHoles(j, byId))}</td><td>${esc(step)}</td></tr>`;
  }).join('');
  return `<h3 class="jt-h">연결부 표 (어디를 무엇으로 붙이나)</h3>
    <div class="tbl-wrap"><table class="tbl jt"><thead><tr><th>번호</th><th>어디와 어디</th><th>방법·부속</th><th>구멍</th><th>순서</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">"자동"은 맞닿은 자재로 추정한 연결이에요. 부속 개수는 준비물 탭에 합쳐져 있어요.</p>`;
}

const overlaps = (A, win) => [0, 1, 2].every(k => A.max[k] > win.min[k] && A.min[k] < win.max[k]);

// 확대 그림 한 칸 (화면 단위 300x220). 그림 창은 (46, 16) 에서 244x164 로 늘 같고, 왼쪽(x=28)은 세로 치수, 아래(y=200)는 가로 치수 자리
const JT_W = 300;
const JT_H = 220;
const JT_X = 46;
const JT_Y = 16;
const JT_WIN_W = JT_W - JT_X - 10;
const JT_WIN_H = JT_H - JT_Y - 40;
const JT_CAP = 400; // 구멍 없는 연결부(용접·경첩·클램프) 창 한 변의 최대 mm. 긴 용접선은 가운데 부분만 보여 준다

// 글자 폭 어림 (한글·기호는 글자 크기만큼, 영문·숫자는 0.6배, 띄어쓰기는 0.3배)
const textW = (s, size) => [...String(s)].reduce((w, c) => w + size * (c === ' ' ? 0.3 : c.charCodeAt(0) > 0x2000 ? 1 : 0.6), 0);
const clampTo = (v, lo, hi) => lo > hi ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi);
const boxAt = (cx, cy, w, h) => ({ x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 });
// 두 네모 {x0, y0, x1, y1} 가 겹친 넓이
const overlapArea = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

// 부품이 이 뷰에서 차지하는 화면 네모 (기울인 부품은 꼭짓점들의 바깥 네모)
function screenBox(p, P) {
  const pts = partCorners(p).map(c => P.pt(c));
  const xs = pts.map(q => q[0]);
  const ys = pts.map(q => q[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

// 부품 이름표: 그 부품이 창에 보이는 곳(안쪽 25곳, 바로 바깥 4곳) 중 구멍·글자·다른 이름표를 가장 덜 가리는 자리.
// 이름표는 창 밖으로 나가지 않고, 부품 밖에 놓이면 부품까지 짧은 지시선을 긋는다. avoid 에 자기 자리를 더한다
function partLabel(text, part, win, avoid) {
  const w = textW(text, 11) + 4;
  const h = 14;
  let r = { x0: Math.max(part.x0, win.x0), y0: Math.max(part.y0, win.y0), x1: Math.min(part.x1, win.x1), y1: Math.min(part.y1, win.y1) };
  if (r.x1 <= r.x0 || r.y1 <= r.y0) r = win;
  const mx = (r.x0 + r.x1) / 2;
  const my = (r.y0 + r.y1) / 2;
  const cands = [];
  for (const fy of [0.5, 0.3, 0.7, 0.15, 0.85]) for (const fx of [0.5, 0.3, 0.7, 0.15, 0.85]) cands.push([r.x0 + (r.x1 - r.x0) * fx, r.y0 + (r.y1 - r.y0) * fy]);
  cands.push([mx, r.y0 - h / 2 - 3], [mx, r.y1 + h / 2 + 3], [r.x0 - w / 2 - 3, my], [r.x1 + w / 2 + 3, my]);
  let best = null;
  for (const [cx, cy] of cands) {
    const x = clampTo(cx, win.x0 + w / 2 + 2, win.x1 - w / 2 - 2);
    const y = clampTo(cy, win.y0 + h / 2 + 2, win.y1 - h / 2 - 2);
    const b = boxAt(x, y, w, h);
    const cost = avoid.reduce((sum, a) => sum + overlapArea(b, a) * a.k, 0) + (w * h - overlapArea(b, r)) * 0.05 + Math.hypot(x - mx, y - my) * 0.01;
    if (!best || cost < best.cost) best = { x, y, b, cost };
  }
  avoid.push({ ...best.b, k: 20 });
  let lead = '';
  if (!overlapArea(best.b, r)) {
    const px = clampTo(best.x, r.x0, r.x1);
    const py = clampTo(best.y, r.y0, r.y1);
    lead = `<line class="dw-lead" x1="${r2(clampTo(px, best.b.x0, best.b.x1))}" y1="${r2(clampTo(py, best.b.y0, best.b.y1))}" x2="${r2(px)}" y2="${r2(py)}"/>`;
  }
  const b = best.b;
  return `${lead}<rect class="dw-lbg" fill="#fff" fill-opacity=".85" x="${r2(b.x0)}" y="${r2(b.y0)}" width="${r2(b.x1 - b.x0)}" height="${r2(b.y1 - b.y0)}" rx="2"/><text class="dw-plabel dw-halo" x="${r2(best.x)}" y="${r2(best.y + 4)}" text-anchor="middle">${esc(text)}</text>`;
}

// 치수 칸들: 세계 좌표 점들(순서대로) 사이에서 1mm 이상인 칸만, 화면 [시작, 끝, mm] 로 화면 순서대로
function dimSpans(pts, toS) {
  const out = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const d = pts[i + 1] - pts[i];
    if (d < 1) continue;
    const a = toS(pts[i]);
    const b = toS(pts[i + 1]);
    out.push([Math.min(a, b), Math.max(a, b), d]);
  }
  return out.sort((p, q) => p[0] - q[0]);
}

// 같은 간격이 3칸 이상 이어지는데 글자가 칸에 안 들어가면 한 치수로 묶는다 ("153씩 9칸", 칸 사이 눈금은 남긴다).
// 결과 칸 = [화면 시작, 화면 끝, mm, 칸 수, 사이 눈금들]
function mergeEven(spans) {
  const runs = [];
  for (const [s1, s2, mm] of spans) {
    const last = runs[runs.length - 1];
    if (last && nice(last.mm) === nice(mm) && Math.abs(last.s2 - s1) < 0.5) { last.ticks.push(s1); last.s2 = s2; last.n++; }
    else runs.push({ s1, s2, mm, n: 1, ticks: [] });
  }
  return runs.flatMap(r => {
    if (r.n >= 3 && (r.s2 - r.s1) / r.n < textW(`${nice(r.mm)}`, 13) + 6) return [[r.s1, r.s2, r.mm, r.n, r.ticks]];
    const ends = [r.s1, ...r.ticks, r.s2];
    return ends.slice(1).map((e, i) => [ends[i], e, r.mm, 1, []]);
  });
}

// 확대 그림의 치수 한 줄 (가로는 창 아래 y = at, 세로는 창 왼쪽 x = at). 칸이 글자보다 좁으면 화살표를 빼고,
// 글자는 첫 칸이면 앞쪽 바깥, 끝 칸이면 뒤쪽 바깥, 가운데 칸이면 선 반대편에 둔다 (이웃 글자와 겹치지 않게)
function dimRow(spans, horizontal, at, arrow) {
  return spans.map(([s1, s2, mm, n = 1, ticks = []], i) => {
    const label = n > 1 ? `${nice(mm)}씩 ${n}칸` : `${nice(mm)}`;
    const len = s2 - s1;
    const where = len >= textW(label, 13) + 6 ? 'mid' : i === 0 ? 'before' : i === spans.length - 1 ? 'after' : 'flip';
    const heads = len >= 14 ? ` marker-start="url(#${arrow})" marker-end="url(#${arrow})"` : '';
    if (horizontal) {
      const [tx, ty, anchor] = { mid: [(s1 + s2) / 2, at - 6, 'middle'], before: [s1 - 4, at + 4, 'end'], after: [s2 + 4, at + 4, 'start'], flip: [(s1 + s2) / 2, at + 17, 'middle'] }[where];
      const mid = ticks.map(t => `<line x1="${r2(t)}" y1="${r2(at - 4)}" x2="${r2(t)}" y2="${r2(at + 4)}"/>`).join('');
      return `<g class="dw-dim"><line x1="${r2(s1)}" y1="${r2(at)}" x2="${r2(s2)}" y2="${r2(at)}"${heads}/><line x1="${r2(s1)}" y1="${r2(at - 6)}" x2="${r2(s1)}" y2="${r2(at + 6)}"/><line x1="${r2(s2)}" y1="${r2(at - 6)}" x2="${r2(s2)}" y2="${r2(at + 6)}"/>${mid}<text x="${r2(tx)}" y="${r2(ty)}" text-anchor="${anchor}">${label}</text></g>`;
    }
    // 세로 글자는 -90도로 돌려 아래에서 위로 읽는다 (start 는 기준점에서 위로, end 는 기준점 아래에 놓인다)
    const [tx, ty, anchor] = { mid: [at - 8, (s1 + s2) / 2, 'middle'], before: [at + 4, s1 - 4, 'start'], after: [at + 4, s2 + 4, 'end'], flip: [at + 16, (s1 + s2) / 2, 'middle'] }[where];
    const mid = ticks.map(t => `<line x1="${r2(at - 4)}" y1="${r2(t)}" x2="${r2(at + 4)}" y2="${r2(t)}"/>`).join('');
    return `<g class="dw-dim"><line x1="${r2(at)}" y1="${r2(s1)}" x2="${r2(at)}" y2="${r2(s2)}"${heads}/><line x1="${r2(at - 6)}" y1="${r2(s1)}" x2="${r2(at + 6)}" y2="${r2(s1)}"/><line x1="${r2(at - 6)}" y1="${r2(s2)}" x2="${r2(at + 6)}" y2="${r2(s2)}"/>${mid}<text x="${r2(tx)}" y="${r2(ty)}" text-anchor="${anchor}" transform="rotate(-90 ${r2(tx)} ${r2(ty)})">${label}</text></g>`;
  }).join('');
}

// 묶음 하나의 확대 그림: 맞닿은 곳 주변 창을 1:1 까지 키워 두 부품, 구멍, 구멍 치수, 이름표를 그린다.
// 보는 방향은 도면 풍선과 같은 기본 보기 (끼움의 핀 구멍은 맞닿은 축이 아니라 구멍 축으로 본다).
// 축척은 맞닿은 면을 max(60, 부속 길이x1.5) 만큼 넓힌 범위로 정하고, 창은 그 축척으로 칸을 꽉 채운다 (맞닿은 곳이 가운데)
function detailCard(g, list, parts, byId, numbers) {
  const j = list[0];
  const pa = byId.get(j.a);
  const pb = byId.get(j.b);
  if (!pa || !pb) return '';
  const weld = j.type === 'weld' ? weldView(j) : null;
  const key = primaryView(j);
  const [ah, av, ad] = VIEWS[key].axes;
  const pad = Math.max(60, (j.fastener?.len || 40) * 1.5);
  const half = k => {
    const h = (j.face.max[k] - j.face.min[k]) / 2 + pad;
    return j.holes.length ? h : Math.min(h, JT_CAP / 2);
  };
  const scale = Math.min(JT_WIN_W / (2 * half(ah)), JT_WIN_H / (2 * half(av)), 1);
  const A = partBox(pa);
  const B = partBox(pb);
  const win = { min: [0, 0, 0], max: [0, 0, 0] };
  for (const [k, px] of [[ah, JT_WIN_W], [av, JT_WIN_H]]) { win.min[k] = j.face.center[k] - px / scale / 2; win.max[k] = j.face.center[k] + px / scale / 2; }
  win.min[ad] = Math.min(A.min[ad], B.min[ad]);
  win.max[ad] = Math.max(A.max[ad], B.max[ad]);
  const wb = { min: win.min, max: win.max, size: win.max.map((m, i) => m - win.min[i]) };
  const P = projector(key, wb, JT_X, JT_Y, scale);
  const frame = { x0: JT_X, y0: JT_Y, x1: JT_X + JT_WIN_W, y1: JT_Y + JT_WIN_H };
  const clipId = `jt-clip-${g}`;
  const arrow = `arr-${g}`;
  let shapes = '';
  for (const p of parts) {
    if (isRef(p) || p.id === j.a || p.id === j.b || hasRot(p)) continue;
    if (overlaps(partBox(p), win)) shapes += shapeOf(p, P, 'dw-part dw-ghost', '');
  }
  shapes += shapeOf(pb, P, 'dw-part dw-b', '');
  shapes += shapeOf(pa, P, 'dw-part dw-a', '');
  if (!hasRot(pb) && !isRef(pb)) { const r = rectXY(pb, P); shapes += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" class="dw-hidden"/>`; }
  let marks = '';
  let dims = '';
  const avoid = []; // 이름표가 가리면 안 되는 자리 (k = 겹침 벌점)
  // 흰 바탕 글자 (맞닿은 선 위에 놓여도 읽히게). 이름표가 피하도록 자리를 avoid 에 더한다.
  // 흰 바탕·네모 표시는 색을 속성으로도 넣는다 (도면 <style> 이 없는 곳에서 검은 네모가 되지 않게)
  const boxText = (text, tx, ty, anchor) => {
    const w = textW(text, 12);
    const x0 = anchor === 'start' ? tx : anchor === 'end' ? tx - w : tx - w / 2;
    const b = { x0: x0 - 1, x1: x0 + w + 1, y0: ty - 11, y1: ty + 3 };
    avoid.push({ ...b, k: 5 });
    return `<rect class="dw-lbg" fill="#fff" fill-opacity=".85" x="${r2(b.x0)}" y="${r2(b.y0)}" width="${r2(b.x1 - b.x0)}" height="${r2(b.y1 - b.y0)}" rx="2"/><text class="dw-info dw-halo" x="${r2(tx)}" y="${r2(ty)}" text-anchor="${anchor}">${esc(text)}</text>`;
  };
  // 표시 옆 글자: 오른쪽 (창 끝이면 왼쪽)
  const sideText = (text, cx, cy, dx) => {
    const right = cx + dx + textW(text, 12) <= frame.x1 - 2;
    return boxText(text, right ? cx + dx : cx - dx, clampTo(cy, frame.y0 + 12, frame.y1 - 3), right ? 'start' : 'end');
  };
  if (weld) {
    const [cx, cy] = P.pt(j.face.center);
    const horizontal = P.ah === weld.seamAxis;
    const seam = j.face.max[weld.seamAxis] - j.face.min[weld.seamAxis];
    const len = seam * scale;
    if (len >= 1) {
      marks += horizontal
        ? `<line class="dw-weldline" x1="${r2(cx - len / 2)}" y1="${r2(cy)}" x2="${r2(cx + len / 2)}" y2="${r2(cy)}"/>`
        : `<line class="dw-weldline" x1="${r2(cx)}" y1="${r2(cy - len / 2)}" x2="${r2(cx)}" y2="${r2(cy + len / 2)}"/>`;
      // 이름표가 용접선을 덮지 않게 (선 둘레 4)
      avoid.push(horizontal ? { x0: cx - len / 2, x1: cx + len / 2, y0: cy - 4, y1: cy + 4, k: 2 } : { x0: cx - 4, x1: cx + 4, y0: cy - len / 2, y1: cy + len / 2, k: 2 });
    }
    marks += `<path class="dw-weld" d="${zigzag(cx, cy, horizontal)}"/>`;
    avoid.push({ ...boxAt(cx, cy, horizontal ? 28 : 10, horizontal ? 10 : 28), k: 3 });
    // 용접 길이: 맞닿은 둘레(weldLen), 모르면 이음선 길이, 그것도 없으면(지정한 점) 글자만
    const total = j.weldLen || seam;
    const text = total >= 1 ? `용접 약 ${Math.round(total)}mm` : '용접';
    if (horizontal) {
      // 가로 이음선은 아래(자리 없으면 위) 가운데
      const w = textW(text, 12);
      const tx = clampTo(cx, frame.x0 + w / 2 + 2, frame.x1 - w / 2 - 2);
      const ty = cy + 20 <= frame.y1 - 3 ? cy + 20 : cy - 10;
      marks += boxText(text, tx, ty, 'middle');
    } else marks += sideText(text, cx, cy + 4, 10);
  } else if (!j.holes.length) {
    // 구멍 없는 연결(클램프·경첩·본드): 도면과 같은 네모 표시와 이름
    const [cx, cy] = P.pt(j.face.center);
    marks += `<rect class="dw-mark" fill="#fff" stroke="#1565c0" x="${r2(cx - 4)}" y="${r2(cy - 4)}" width="8" height="8"/>`;
    avoid.push({ ...boxAt(cx, cy, 12, 12), k: 5 });
    marks += sideText(`${TYPE_NAMES[j.type] || j.type} 자리`, cx, cy + 4, 9);
  } else {
    const at = j.holes.map(h => P.pt(h.at));
    for (const [hx, hy] of at) {
      marks += hole(hx, hy, '').replace('r="3.5"', 'r="5"');
      avoid.push({ ...boxAt(hx, hy, 14, 14), k: 5 });
    }
    // ⌀ 글자: 구멍의 오른쪽 위, 왼쪽 위, 오른쪽 아래, 왼쪽 아래 중 창 안에서 다른 구멍·글자를 안 가리는 첫 자리.
    // 구멍이 몰려 빈자리가 없으면 같은 지름은 한 번만 적는다
    const said = new Set();
    j.holes.forEach((h, i) => {
      const [hx, hy] = at[i];
      const text = `⌀${h.dia}`;
      const w = textW(text, 12);
      let best = null;
      for (const [sx, sy] of [[1, -1], [-1, -1], [1, 1], [-1, 1]]) {
        const tx = hx + sx * 7;
        const ty = sy < 0 ? hy - 7 : hy + 16;
        const b = { x0: sx > 0 ? tx : tx - w, x1: sx > 0 ? tx + w : tx, y0: ty - 10, y1: ty + 2 };
        if (b.x0 < frame.x0 + 2 || b.x1 > frame.x1 - 2 || b.y0 < frame.y0 + 2 || b.y1 > frame.y1 - 2) continue;
        const cost = avoid.reduce((sum, a) => sum + overlapArea(b, a) * a.k, 0);
        if (!best || cost < best.cost) best = { tx, ty, b, cost, anchor: sx > 0 ? 'start' : 'end' };
        if (!cost) break;
      }
      const crowded = !best || best.cost > 0;
      if (crowded && said.has(text)) return;
      best = best || { tx: hx + 7, ty: hy - 7, b: { x0: hx + 7, x1: hx + 7 + w, y0: hy - 17, y1: hy - 5 }, anchor: 'start' };
      said.add(text);
      avoid.push({ ...best.b, k: 5 });
      marks += `<text class="dw-info dw-halo" x="${r2(best.tx)}" y="${r2(best.ty)}" text-anchor="${best.anchor}">${text}</text>`;
    });
    // 구멍 치수: 긴 변을 따라 맞닿은 면 끝에서 첫 구멍, 구멍 사이, 마지막 구멍에서 끝.
    // 짧은 변 쪽은 구멍 줄이 하나면 가까운 끝에서 그 줄까지 하나, 여러 줄이면 끝에서 끝까지 줄마다.
    // 가로 치수는 창 아래, 세로 치수는 창 왼쪽 한 줄씩 (두 방향이 늘 다르므로 겹치지 않는다)
    const along = j.holes.length > 1 && j.holes[0].at[ah] !== j.holes[1].at[ah] ? ah : (j.holes.length > 1 ? av : (j.face.max[ah] - j.face.min[ah] >= j.face.max[av] - j.face.min[av] ? ah : av));
    const across = along === ah ? av : ah;
    const toS = k => (k === ah ? P.toX : P.toY);
    const row = (spans, k) => dimRow(mergeEven(spans), k === ah, k === ah ? JT_Y + JT_WIN_H + 20 : JT_X - 18, arrow);
    dims += row(dimSpans([j.face.min[along], ...j.holes.map(h => h.at[along]).sort((p, q) => p - q), j.face.max[along]], toS(along)), along);
    const lines = [...new Set(j.holes.map(h => r2(h.at[across])))].sort((p, q) => p - q);
    let acrossPts;
    if (lines.length > 1) acrossPts = [j.face.min[across], ...lines, j.face.max[across]];
    else {
      const h0 = j.holes[0].at[across];
      const edge = Math.abs(h0 - j.face.min[across]) <= Math.abs(j.face.max[across] - h0) ? j.face.min[across] : j.face.max[across];
      acrossPts = [Math.min(h0, edge), Math.max(h0, edge)];
    }
    dims += row(dimSpans(acrossPts, toS(across)), across);
  }
  const tag = p => numbers ? numbers.tag(p) : p.name;
  // 이름표가 창보다 길면 번호만 (이름은 캡션에 있다)
  const short = p => {
    const t = tag(p);
    const n = numbers?.byId?.get(p.id);
    return textW(t, 11) + 8 > JT_WIN_W && n ? numbers.label(n) : t;
  };
  const labels = partLabel(short(pa), screenBox(pa, P), frame, avoid) + partLabel(short(pb), screenBox(pb, P), frame, avoid);
  const ratio = Math.max(1, Math.round(1 / scale));
  const cap = `상세 ${g} · ${tag(pa)} + ${tag(pb)} · 1:${ratio} · 같은 곳 ${list.length}곳`;
  const sub = `${describeMethod(j)} · 구멍: ${describeHoles(j, byId)}${j.note ? ` · ${j.note}` : ''}`;
  return `<figure class="jt-card" id="jt-${esc(g)}"><figcaption><b>${esc(cap)}</b><br><small>${esc(sub)}</small></figcaption>
    <svg class="jt-svg" viewBox="0 0 ${JT_W} ${JT_H}" xmlns="http://www.w3.org/2000/svg" font-family="Pretendard, 'Noto Sans KR', sans-serif">
      <defs><marker id="${esc(arrow)}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#c0392b"/></marker><clipPath id="${esc(clipId)}"><rect x="${JT_X}" y="${JT_Y}" width="${JT_WIN_W}" height="${JT_WIN_H}"/></clipPath></defs>
      <rect x="${JT_X}" y="${JT_Y}" width="${JT_WIN_W}" height="${JT_WIN_H}" fill="#fff" stroke="#ddd"/>
      <g clip-path="url(#${esc(clipId)})">${shapes}${marks}${labels}</g>
      ${dims}
    </svg></figure>`;
}

export function renderJointDetails(joints, parts, numbers) {
  const byId = new Map(parts.map(p => [p.id, p]));
  const groups = groupsOf(joints);
  if (!groups.size) return '';
  const cards = [...groups.entries()].map(([g, list]) => detailCard(g, list, parts, byId, numbers)).join('');
  return `<h3 class="jt-h">연결부 확대 그림 (같은 곳은 한 번만)</h3><div class="jt-grid">${cards}</div>`;
}
