// 3면도(정면·측면·윗면) SVG. 모든 뷰가 같은 축척을 쓴다.
import { bounds } from '../core/model.js';
import { MATERIALS, materialProfile, longAxis } from '../core/materials.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 뷰마다 [가로축, 세로축, 깊이축(가까운 쪽이 큰 값)]
const VIEWS = {
  front: { title: '정면도', axes: [0, 1, 2], flipV: true },
  side: { title: '측면도 (오른쪽)', axes: [2, 1, 0], flipV: true, flipH: true },
  top: { title: '평면도 (위에서)', axes: [0, 2, 1], flipV: false }
};

function nice(n) {
  return Math.round(n);
}

function dimH(x1, x2, y, label) {
  return `<g class="dim"><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" marker-start="url(#arr)" marker-end="url(#arr)"/>
  <line x1="${x1}" y1="${y - 6}" x2="${x1}" y2="${y + 6}"/><line x1="${x2}" y1="${y - 6}" x2="${x2}" y2="${y + 6}"/>
  <text x="${(x1 + x2) / 2}" y="${y - 6}" text-anchor="middle">${label}</text></g>`;
}
function dimV(y1, y2, x, label) {
  const my = (y1 + y2) / 2;
  return `<g class="dim"><line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" marker-start="url(#arr)" marker-end="url(#arr)"/>
  <line x1="${x - 6}" y1="${y1}" x2="${x + 6}" y2="${y1}"/><line x1="${x - 6}" y1="${y2}" x2="${x + 6}" y2="${y2}"/>
  <text x="${x - 8}" y="${my}" text-anchor="middle" transform="rotate(-90 ${x - 8} ${my})">${label}</text></g>`;
}

function renderView(parts, b, key, ox, oy, scale) {
  const v = VIEWS[key];
  const [ah, av, ad] = v.axes;
  const W = b.size[ah] * scale;
  const H = b.size[av] * scale;
  const toX = val => v.flipH ? ox + (b.max[ah] - val) * scale : ox + (val - b.min[ah]) * scale;
  const toY = val => v.flipV ? oy + (b.max[av] - val) * scale : oy + (val - b.min[av]) * scale;
  // 먼 부품부터 그려서 가까운 부품이 위에 오게
  const sorted = [...parts].sort((p, q) => (p.pos[ad] + p.size[ad] / 2) - (q.pos[ad] + q.size[ad] / 2));
  let out = `<text class="vtitle" x="${ox}" y="${oy - 34}">${v.title}</text>`;
  for (const p of sorted) {
    const fill = MATERIALS[p.material]?.group === 'metal' ? '#e3e6ea' : '#fbf3e4';
    // 둥근 부품(드럼통, 원형 파이프, 환봉, 둥근 봉)이 보는 방향을 향하면 원으로 그린다
    const round = p.shape === 'cylinder' || materialProfile(p.material) === 'round';
    const axis = p.shape === 'cylinder' ? 1 : longAxis(p.size);
    if (round && axis === ad) {
      const cx = toX(p.pos[ah]);
      const cy = toY(p.pos[av]);
      const r = (Math.min(p.size[ah], p.size[av]) / 2) * scale;
      out += `<circle cx="${cx}" cy="${cy}" r="${Math.max(0.6, r)}" fill="${fill}" class="part"><title>${esc(p.name)}</title></circle>`;
      continue;
    }
    const xa = toX(p.pos[ah] - p.size[ah] / 2);
    const xb = toX(p.pos[ah] + p.size[ah] / 2);
    const ya = toY(p.pos[av] - p.size[av] / 2);
    const yb = toY(p.pos[av] + p.size[av] / 2);
    out += `<rect x="${Math.min(xa, xb)}" y="${Math.min(ya, yb)}" width="${Math.max(0.6, Math.abs(xb - xa))}" height="${Math.max(0.6, Math.abs(yb - ya))}" fill="${fill}" class="part"><title>${esc(p.name)} ${p.size.map(nice).join('x')}</title></rect>`;
  }
  out += dimH(ox, ox + W, oy + H + 26, `${nice(b.size[ah])}`);
  out += dimV(oy, oy + H, ox - 22, `${nice(b.size[av])}`);
  return out;
}

export function renderDrawing(parts, { title = '', subtitle = '' } = {}) {
  if (!parts.length) return '<p class="empty">부품이 없어요. 템플릿을 고르거나 부품을 추가해 주세요.</p>';
  const b = bounds(parts);
  const cell = { w: 380, h: 300 };
  const pad = 70;
  const fit = (w, h) => Math.min(cell.w / Math.max(w, 1), cell.h / Math.max(h, 1));
  const scale = Math.min(
    fit(b.size[0], b.size[1]),
    fit(b.size[2], b.size[1]),
    fit(b.size[0], b.size[2])
  );
  const totalW = pad * 2 + cell.w * 2 + pad;
  const totalH = pad * 2 + cell.h * 2 + pad + 50;
  const frontX = pad;
  const frontY = pad + 20;
  const sideX = pad + cell.w + pad;
  const topY = frontY + b.size[1] * scale + pad + 20;
  const ratio = Math.round(1 / scale);
  return `<svg class="drawing" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" font-family="Pretendard, 'Noto Sans KR', sans-serif">
  <defs><marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#c0392b"/></marker></defs>
  <style>
    .part{stroke:#222;stroke-width:1}
    .dim line{stroke:#c0392b;stroke-width:1}
    .dim text{fill:#c0392b;font-size:13px;font-weight:600}
    .vtitle{font-size:14px;font-weight:700;fill:#333}
    .info{font-size:12px;fill:#444}
  </style>
  <rect x="1" y="1" width="${totalW - 2}" height="${totalH - 2}" fill="#fff" stroke="#999"/>
  ${renderView(parts, b, 'front', frontX, frontY, scale)}
  ${renderView(parts, b, 'side', sideX, frontY, scale)}
  ${renderView(parts, b, 'top', frontX, topY, scale)}
  <g transform="translate(${sideX}, ${topY})">
    <rect x="0" y="-20" width="${cell.w}" height="150" fill="#f7f7f5" stroke="#bbb"/>
    <text x="14" y="8" font-size="16" font-weight="700" fill="#222">${esc(title)}</text>
    <text class="info" x="14" y="32">${esc(subtitle)}</text>
    <text class="info" x="14" y="54">전체 크기: 폭 ${b.size[0]} x 깊이 ${b.size[2]} x 높이 ${b.size[1]} mm</text>
    <text class="info" x="14" y="76">부품 ${parts.length}개 · 축척 약 1:${ratio} · 단위 mm</text>
    <text class="info" x="14" y="98">부품별 치수는 재단표를 보세요.</text>
    <text class="info" x="14" y="120">뚝딱설계 · 참고용 도면, 실제 자재에 맞춰 확인하세요</text>
  </g>
</svg>`;
}
