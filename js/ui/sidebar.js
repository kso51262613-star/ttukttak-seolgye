// 왼쪽(템플릿·내 작업·링크 보관함)과 오른쪽(치수·자재·부품) 패널
import { TEMPLATES, CATEGORIES } from '../core/templates/index.js';
import { MATERIALS, isLinear } from '../core/materials.js';
import { esc } from './tabs.js';
import { isSafeUrl } from '../core/storage.js';
import { cleanRefImages } from '../core/vision.js';

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

const SLOT_LABELS = {
  frame: '틀', top: '상판', board: '선반 판', body: '몸통 판', slat: '살', leg: '다리',
  apron: '띠장', post: '기둥', plate: '철판', body_drum: '몸통',
  panel: '옆판', bottom: '수납칸 바닥', strap: '받침', shelf: '장작 선반'
};

const dots = n => '●'.repeat(n) + '○'.repeat(3 - n);

export function renderLeft(view, { design, designs, links }) {
  const tabs = [['templates', '템플릿'], ['mine', '내 작업'], ['links', '링크 보관함']];
  const head = `<div class="seg-tabs">${tabs.map(([k, l]) => `<button data-act="left-tab" data-tab="${k}" class="${view === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  let body = '';
  if (view === 'templates') {
    for (const [cat, label] of Object.entries(CATEGORIES)) {
      const list = TEMPLATES.filter(t => t.category === cat);
      if (!list.length) continue;
      body += `<h4 class="cat">${label}</h4>`;
      body += list.map(t => `<button class="tpl ${design.templateId === t.id ? 'on' : ''}" data-act="pick-template" data-id="${t.id}">
        <span class="tpl-name">${t.trend ? '<span class="hot">🔥</span>' : ''}${esc(t.name)}</span>
        <span class="tpl-meta">난이도 ${dots(t.difficulty)}</span>
        <span class="tpl-sum">${esc(t.summary)}</span></button>`).join('');
    }
  } else if (view === 'mine') {
    body = `<div class="row-btns"><button data-act="export">전체 내보내기</button><label class="btn">불러오기<input type="file" accept=".json,application/json" data-act="import" hidden></label></div>`;
    body += designs.length ? designs.map(d => `<div class="mine ${d.id === design.id ? 'on' : ''}">
        <button class="mine-open" data-act="open-design" data-id="${esc(d.id)}">${cleanRefImages(d.refImages)[0] ? `<img class="mine-thumb" src="${esc(cleanRefImages(d.refImages)[0])}" alt="">` : ''}<b>${esc(d.title)}</b><small>${esc(new Date(num(d.updatedAt)).toLocaleString('ko-KR'))}</small></button>
        <button class="icon" title="복사" data-act="dup-design" data-id="${esc(d.id)}">⧉</button>
        <button class="icon" title="삭제" data-act="del-design" data-id="${esc(d.id)}">✕</button></div>`).join('')
      : '<p class="empty">아직 저장된 작업이 없어요.</p>';
  } else {
    body = `<form class="link-form" data-act="add-link">
        <input name="url" type="url" placeholder="릴스·쇼츠 링크 붙여넣기" required>
        <textarea name="memo" rows="2" placeholder="메모 (예: 각파이프 3단 선반, 폭 90 정도)"></textarea>
        <button type="submit">보관함에 저장</button></form>`;
    body += links.length ? links.map(l => `<div class="link">
        ${isSafeUrl(l.url) ? `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.url.replace(/^https?:\/\//, '').slice(0, 40))}</a>` : '<span class="muted">(열 수 없는 링크)</span>'}
        <p>${esc(l.memo || '(메모 없음)')}</p>
        <div class="row-btns"><button data-act="link-to-text" data-id="${esc(l.id)}">말로 설계로 보내기</button><button class="icon" data-act="del-link" data-id="${esc(l.id)}">✕</button></div></div>`).join('')
      : '<p class="empty">본 영상 링크와 메모를 모아두면, 메모를 바로 설계로 바꿀 수 있어요.</p>';
  }
  return head + `<div class="left-body">${body}</div>`;
}

function paramRow(p, raw) {
  const value = num(raw);
  return `<div class="param"><label>${esc(p.label)} <small>${p.min}~${p.max}${p.unit}</small></label>
    <div class="param-in"><input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${value}" data-act="param" data-key="${p.key}">
    <input type="number" min="${p.min}" max="${p.max}" step="${p.step}" value="${value}" data-act="param" data-key="${p.key}"><span>${p.unit}</span></div></div>`;
}

function addPartForm() {
  const opts = Object.entries(MATERIALS).map(([k, m]) => `<option value="${k}">${esc(m.name)}</option>`).join('');
  return `<details class="add-part"><summary>+ 부품 직접 추가</summary>
    <form data-act="add-part">
      <label>자재<select name="material">${opts}</select></label>
      <label>길이 / 가로 <input name="len" type="number" min="10" value="600"> mm</label>
      <label>판재 세로 <input name="wid" type="number" min="10" value="300"> mm <small>(판재·철판만)</small></label>
      <label>방향<select name="dir"><option value="x">가로로 눕힘</option><option value="y">세로로 세움</option><option value="z">앞뒤로 눕힘</option></select></label>
      <button type="submit">추가</button></form></details>`;
}

function selectedPanel(part, design) {
  if (!part) return '<p class="hint">3D에서 부품을 누르면 여기서 고칠 수 있어요. 선택한 부품은 끌어서 옮기고, Shift를 누른 채 끌면 위아래로 움직여요.</p>';
  const moved = design.moved?.[part.id];
  const sizeInputs = part.extra
    ? `<div class="xyz">${['폭', '높이', '깊이'].map((l, i) => `<label>${l}<input type="number" min="1" value="${num(part.size[i])}" data-act="part-size" data-i="${i}"></label>`).join('')}</div>
       ${['barrel', 'wheel', 'caster', 'cylinder'].includes(part.shape) ? '' : '<div class="row-btns"><button data-act="rotate" data-axis="y">눕혀 돌리기 90°</button><button data-act="rotate" data-axis="x">세우기 90°</button></div>'}`
    : `<p class="dims">${part.size.map(v => Math.round(v)).join(' x ')} mm</p>`;
  return `<div class="sel"><h4>${esc(part.name)} <small>${esc(MATERIALS[part.material]?.name)}</small></h4>
    ${sizeInputs}
    ${part.extra
      ? `<div class="xyz">${['좌우', '위아래', '앞뒤'].map((l, i) => `<label>${l} 위치<input type="number" step="10" value="${Math.round(part.pos[i])}" data-act="part-pos" data-i="${i}"></label>`).join('')}</div>`
      : `<div class="xyz">${['좌우', '위아래', '앞뒤'].map((l, i) => `<label>${l} 이동<input type="number" step="10" value="${num(moved?.[i])}" data-act="part-move" data-i="${i}"></label>`).join('')}</div>`}
    ${part.note ? `<p class="dims">메모: ${esc(part.note)}</p>` : ''}
    <div class="row-btns">${moved ? '<button data-act="reset-move">위치 원래대로</button>' : ''}<button class="danger" data-act="remove-part">이 부품 빼기</button></div></div>`;
}

export function renderRight({ design, template, selected, removedCount }) {
  let html = `<label class="title-in">작품 이름<input type="text" value="${esc(design.title)}" data-act="title"></label>`;
  if (template && template.params.length) {
    html += `<h4>치수</h4>${template.params.map(p => paramRow(p, design.params[p.key])).join('')}`;
  }
  const slots = Object.entries(template?.materialOptions || {}).filter(([, o]) => o.length > 1);
  if (slots.length) {
    html += '<h4>자재</h4>' + slots.map(([slot, opts]) => `<label class="mat">${SLOT_LABELS[slot] || slot}
      <select data-act="material" data-slot="${slot}">${opts.map(k => `<option value="${k}" ${(design.materials?.[slot] || opts[0]) === k ? 'selected' : ''}>${esc(MATERIALS[k].name)}</option>`).join('')}</select></label>`).join('');
  }
  html += `<h4>선택한 부품</h4>${selectedPanel(selected, design)}`;
  if (removedCount) html += `<button class="link-btn" data-act="restore-parts">뺀 부품 ${removedCount}개 되살리기</button>`;
  html += addPartForm();
  return html;
}

// 부품 추가 폼 값으로 Part 만들기
export function partFromForm(fd, id) {
  const material = fd.get('material');
  const m = MATERIALS[material];
  const len = Math.max(10, Number(fd.get('len')) || 600);
  const wid = Math.max(10, Number(fd.get('wid')) || 300);
  const dir = fd.get('dir');
  let size;
  if (isLinear(material)) {
    const [t, w] = m.section;
    size = dir === 'y' ? [w, len, t] : dir === 'z' ? [t, w, len] : [len, w, t];
  } else if (m.kind === 'sheet' || m.kind === 'masonry' || m.kind === 'cast' || m.kind === 'wrap') {
    // 벽돌 벽은 벽돌 폭, 콘크리트는 60, 단열 담요는 한 겹 두께를 기본 두께로
    const t = m.thickness || (m.brick ? m.brick[1] : m.kind === 'cast' ? 60 : m.layer || 25);
    size = dir === 'y' ? [len, wid, t] : dir === 'z' ? [t, wid, len] : [len, t, wid];
  } else if (material === 'caster_150') {
    size = [40, 150, 150];
  } else {
    size = [580, 880, 580];
  }
  const shape = material === 'caster_150' ? 'wheel' : m.kind === 'item' ? 'cylinder' : 'box';
  return { id, name: `추가 ${m.name}`, material, size, pos: [0, size[1] / 2, 0], shape, note: '' };
}
