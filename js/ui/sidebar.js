// 왼쪽(템플릿·내 작업·링크 보관함)과 오른쪽(치수·자재·선택한 부품·부품 목록) 패널
import { TEMPLATES, CATEGORIES } from '../core/templates/index.js';
import { MATERIALS, isLinear } from '../core/materials.js';
import { esc } from './tabs.js';
import { isSafeUrl } from '../core/storage.js';
import { cleanRefImages } from '../core/vision.js';
import { hasRot, isRef } from '../core/model.js';
import { partNumbers } from '../core/numbering.js';
import { jointsOfPart, fastenerTotals, describeMethod, describeHoles, TYPE_NAMES } from '../core/joints.js';
import { slotLabel } from '../core/prompts.js';
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

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
  const opts = Object.entries(MATERIALS).filter(([, m]) => m.kind !== 'ref').map(([k, m]) => `<option value="${k}">${esc(m.name)}</option>`).join('');
  return `<details class="add-part"><summary>+ 부품 직접 추가</summary>
    <form data-act="add-part">
      <label>자재<select name="material">${opts}</select></label>
      <label>길이 / 가로 <input name="len" type="number" min="10" value="600"> mm</label>
      <label>판재 세로 <input name="wid" type="number" min="10" value="300"> mm <small>(판재·철판만)</small></label>
      <label>방향<select name="dir"><option value="x">가로로 눕힘</option><option value="y">세로로 세움</option><option value="z">앞뒤로 눕힘</option></select></label>
      <button type="submit">추가</button></form></details>`;
}

// 기울기 글자: 앞에서 볼 때(z), 옆에서 볼 때(x), 위에서 볼 때(y)
function rotText(rot) {
  const names = [[2, '앞에서 볼 때'], [0, '옆에서 볼 때'], [1, '위에서 볼 때']];
  return names.filter(([i]) => Number(rot?.[i])).map(([i, l]) => `${l} ${Math.abs(Math.round(Number(rot[i])))}도`).join(', ');
}

// ---------- 오른쪽: 부품 목록 ----------
const XYZ = ['좌우', '위아래', '앞뒤'];
// 밀기 버튼 [축, 방향, 글자]. 3칸 격자로 윗줄 왼쪽·위·오른쪽, 아랫줄 뒤·아래·앞
const NUDGE = [[0, -1, '◀ 왼쪽'], [1, 1, '▲ 위'], [0, 1, '오른쪽 ▶'], [2, -1, '뒤로'], [1, -1, '▼ 아래'], [2, 1, '앞으로']];
export const NUDGE_STEPS = [1, 10, 50];
const JOINT_TYPES = ['screw', 'bolt', 'weld', 'pin', 'glue', 'hinge', 'clamp', 'none'];
const FIXED_SHAPES = ['barrel', 'wheel', 'caster', 'cylinder'];
const round = v => Math.round(num(v));
const posText = p => p.pos.map(round).join(', ');
const matName = p => MATERIALS[p.material]?.name || '';

// 목록 줄 글자: 템플릿 부품은 id(이름-번호) 그대로, 추가 부품은 id 가 알 수 없는 글자라 이름-순번
const itemLabel = (p, i) => (p.extra ? `${p.name}-${i + 1}` : p.id);
const itemButton = (p, label, selectedId) => `<button class="pl-item${p.id === selectedId ? ' on' : ''}" data-act="select-part" data-id="${esc(p.id)}">${esc(label)} <small>${esc(posText(p))}</small></button>`;

