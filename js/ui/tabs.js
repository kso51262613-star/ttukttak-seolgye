// 아래 결과 탭 5개 (도면, 재단표, 준비물·비용, 제작 순서, 당근 판매글)
import { renderDrawing } from './drawing.js';
import { usageOf } from '../core/cutlist.js';
import { MATERIALS, isLinear } from '../core/materials.js';

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
  return `<div class="tab-actions">
      <button data-act="print">인쇄 / PDF 저장</button>
      <button data-act="save-svg">도면 파일(SVG) 저장</button>
      <button data-act="save-png">3D 사진 저장</button>
    </div>
    <div class="drawing-wrap">${renderDrawing(ctx.parts, { title: ctx.design.title, subtitle: sub })}</div>${NOTE}`;
}

function linearSvg(key, l) {
  const W = 560;
  const rowH = 30;
  const k = W / l.stock;
  const rows = l.bins.map((b, i) => {
    let x = 0;
    const segs = b.cuts.map(c => {
      const w = c.len * k;
      const g = `<rect x="${x}" y="${i * rowH}" width="${w}" height="${rowH - 8}" class="seg"/><text x="${x + w / 2}" y="${i * rowH + 15}" text-anchor="middle">${c.len}</text>`;
      x += w + l.kerf * k;
      return g;
    }).join('');
    return `<rect x="0" y="${i * rowH}" width="${W}" height="${rowH - 8}" class="stock"/>${segs}<text x="${W + 6}" y="${i * rowH + 15}" class="waste">남음 ${b.waste}</text>`;
  }).join('');
  return `<svg class="cutsvg" viewBox="-2 -2 ${W + 80} ${l.bins.length * rowH + 4}">${rows}</svg>`;
}

function sheetSvg(key, s) {
  const W = 480;
  const k = W / s.stockW;
  const H = s.stockH * k;
  return s.sheets.map((sh, i) => {
    const rects = sh.placements.map(p => `<rect x="${p.x * k}" y="${p.y * k}" width="${p.w * k}" height="${p.h * k}" class="seg"/>
      <text x="${(p.x + p.w / 2) * k}" y="${(p.y + p.h / 2) * k + 4}" text-anchor="middle">${p.rot ? p.h : p.w}x${p.rot ? p.w : p.h}</text>`).join('');
    return `<div class="sheet"><div class="sheet-title">${i + 1}번째 판 (${s.stockW}x${s.stockH})</div>
      <svg class="cutsvg" viewBox="-2 -2 ${W + 4} ${H + 4}"><rect x="0" y="0" width="${W}" height="${H}" class="stock"/>${rects}</svg></div>`;
  }).join('');
}

function cutTab(ctx) {
  const { cut } = ctx;
  if (!cut.rows.length) return '<p class="empty">자를 부품이 없어요.</p>';
  const rows = cut.rows.map(r => `<tr><td>${esc(r.materialName)}</td><td class="num">${esc(r.label)}</td><td class="num">${r.count}</td>
    <td>${esc(r.names.join(', '))}</td><td>${esc(r.notes.join(', '))}</td></tr>`).join('');
  const warn = cut.warnings.length ? `<div class="warn">${cut.warnings.map(esc).join('<br>')}</div>` : '';
  const layouts = [
    ...Object.entries(cut.linear).map(([key, l]) => `<h4>${esc(MATERIALS[key].name)} · 원장 ${l.stock}mm x ${l.bins.length}본 · 사용률 ${Math.round(usageOf(cut, key) * 100)}%</h4>${linearSvg(key, l)}`),
    ...Object.entries(cut.sheets).map(([key, s]) => `<h4>${esc(MATERIALS[key].name)} · ${s.sheets.length}장 · 사용률 ${Math.round(usageOf(cut, key) * 100)}%</h4>${sheetSvg(key, s)}`)
  ].join('');
  return `<div class="tab-actions"><button data-act="print">인쇄</button></div>${warn}
    <table class="tbl"><thead><tr><th>자재</th><th>길이 / 크기(mm)</th><th>개수</th><th>부품</th><th>가공 메모</th></tr></thead><tbody>${rows}</tbody></table>
    <h3>원장 배치 (낭비 줄이는 자르기 순서)</h3>
    <p class="note">톱날 두께(목재 3mm, 철 2mm)를 빼고 계산했어요. 판재는 목재소 재단 서비스에 이 그림을 보여주면 편해요.</p>
    ${layouts}${NOTE}`;
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
  const masonry = Object.keys(cut?.stock || {}).some(k => MATERIALS[k]?.group === 'masonry');
  let html = heavy ? '<p class="note ship">6m 철재나 통 판재는 인터넷으로 주문하면 택배가 안 돼서 화물 운임(약 8만~10만 원)이 따로 들 수 있어요. 동네 철물점·목재소에서 잘라서 사면 더 쌀 수 있어요.</p>' : '';
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