// 이름별 묶음(<details>), 고른 부품이 든 묶음만 펼친다. 한 개짜리는 버튼 하나, 참고용은 맨 아래 따로
export function renderPartsList(parts, numbers, selectedId, openGroups = null) {
  if (!parts?.length) return '<p class="empty">부품이 없어요.</p>';
  const nums = numbers || partNumbers(parts);
  const groups = new Map();
  const refs = [];
  for (const p of parts) {
    if (isRef(p)) refs.push(p);
    else if (groups.has(p.name)) groups.get(p.name).push(p);
    else groups.set(p.name, [p]);
  }
  // 선택한 부품이 든 묶음과 사용자가 펼쳐 둔 묶음(openGroups)은 다시 그려도 펼친 채로
  const has = list => list.some(p => p.id === selectedId);
  const isOpen = (name, list) => has(list) || !!openGroups?.has?.(name);
  let html = '';
  for (const [name, list] of groups) {
    const n = nums.byName.get(name);
    const head = `${n ? `${nums.label(n)} ` : ''}${esc(name)}`;
    const mats = esc([...new Set(list.map(matName))].filter(Boolean).join(', '));
    if (list.length === 1) {
      const p = list[0];
      html += `<button class="pl-item pl-one${p.id === selectedId ? ' on' : ''}" data-act="select-part" data-id="${esc(p.id)}">${head} <small>${mats} · ${esc(posText(p))}</small></button>`;
    } else {
      html += `<details class="pl-group" data-name="${esc(name)}"${isOpen(name, list) ? ' open' : ''}><summary>${head} <small>×${list.length} · ${mats}</small></summary>${list.map((p, i) => itemButton(p, itemLabel(p, i), selectedId)).join('')}</details>`;
    }
  }
  if (refs.length) html += `<details class="pl-group pl-ref" data-name="__ref"${isOpen('__ref', refs) ? ' open' : ''}><summary>참고용 (만들지 않음) <small>×${refs.length}</small></summary>${refs.map((p, i) => itemButton(p, itemLabel(p, i), selectedId)).join('')}</details>`;
  return `<div class="pl-list">${html}</div>`;
}

// ---------- 오른쪽: 부품 카드 ----------
// 부품 id 로 "② 다리" 글자. 부품 목록이 없으면 번호표에서 이름을 찾고, 그래도 없으면(참고용) id
function tagOf(id, byId, numbers) {
  const p = byId.get(id);
  if (p) return numbers.tag(p);
  const n = numbers.byId?.get(id);
  const name = n ? [...numbers.byName].find(([, v]) => v === n)?.[0] : null;
  return name ? `${numbers.label(n)} ${name}` : String(id);
}

// 방법 짧은 글: "피스 2개씩", 용접·본드는 이름만
const howText = j => {
  const name = TYPE_NAMES[j.type] || j.type;
  const f = j.fastener;
  return f && !['glue', 'weld'].includes(j.type) ? `${name} ${f.qty}${f.unit || '개'}씩` : name;
};

// 선택한 부품 카드 (스펙 6.2): 번호·이름 칸·자재, 크기, 절대 위치, 기울기, 밀기, 붙는 곳, 쓰는 부속, 제작 순서, 메모, 버튼
export function partCard(part, { design = {}, parts = [], joints = [], numbers = null, steps = [], nudgeStep = 10 } = {}) {
  const nums = numbers || partNumbers(parts.length ? parts : [part]);
  const byId = new Map(parts.map(p => [p.id, p]));
  const n = nums.byId?.get(part.id);
  const ref = isRef(part);
  const step = NUDGE_STEPS.includes(nudgeStep) ? nudgeStep : 10;
  const moved = design.moved?.[part.id];
  const head = `<div class="pc-head">${n ? `<span class="pc-num">${nums.label(n)}</span>` : ''}<input class="pc-name" type="text" maxlength="40" data-act="part-name" value="${esc(part.name)}" aria-label="부품 이름"></div>
    ${part.origName && part.origName !== part.name ? `<p class="pc-orig">원래 이름: ${esc(part.origName)}</p>` : ''}`;
  const mat = part.extra && !ref
    ? `<label class="pc-sub">자재<select data-act="part-material">${Object.entries(MATERIALS).filter(([, m]) => m.kind !== 'ref').map(([k, m]) => `<option value="${k}"${k === part.material ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>`
    : `<p class="pc-sub">${esc(matName(part))}${ref ? ' · 참고용 (만들지 않음)' : ''}</p>`;
  const size = part.extra
    ? `<div class="xyz">${['폭', '높이', '깊이'].map((l, i) => `<label>${l}<input type="number" min="1" value="${num(part.size[i])}" data-act="part-size" data-i="${i}"></label>`).join('')}</div>
       ${FIXED_SHAPES.includes(part.shape) || hasRot(part) ? '' : '<div class="row-btns"><button data-act="rotate" data-axis="y">눕혀 돌리기 90°</button><button data-act="rotate" data-axis="x">세우기 90°</button></div>'}`
    : `<p class="dims">${part.size.map(round).join(' x ')} mm <small>크기는 위 치수 슬라이더로 바꿔요</small></p>`;
  const pos = `<p class="pc-h">위치 <small>(부품 가운데, mm)</small></p>
    <div class="xyz">${XYZ.map((l, i) => `<label>${l}<input type="number" step="${step}" value="${round(part.pos[i])}" data-act="part-abs" data-i="${i}"></label>`).join('')}</div>`;
  const rot = part.extra && !['wheel', 'caster', 'barrel'].includes(part.shape)
    ? `<div class="xyz">${[['앞에서 본 기울기(도)', 2], ['옆에서 본 기울기(도)', 0], ['위에서 본 기울기(도)', 1]].map(([l, i]) => `<label>${l}<input type="number" min="-90" max="90" step="5" value="${num(part.rot?.[i])}" data-act="part-rot" data-i="${i}"></label>`).join('')}</div>`
    : rotText(part.rot) ? `<p class="dims">기울기: ${rotText(part.rot)}</p>` : '';
  const nudge = `<div class="pc-move"><div class="pc-nudge">${NUDGE.map(([a, d, l]) => `<button data-act="nudge" data-axis="${a}" data-dir="${d}">${l}</button>`).join('')}</div>
    <div class="pc-step"><span>한 번에</span>${NUDGE_STEPS.map(s => `<button${s === step ? ' class="on"' : ''} data-act="nudge-step" data-step="${s}">${s}mm</button>`).join('')}</div>
    <p class="pc-keys">키보드: 화살표 = 좌우·앞뒤, PageUp·PageDown = 위아래</p></div>`;
  // 붙는 곳: 묶음 글자별로 합친다 (같은 묶음에 여러 곳이면 ×N곳)
  const mine = jointsOfPart(joints, part.id);
  const groups = new Map();
  for (const j of mine) {
    if (groups.has(j.group)) groups.get(j.group).push(j);
    else groups.set(j.group, [j]);
  }
  const jointList = groups.size
    ? `<div class="pc-joints">${[...groups].map(([g, list]) => {
        const j = list[0];
        const other = j.a === part.id ? j.b : j.a;
        return `<button data-act="pick-joint" data-id="${esc(g)}"><b>${esc(g)}</b> · ${esc(tagOf(other, byId, nums))}에 · ${esc(howText(j))}${list.length > 1 ? ` <small>×${list.length}곳</small>` : ''}</button>`;
      }).join('')}</div>`
    : '<p class="pc-empty">맞닿은 부품이 없어요.</p>';
  const welds = mine.filter(j => j.type === 'weld').length;
  const used = [...fastenerTotals(mine).map(t => `${t.name} ${t.qty}${t.unit}`), ...(welds ? [`용접 ${welds}곳`] : [])];
  // 제작 순서: 원래 이름이나 바꾼 이름이 들어간 줄 번호
  const names = [...new Set([part.origName, part.name].filter(Boolean))];
  const stepNos = (steps || []).map((s, i) => (names.some(nm => String(s).includes(nm)) ? i + 1 : 0)).filter(Boolean);
  const memo = `<div class="pc-sec"><b>메모</b>${part.note ? `<p class="pc-tnote">${esc(part.note)}</p>` : ''}<textarea data-act="part-note" rows="2" maxlength="200" placeholder="내 메모 (예: 옹이 없는 쪽을 위로)">${esc(part.userNote || '')}</textarea></div>`;
  const wasMoved = !part.extra && Array.isArray(moved) && moved.some(v => Number(v));
  const btns = `<div class="row-btns">${wasMoved ? '<button data-act="reset-move">원래 자리로</button>' : ''}${ref ? '' : '<button data-act="dup-part">복사</button>'}<button class="danger" data-act="remove-part">이 부품 빼기</button></div>`;
  return `<div class="sel pc-card" data-id="${esc(part.id)}">${head}${mat}
    ${size}${pos}${rot}${nudge}
    <div class="pc-sec"><b>붙는 곳</b>${jointList}</div>
    <p class="pc-sec"><b>쓰는 부속</b> ${used.length ? esc(used.join(', ')) : '없음'}</p>
    ${stepNos.length ? `<p class="pc-sec"><b>제작 순서</b> ${stepNos.join(', ')}번</p>` : ''}
    ${memo}${btns}</div>`;
}

// ---------- 오른쪽: 연결부 카드 (스펙 6.3) ----------
// joints = 그 묶음(같은 글자)의 연결부들. 방법·개수를 바꾸면 묶음 전체에 적용된다 (app.js)
export function jointCard(group, joints, { parts = [], numbers = null, design = null } = {}) {
  const j = joints?.[0];
  if (!j) return '';
  const byId = new Map(parts.map(p => [p.id, p]));
  const nums = numbers || partNumbers(parts);
  const edits = design?.jointEdits && typeof design.jointEdits === 'object' ? design.jointEdits : {};
  const edited = joints.some(x => Object.hasOwn(edits, x.id));
  const f = j.fastener;
  const opts = JOINT_TYPES.map(t => `<option value="${t}"${t === j.type ? ' selected' : ''}>${esc(TYPE_NAMES[t] || t)}</option>`).join('');
  const qty = f && !['glue', 'weld'].includes(j.type)
    ? `<label>개수 <small>(한 곳에)</small><input type="number" min="1" max="50" step="1" value="${num(f.qty)}" data-act="joint-qty"></label>`
    : '';
  return `<div class="sel jc-card" data-id="${esc(group)}">
    <div class="jc-head"><span class="jc-letter">${esc(group)}</span> <b>연결부</b> <small>같은 곳 ${joints.length}곳</small>${j.auto ? ' <span class="jc-auto">자동</span>' : ''}</div>
    <p class="jc-parts">${esc(tagOf(j.a, byId, nums))} + ${esc(tagOf(j.b, byId, nums))}</p>
    <div class="jc-row"><label>방법<select data-act="joint-type">${opts}</select></label>${qty}</div>
    <p class="dims">${esc(describeMethod(j))}</p>
    <p class="dims">구멍: ${esc(describeHoles(j, byId))}</p>
    ${j.note ? `<p class="pc-tnote">${esc(j.note)}</p>` : ''}
    <div class="row-btns"><button data-act="pick-joint" data-id="${esc(group)}" data-show="1">도면에서 보기</button>${edited ? '<button data-act="joint-reset">자동으로 되돌리기</button>' : ''}<button class="danger" data-act="joint-hide">이 연결 숨기기</button></div>
  </div>`;
}

// ---------- 오른쪽: 이 설계 고치기 ----------
// 글 칸은 name 만 (data-act 없음). 쓰던 글은 app.js 가 input 때 기억해 두었다가 다시 그릴 때 넣는다 (draft)
function editForm(draft = '', aiOn = false) {
  return `<form class="edit-form" data-act="design-edit">
    <label for="editText">이 설계 고치기</label>
    <textarea id="editText" name="edit" rows="2" maxlength="500" placeholder="예: 폭 1500, 높이 10cm 더 높게, 방부목으로">${esc(draft)}</textarea>
    <div class="edit-row"><button type="submit">고치기</button><span class="edit-hint">치수·자재는 무료로, 부품 추가·빼기는 AI 로 ${aiOn ? '(약 100~300원)' : '(키 필요)'}</span></div>
  </form>`;
}

// 뺀 부품 줄 글자: id(이름-번호), 이름을 바꾼 부품이면 바꾼 이름도
const removedLabel = r => (r.name && !String(r.id).startsWith(`${r.name}-`) ? `${r.id} (${r.name})` : String(r.id));

// selectedId: 부품 id 또는 'joint:<묶음 글자>'. removedParts: [{ id, name }] (app.js 가 템플릿을 다시 만들어 찾는다)
// editDraft: 이 설계 고치기 칸에 쓰던 글, aiOn: AI 를 쓸 수 있는지 (설정에서 켜고 키가 있음)
export function renderRight({ design, template, parts = [], joints = [], numbers = null, steps = [], selectedId = null, nudgeStep = 10, removedParts = [], openGroups = null, editDraft = '', aiOn = false }) {
  const nums = numbers || partNumbers(parts);
  let html = `<label class="title-in">작품 이름<input type="text" value="${esc(design.title)}" data-act="title"></label>`;
  if (template && template.params.length) {
    html += `<h4>치수</h4>${template.params.map(p => paramRow(p, design.params[p.key])).join('')}`;
  }
  const slots = Object.entries(template?.materialOptions || {}).filter(([, o]) => o.length > 1);
  if (slots.length) {
    html += '<h4>자재</h4>' + slots.map(([slot, opts]) => `<label class="mat">${esc(slotLabel(slot))}
      <select data-act="material" data-slot="${slot}">${opts.map(k => `<option value="${k}" ${(design.materials?.[slot] || opts[0]) === k ? 'selected' : ''}>${esc(MATERIALS[k].name)}</option>`).join('')}</select></label>`).join('');
  }
  html += editForm(editDraft, aiOn);
  const jointSel = typeof selectedId === 'string' && selectedId.startsWith('joint:') ? selectedId.slice(6) : null;
  const group = jointSel ? joints.filter(j => j.group === jointSel) : [];
  const part = !jointSel && selectedId ? parts.find(p => p.id === selectedId) : null;
  if (group.length) html += `<h4>선택한 연결부</h4>${jointCard(jointSel, group, { parts, numbers: nums, design })}`;
  else if (part) html += `<h4>선택한 부품</h4>${partCard(part, { design, parts, joints, numbers: nums, steps, nudgeStep })}`;
  else html += '<h4>선택한 부품</h4><p class="hint">3D·도면·아래 부품 목록에서 부품을 누르면 여기서 보고 고칠 수 있어요. 3D에서 선택한 부품은 끌어서 옮기고, Shift를 누른 채 끌면 위아래로 움직여요.</p>';
  html += `<h4>부품 목록 <small>${parts.filter(p => !isRef(p)).length}개</small></h4>${renderPartsList(parts, nums, jointSel ? null : selectedId, openGroups)}`;
  if (removedParts.length) {
    html += `<h4>뺀 부품 <small>${removedParts.length}개</small></h4><div class="pl-removed">${removedParts.map(r => `<button class="pl-item pl-gone" data-act="restore-part" data-id="${esc(r.id)}">${esc(removedLabel(r))} 되살리기</button>`).join('')}</div>`;
    if (removedParts.length >= 2) html += `<button class="link-btn" data-act="restore-parts">뺀 부품 ${removedParts.length}개 모두 되살리기</button>`;
  }
  // 숨긴 연결부(이 연결 숨기기, 방법 "없음")를 다시 보이게 하는 길
  if (Object.values(design.jointEdits || {}).some(e => e && (e.hidden || e.type === 'none'))) {
    html += '<button class="link-btn" data-act="joints-unhide">숨긴 연결부 다시 보이기</button>';
  }
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
