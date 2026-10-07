// 뚝딱설계: 상태를 들고 화면과 계산을 이어 준다
import { Viewer } from './ui/viewer3d.js';
import { renderTab, TABS, esc, won } from './ui/tabs.js';
import { renderLeft, renderRight, partFromForm } from './ui/sidebar.js';
import { getTemplate, MARKET_PRICES, MARKET_NOTES } from './core/templates/index.js';
import { MATERIALS } from './core/materials.js';
import { newDesign, buildParts, bounds, makeId } from './core/model.js';
import { cutList } from './core/cutlist.js';
import { buildBom } from './core/bom.js';
import { buildSteps, buildListing, suggestPrice } from './core/listing.js';
import { parseText } from './core/parser.js';
import { designWithAI, designFromImages, checkApiKey, cleanKey } from './core/ai.js';
import { addUsage, usageThisMonth } from './core/aiCost.js';
import { designFromVision, templateDesignFrom, cleanRefImages } from './core/vision.js';
import { initVisionDialog } from './ui/visionDialog.js';
import { createStore, browserBackend, isSafeUrl } from './core/storage.js';

const $ = sel => document.querySelector(sel);
const store = createStore(browserBackend());
let settings = store.getSettings();
// 예전 버전은 키의 앞뒤 빈칸만 지워 저장했으므로 한 번 더 정리한다
if (settings.apiKey && settings.apiKey !== cleanKey(settings.apiKey)) {
  settings = { ...settings, apiKey: cleanKey(settings.apiKey) };
  store.saveSettings(settings);
}
let links = store.getLinks();
let design = store.getDesign(store.getCurrentId()) || { ...newDesign('metal-shelf'), fresh: true };
let leftView = 'templates';
let tab = 'drawing';
let selectedId = null;
let derived = {};
const undoStack = [];
let gesture = false;
// 이번 접속에서 마지막으로 분석한 사진·장면 (고쳐서 다시 분석할 때 씀)
let lastVision = null;
// AI 한 번에 드는 돈 (참고값, 화면 안내용)
const AI_TEXT_COST = '약 100~300원';
const AI_PHOTO_COST = '약 200~400원';

// ---------- 계산 ----------
function compute() {
  const template = getTemplate(design.templateId);
  const parts = buildParts(design);
  const cut = cutList(parts, settings.priceOverrides);
  const bom = buildBom(design, parts, cut, template, settings.priceOverrides);
  const steps = buildSteps(design, template);
  const suggested = suggestPrice(bom.total, design.laborHours, design.hourlyRate);
  const price = design.price ?? suggested;
  const listing = buildListing({ design, template, parts, bom, price, weight: bom.weight });
  derived = { template, parts, cut, bom, steps, suggested, listing, market: MARKET_PRICES[design.templateId], marketNote: MARKET_NOTES[design.templateId] };
  if (selectedId && !parts.some(p => p.id === selectedId)) selectedId = null;
}

// ---------- 화면 ----------
const viewer = new Viewer($('#viewer'), {
  onSelect: id => { selectedId = id; renderViewer(); renderRightPanel(); },
  onMove: (id, delta) => mutate(() => moveBy(id, delta), { right: true })
});

function renderViewer(refit = false) {
  viewer.setParts(derived.parts, selectedId, { refit });
  const b = bounds(derived.parts);
  $('#stats').textContent = derived.parts.length
    ? `${b.size[0]} x ${b.size[2]} x ${b.size[1]} mm · 부품 ${derived.parts.length}개 · 재료비 약 ${won(Math.round(derived.bom.usedTotal / 100) * 100)} (자재 통째로 ${won(derived.bom.total)})`
    : '부품이 없어요';
  const refs = cleanRefImages(design.refImages);
  const strip = $('#refStrip');
  strip.innerHTML = refs.map((src, i) => `<button type="button" data-act="ref-toggle" title="원본 그림 크게·작게"><img src="${esc(src)}" alt="원본 ${i + 1}"></button>`).join('');
  strip.hidden = !refs.length;
}
function renderLeftPanel() {
  $('#left').innerHTML = renderLeft(leftView, { design, designs: store.listDesigns(), links });
}
function renderRightPanel() {
  const selected = derived.parts.find(p => p.id === selectedId) || null;
  $('#right').innerHTML = renderRight({ design, template: derived.template, selected, removedCount: (design.removed || []).length });
}
function renderTabs() {
  $('#tabs').innerHTML = TABS.map(([k, l]) => `<button data-act="tab" data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('');
  $('#tabBody').innerHTML = renderTab(tab, { design, ...derived });
}
function renderAll({ refit = false } = {}) {
  renderViewer(refit);
  renderLeftPanel();
  renderRightPanel();
  renderTabs();
  const aiOn = !!(settings.useAI && settings.apiKey);
  $('#aiBadge').textContent = aiOn ? 'AI 켜짐' : '무료 모드';
  $('#aiBadge').classList.toggle('on', aiOn);
}

// ---------- 저장과 되돌리기 ----------
let saveTimer = null;
let warnedSave = false;
let warnedFull = false;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    store.saveDesign(design);
    store.setCurrentId(design.id);
    if (!store.available && !warnedSave) { warnedSave = true; toast('이 브라우저에서는 저장이 막혀 있어요. 내보내기로 따로 보관하세요.'); }
    if (store.lastError === 'full' && !warnedFull) { warnedFull = true; toast('저장 공간이 꽉 찼어요. 안 쓰는 작업을 지우거나, 내보내기로 옮겨 둔 뒤 정리해 주세요.'); }
    if (store.lastError !== 'full') warnedFull = false;
    if (leftView === 'mine') renderLeftPanel();
  }, 300);
}
function pushUndo() {
  undoStack.push(JSON.stringify(design));
  if (undoStack.length > 50) undoStack.shift();
}
function undo() {
  const prev = undoStack.pop();
  if (!prev) return toast('더 되돌릴 게 없어요.');
  design = JSON.parse(prev);
  $('#understood').hidden = true;
  compute();
  renderAll();
  saveSoon();
}

// mutate: 되돌리기 저장 → 바꾸기 → 다시 계산 → 다시 그리기 → 저장
function mutate(fn, { right = true, left = false, refit = false, undoable = true } = {}) {
  if (undoable) pushUndo();
  fn();
  delete design.fresh;
  design.updatedAt = Date.now();
  compute();
  renderViewer(refit);
  renderTabs();
  if (right) renderRightPanel();
  if (left) renderLeftPanel();
  saveSoon();
}

function switchDesign(next, { refit = true } = {}) {
  pushUndo();
  // 둘러보기만 하고 안 고친 템플릿은 내 작업에 남기지 않는다
  if (design.fresh && design.id !== next.id) store.deleteDesign(design.id);
  design = next;
  selectedId = null;
  $('#understood').hidden = true;
  compute();
  renderAll({ refit });
  saveSoon();
}

// ---------- 부품 조작 ----------
const findExtra = id => design.extraParts.find(p => p.id === id);
// 돌리면 모양 약속이 깨지는 부품
const FIXED_SHAPES = new Set(['barrel', 'wheel', 'caster', 'cylinder']);
function moveBy(id, delta) {
  const ep = findExtra(id);
  if (ep) { ep.pos = ep.pos.map((v, i) => v + delta[i]); return; }
  design.moved ||= {};
  const cur = design.moved[id] || [0, 0, 0];
  design.moved[id] = cur.map((v, i) => v + delta[i]);
}
function keepBottom(ep, oldSize) {
  const bottom = ep.pos[1] - oldSize[1] / 2;
  ep.pos[1] = bottom + ep.size[1] / 2;
}
function removeSelected() {
  if (!selectedId) return;
  const id = selectedId;
  mutate(() => {
    if (findExtra(id)) design.extraParts = design.extraParts.filter(p => p.id !== id);
    else design.removed = [...new Set([...(design.removed || []), id])];
    selectedId = null;
  });
}

// ---------- 말로 설계 ----------
function showUnderstood(lines, unknown = [], candidates = [], extraHtml = '') {
  const el = $('#understood');
  const cands = candidates.map(id => getTemplate(id)).filter(Boolean);
  el.innerHTML = `<b>이렇게 이해했어요</b><ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}${unknown.map(u => `<li class="muted">${esc(u)}</li>`).join('')}</ul>
    ${cands.length ? `<div class="cands">혹시 이걸 찾으셨나요? ${cands.map(t => `<button data-act="pick-template" data-id="${t.id}">${esc(t.name)}</button>`).join('')}</div>` : ''}
    ${extraHtml}
    <button class="close" data-act="close-understood" title="닫기">✕</button>`;
  el.hidden = false;
}

// ---------- 사진·영상으로 설계 ----------
function showVisionUnderstood(d, costLine = '') {
  const similar = d.similarTemplate ? getTemplate(d.similarTemplate) : null;
  const canFix = lastVision && lastVision.designId === d.id;
  const extra = `<div class="vision-extra">
      ${similar ? `<button data-act="open-similar" data-id="${esc(similar.id)}">비슷한 템플릿으로 열기: ${esc(similar.name)} (치수 조절이 쉬워요)</button>` : ''}
      ${canFix ? `<form class="fix-form" data-act="vision-fix"><input name="fix" required maxlength="300" placeholder="틀린 점 (예: 다리는 4개, 높이는 더 낮게, 상판은 원목)"><button type="submit">고쳐서 다시 분석 (${AI_PHOTO_COST})</button></form>` : ''}
      ${costLine ? `<p class="note">${esc(costLine)}</p>` : ''}
      <p class="note">${d.source === 'video' ? '영상' : '사진'}을 보고 만든 참고용 설계예요. 크기는 추정이니 실제 물건을 재서 확인하세요.</p>
    </div>`;
  const assumptions = Array.isArray(d.aiAssumptions) ? d.aiAssumptions : [];
  showUnderstood([String(d.aiAnalysis || '') || `${d.title} 설계를 만들었어요.`], assumptions.map(a => `추정: ${a}`), [], extra);
}

function applyVisionResult(result, { images, options, refImages, source }) {
  const cost = noteUsage(result.costKrw);
  const next = designFromVision(result, { refImages, source });
  lastVision = { images, options, result, refImages: next.refImages, source: next.source, designId: next.id };
  switchDesign(next);
  showVisionUnderstood(next, cost);
  toast(`설계를 만들었어요.${cost ? ` ${cost}.` : ''} 부품을 눌러 크기와 위치를 고칠 수 있어요.`);
}

async function fixVision(text, form) {
  if (!lastVision) return toast('고쳐서 다시 분석은 사진을 분석한 그 자리에서만 할 수 있어요. 사진을 다시 넣어 주세요.');
  if (!settings.apiKey) return toast('설정에서 API 키를 먼저 넣어 주세요.');
  const base = lastVision;
  const btn = form.querySelector('button');
  btn.disabled = true;
  btn.textContent = '다시 분석 중이에요... (20초~1분)';
  try {
    const options = { ...base.options, previous: base.result, correction: text };
    const r = await designFromImages(base.images, options, settings.apiKey);
    const cost = noteUsage(r.costKrw);
    const next = designFromVision(r, { refImages: base.refImages, source: base.source });
    lastVision = { ...base, result: r, designId: next.id };
    switchDesign(next);
    showVisionUnderstood(next, cost);
    toast(`고친 점을 반영해서 새 설계를 만들었어요.${cost ? ` ${cost}.` : ''} 이전 설계는 내 작업에 남아 있어요.`);
  } catch (e) {
    const cost = noteUsage(e.costKrw);
    toast(cost ? `${e.message} (${cost})` : e.message);
    btn.disabled = false;
    btn.textContent = `고쳐서 다시 분석 (${AI_PHOTO_COST})`;
  }
}

// ---------- AI 사용 요금 (참고값) ----------
// 돈이 든 요청이면 이번 달 기록에 더하고 알림 문구를 돌려준다.
// 폰 앱과 브라우저 탭에서 따로 써도 합쳐지도록 저장된 값을 새로 읽어서 더한다
function noteUsage(krw) {
  if (!Number.isFinite(krw)) return '';
  store.saveAiUsage(addUsage(store.getAiUsage(), krw));
  return `이번 AI 사용 약 ${won(krw)} (참고값)`;
}

// 말로 설계: 무료 해석이 먼저. AI 는 사용자가 버튼을 누를 때만 쓴다 (돈이 들어서)
let lastAsk = null; // { text, found }
// AI 설계 요청이 진행 중인지. 진행 중에는 버튼을 새로 그리지 않아 같은 요청에 돈을 두 번 쓰지 않게 한다
let aiBusy = false;
function aiOfferHtml(found) {
  if (!settings.useAI) return found ? '' : '<p class="note">템플릿에 없는 모양은 설정에서 "AI 도움"을 켜면 AI로 설계할 수 있어요.</p>';
  if (found) return `<div class="ai-offer small"><button type="button" data-act="ai-design">원하는 모양이 아니면 AI로 설계 (${AI_TEXT_COST})</button></div>`;
  if (!settings.apiKey) return '<div class="ai-offer"><p>AI로 설계하려면 클로드 API 키가 필요해요.</p><button type="button" data-act="open-key-settings">설정 열기 (키 만드는 법)</button></div>';
  return `<div class="ai-offer"><p>AI로 설계할까요? 템플릿에 없는 모양도 부품 목록으로 만들어 줘요.</p><button type="button" class="primary" data-act="ai-design">AI로 설계하기 (${AI_TEXT_COST})</button></div>`;
}
// 설정을 바꾸면 화면에 떠 있는 제안도 바로 바꿀 수 있게 자리를 감싸 둔다
const aiOffer = found => `<div class="ai-offer-slot">${aiOfferHtml(found)}</div>`;
function refreshAiOffer() {
  if (aiBusy) return;
  const slot = document.querySelector('#understood .ai-offer-slot');
  if (slot && lastAsk) slot.innerHTML = aiOfferHtml(lastAsk.found);
}
// 알림은 금방 사라지므로 버튼 아래에도 한 줄 남긴다 (글자는 textContent 로)
function setOfferMsg(btn, msg) {
  const box = btn.closest('.ai-offer');
  if (!box) return;
  let p = box.querySelector('.ai-err');
  if (!msg) { p?.remove(); return; }
  if (!p) { p = document.createElement('p'); p.className = 'ai-err'; box.appendChild(p); }
  p.textContent = msg;
}

async function runAiDesign(btn) {
  const text = lastAsk?.text || '';
  if (!text.trim() || aiBusy) return;
  // 설정에서 끈 뒤에 화면에 남은 버튼을 눌러도 돈이 들지 않게
  if (!settings.useAI) { refreshAiOffer(); toast('설정에서 AI 도움이 꺼져 있어요. 켜면 AI로 설계할 수 있어요.'); return; }
  if (!settings.apiKey) { openSettings({ guide: true }); toast('AI로 설계하려면 클로드 API 키가 필요해요. 키 만드는 법을 펼쳐 두었어요.'); return; }
  const label = btn.textContent;
  aiBusy = true;
  btn.disabled = true;
  btn.textContent = 'AI가 설계 중이에요... (20초~1분)';
  setOfferMsg(btn, '');
  $('#askBtn').disabled = true;
  try {
    const r = await designWithAI(text, settings.apiKey);
    const cost = noteUsage(r.costKrw);
    const next = newDesign('custom');
    Object.assign(next, { title: r.title, extraParts: r.parts, aiSteps: r.steps, aiHardware: r.hardware });
    switchDesign(next);
    showUnderstood([`AI가 만든 설계: ${r.title}`, `부품 ${r.parts.length}개`, '부품을 눌러 크기와 위치를 고칠 수 있어요.', cost].filter(Boolean));
    toast(`AI 설계를 만들었어요.${cost ? ` ${cost}.` : ''}`);
  } catch (e) {
    const cost = noteUsage(e.costKrw);
    const msg = cost ? `${e.message} (${cost})` : e.message;
    toast(msg);
    btn.disabled = false;
    btn.textContent = label;
    setOfferMsg(btn, msg);
  } finally {
    aiBusy = false;
    $('#askBtn').disabled = false;
  }
}

function ask(text) {
  if (!text.trim()) return;
  const r = parseText(text);
  lastAsk = { text, found: !!r.templateId };
  if (!r.templateId) {
    showUnderstood(['어떤 작품인지 템플릿에서 찾지 못했어요.'], r.unknown, r.candidates, aiOffer(false));
    return;
  }
  const next = newDesign(r.templateId);
  next.params = r.params;
  next.materials = r.materials;
  switchDesign(next);
  showUnderstood(r.understood, r.unknown, r.candidates.filter(id => id !== r.templateId).slice(0, 2), aiOffer(true));
}

// ---------- 파일 내보내기 ----------
function download(name, blobOrUrl) {
  const a = document.createElement('a');
  a.href = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (typeof blobOrUrl !== 'string') setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const safeName = s => String(s || '뚝딱설계').replace(/[\\/:*?"<>|]/g, '_');

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

// ---------- 설정 ----------
function setKeyMsg(text, kind = '') {
  const el = $('#keyMsg');
  el.textContent = text;
  el.className = `key-msg ${kind}`;
  el.hidden = !text;
}
// 키 칸이 바뀌거나 창을 다시 열 때마다 늘어나는 번호. 늦게 온 옛 "키 확인" 결과는 버린다
let keySeq = 0;
// 처음 키를 넣을 때 AI 도움 칸을 한 번만 켜 준다 (사용자가 끄면 다시 켜지 않게)
let autoCheckedAI = false;
// guide: 키 만드는 법을 펼쳐서 연다 (저장된 키가 없을 때도 펼침)
function openSettings({ guide = false } = {}) {
  keySeq++;
  autoCheckedAI = false;
  $('#keyCheck').disabled = false;
  $('#apiKey').value = settings.apiKey || '';
  $('#apiKey').type = 'password';
  $('#keyShow').textContent = '보기';
  $('#useAI').checked = !!settings.useAI;
  setKeyMsg('');
  $('#keyGuide').open = guide || !settings.apiKey;
  const u = usageThisMonth(store.getAiUsage());
  $('#aiUsageLine').textContent = `이번 달 이 기기에서 AI 사용: 약 ${won(u.krw)} (${u.count}번). 참고값이라 실제 청구 금액은 클로드 콘솔에서 확인하세요.`;
  $('#priceTable').innerHTML = Object.entries(MATERIALS).map(([k, m]) => `<label><span>${esc(m.name)} <small>/${m.unit}</small></span>
    <input type="number" min="0" step="any" data-price="${k}" value="${esc(String(settings.priceOverrides?.[k] ?? m.price))}"></label>`).join('');
  $('#settings').showModal();
}
// 저장 버튼을 누르는 순간 바로 저장한다 (dialog close 이벤트는 브라우저 상태에 따라 늦게 올 수 있음)
$('#settings form').addEventListener('submit', e => {
  if (e.submitter?.value !== 'save') return;
  const key = cleanKey($('#apiKey').value);
  // sk-ant- 로 시작하지 않는 글(다른 비밀번호 같은 것)이 클로드로 보내지지 않게 저장을 막는다
  if (key && !key.startsWith('sk-ant-')) {
    e.preventDefault();
    setKeyMsg('클로드 키는 sk-ant- 로 시작해요. 복사가 덜 됐는지 확인해 주세요. 키 없이 쓰려면 칸을 비우고 저장하세요.', 'bad');
    $('#apiKey').focus();
    return;
  }
  const overrides = {};
  document.querySelectorAll('[data-price]').forEach(inp => {
    if (inp.value.trim() === '') return;
    const v = Number(inp.value);
    if (Number.isFinite(v) && v >= 0 && v !== MATERIALS[inp.dataset.price].price) overrides[inp.dataset.price] = v;
  });
  settings = { ...settings, apiKey: key, useAI: $('#useAI').checked, priceOverrides: overrides };
  store.saveSettings(settings);
  compute();
  renderAll();
  vision.refresh();
  refreshAiOffer();
  toast('설정을 저장했어요.');
});
// 닫기는 저장하지 않고 닫는다 (Enter 를 누르면 저장 버튼이 눌리게 submit 버튼이 아님)
$('#settingsClose').addEventListener('click', () => $('#settings').close());

$('#apiKey').addEventListener('input', () => {
  keySeq++;
  $('#keyCheck').disabled = false;
  setKeyMsg('');
  // 처음 키를 넣을 때는 AI 도움을 켜 둔다 (쓰기 전에 늘 물어보므로 돈이 바로 들지 않음)
  if (!settings.apiKey && !autoCheckedAI && $('#apiKey').value.trim()) {
    $('#useAI').checked = true;
    autoCheckedAI = true;
  }
});
$('#keyShow').addEventListener('click', () => {
  const inp = $('#apiKey');
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  $('#keyShow').textContent = show ? '숨기기' : '보기';
});
$('#keyCheck').addEventListener('click', async () => {
  const btn = $('#keyCheck');
  const key = cleanKey($('#apiKey').value);
  $('#apiKey').value = key;
  const seq = ++keySeq;
  btn.disabled = true;
  setKeyMsg('확인 중이에요...');
  let r;
  try {
    r = await checkApiKey(key);
  } catch (e) {
    r = { ok: false, message: `확인 중 문제가 생겼어요: ${e.message}` };
  }
  // 그 사이 키를 바꾸거나 창을 다시 열었으면 옛 결과는 버린다
  if (seq !== keySeq) return;
  setKeyMsg(r.message, r.ok ? 'ok' : 'bad');
  btn.disabled = false;
});

const vision = initVisionDialog({
  getApiKey: () => settings.apiKey,
  onResult: applyVisionResult,
  onCost: noteUsage,
  openSettings,
  toast
});
$('#resetPrices').addEventListener('click', () => {
  document.querySelectorAll('[data-price]').forEach(inp => { inp.value = MATERIALS[inp.dataset.price].price; });
});

// ---------- 이벤트 ----------
$('#ask').addEventListener('submit', e => { e.preventDefault(); ask($('#askText').value); });
$('#settingsBtn').addEventListener('click', () => openSettings());
$('#aiBadge').addEventListener('click', () => openSettings());
$('#visionBtn').addEventListener('click', () => vision.open());
$('#undoBtn').addEventListener('click', undo);
document.querySelectorAll('.view-btns button').forEach(b => b.addEventListener('click', () => viewer.setView(b.dataset.view)));

document.addEventListener('click', async e => {
  const t = e.target.closest('[data-act]');
  if (!t || t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'FORM') return;
  const id = t.dataset.id;
  switch (t.dataset.act) {
    case 'tab': tab = t.dataset.tab; renderTabs(); break;
    case 'left-tab': leftView = t.dataset.tab; renderLeftPanel(); break;
    case 'pick-template': switchDesign({ ...newDesign(id), fresh: true }); $('#understood').hidden = true; break;
    case 'open-design': {
      const d = store.getDesign(id);
      if (!d) break;
      switchDesign(d);
      if (d.aiAnalysis) showVisionUnderstood(d);
      else $('#understood').hidden = true;
      break;
    }
    case 'open-similar': {
      const d = templateDesignFrom(id, derived.parts);
      if (!d) break;
      // 원본 그림은 템플릿 쪽에도 붙여 두어 비교할 수 있게
      d.refImages = cleanRefImages(design.refImages);
      d.source = design.source;
      switchDesign(d);
      $('#understood').hidden = true;
      toast('비슷한 템플릿으로 열었어요. 오른쪽에서 치수를 맞춰 보세요. AI 설계는 내 작업에 남아 있어요.');
      break;
    }
    case 'ref-toggle': $('#refStrip').classList.toggle('big'); break;
    case 'dup-design': {
      const d = store.getDesign(id);
      if (!d) break;
      const copy = { ...structuredClone(d), id: makeId('d'), title: `${d.title} (복사)` };
      delete copy.fresh;
      if (design.id === id) { delete design.fresh; store.saveDesign(design); }
      store.saveDesign(copy);
      switchDesign(copy);
      break;
    }
    case 'del-design': {
      if (!confirm('이 작업을 지울까요? 되돌릴 수 없어요.')) break;
      store.deleteDesign(id);
      undoStack.length = 0; // 지운 작업이 되돌리기로 살아나지 않게
      if (id === design.id) {
        const rest = store.listDesigns();
        design = rest[0] || { ...newDesign('metal-shelf'), fresh: true };
        selectedId = null;
        $('#understood').hidden = true;
        store.setCurrentId(design.id);
        compute();
        renderAll({ refit: true });
      } else renderLeftPanel();
      break;
    }
    case 'export': download(`뚝딱설계-백업-${new Date().toISOString().slice(0, 10)}.json`, new Blob([store.exportAll()], { type: 'application/json' })); break;
    case 'del-link': links = links.filter(l => l.id !== id); store.saveLinks(links); renderLeftPanel(); break;
    case 'link-to-text': {
      const l = links.find(x => x.id === id);
      if (l) { $('#askText').value = l.memo || ''; $('#askText').focus(); toast('메모를 말로 설계 칸에 넣었어요. 치수를 더 적고 "도면 만들기"를 누르세요.'); }
      break;
    }
    case 'close-understood': $('#understood').hidden = true; break;
    case 'reset-move': mutate(() => { delete design.moved[selectedId]; }); break;
    case 'remove-part': removeSelected(); break;
    case 'restore-parts': mutate(() => { design.removed = []; }); break;
    case 'rotate': {
      const ep = findExtra(selectedId);
      if (!ep) break;
      if (FIXED_SHAPES.has(ep.shape)) { toast('아치·바퀴·원기둥 부품은 돌릴 수 없어요. 크기와 위치만 바꿀 수 있어요.'); break; }
      mutate(() => {
        const old = [...ep.size];
        if (t.dataset.axis === 'y') [ep.size[0], ep.size[2]] = [ep.size[2], ep.size[0]];
        else [ep.size[0], ep.size[1]] = [ep.size[1], ep.size[0]];
        keepBottom(ep, old);
      });
      break;
    }
    case 'print': window.print(); break;
    case 'save-svg': {
      const svg = document.querySelector('.drawing-wrap svg');
      if (svg) download(`${safeName(design.title)}-도면.svg`, new Blob([svg.outerHTML], { type: 'image/svg+xml' }));
      break;
    }
    case 'save-png': download(`${safeName(design.title)}-3D.png`, viewer.snapshot()); break;
    case 'copy-listing': {
      const text = `${derived.listing.title}\n\n${derived.listing.body}`;
      try { await navigator.clipboard.writeText(text); toast('판매글을 복사했어요. 당근 글쓰기에 붙여넣으세요.'); }
      catch { toast('복사가 막혀 있어요. 글을 길게 눌러 직접 복사해 주세요.'); }
      break;
    }
    case 'open-prices': openSettings(); break;
    case 'ai-design': runAiDesign(t); break;
    case 'open-key-settings': openSettings({ guide: true }); break;
  }
});

document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-act]');
  if (!f) return;
  e.preventDefault();
  const fd = new FormData(f);
  if (f.dataset.act === 'add-link') {
    if (!isSafeUrl(String(fd.get('url')).trim())) { toast('http:// 또는 https:// 로 시작하는 링크만 저장할 수 있어요.'); return; }
    links = [{ id: makeId('l'), url: String(fd.get('url')).trim(), memo: String(fd.get('memo') || '').trim(), createdAt: Date.now() }, ...links];
    store.saveLinks(links);
    renderLeftPanel();
    toast('링크를 저장했어요.');
  } else if (f.dataset.act === 'vision-fix') {
    const text = String(fd.get('fix') || '').trim();
    if (text) fixVision(text, f);
  } else if (f.dataset.act === 'add-part') {
    const ep = partFromForm(fd, makeId('p'));
    if (derived.parts.length) {
      const b = bounds(derived.parts);
      ep.pos[0] = b.max[0] + ep.size[0] / 2 + 50;
    }
    mutate(() => { design.extraParts = [...(design.extraParts || []), ep]; selectedId = ep.id; });
    toast('부품을 오른쪽에 놓았어요. 끌어서 자리를 잡아 주세요.');
  }
});

document.addEventListener('input', e => {
  const t = e.target;
  const act = t.dataset?.act;
  if (!act) return;
  if (act === 'param') {
    if (!gesture) { pushUndo(); gesture = true; }
    delete design.fresh;
    const v = Number(t.value);
    if (!Number.isFinite(v)) return;
    design.params[t.dataset.key] = v;
    t.closest('.param-in').querySelectorAll('input').forEach(i => { if (i !== t) i.value = v; });
    compute();
    renderViewer();
    renderTabs();
    saveSoon();
  } else if (act === 'title') {
    delete design.fresh;
    design.title = t.value;
    compute();
    renderTabs();
    saveSoon();
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  const act = t.dataset?.act;
  if (!act) {
    // 판매 탭의 숫자 칸
    const f = t.dataset?.field;
    if (f) mutate(() => {
      if (f === 'price' && t.value.trim() === '') delete design.price;
      else design[f] = Math.max(0, Number(t.value) || 0);
    }, { right: false });
    return;
  }
  const i = Number(t.dataset.i);
  switch (act) {
    case 'param': gesture = false; renderRightPanel(); break;
    case 'material': mutate(() => { design.materials = { ...design.materials, [t.dataset.slot]: t.value }; }); break;
    case 'check': mutate(() => { design.checked = { ...design.checked, [t.dataset.id]: t.checked }; }, { right: false, undoable: false }); break;
    case 'part-move': mutate(() => {
      design.moved ||= {};
      const cur = design.moved[selectedId] || [0, 0, 0];
      cur[i] = Number(t.value) || 0;
      design.moved[selectedId] = cur;
    }); break;
    case 'part-pos': {
      const ep = findExtra(selectedId);
      if (ep) mutate(() => { ep.pos[i] = Number(t.value) || 0; if (i === 1) ep.pos[1] = Math.max(ep.size[1] / 2, ep.pos[1]); });
      break;
    }
    case 'part-size': {
      const ep = findExtra(selectedId);
      if (ep) mutate(() => {
        const old = [...ep.size];
        const v = Math.max(1, Number(t.value) || 1);
        ep.size[i] = v;
        // 모양 약속 지키기: 아치는 높이 = 폭/2, 바퀴는 지름 두 값 같게, 원기둥은 폭 = 깊이
        if (ep.shape === 'barrel') { if (i === 1) ep.size[0] = v * 2; else ep.size[1] = ep.size[0] / 2; }
        if (ep.shape === 'wheel' && i > 0) { ep.size[1] = v; ep.size[2] = v; }
        if (ep.shape === 'cylinder' && i !== 1) { ep.size[0] = v; ep.size[2] = v; }
        keepBottom(ep, old);
      });
      break;
    }
    case 'import': {
      const file = t.files?.[0];
      if (!file) break;
      file.text().then(text => {
        try {
          const r = store.importAll(text);
          links = store.getLinks();
          settings = store.getSettings();
          const fresh = store.getDesign(design.id);
          if (fresh) design = fresh;
          undoStack.length = 0;
          $('#understood').hidden = true;
          compute();
          renderAll();
          toast(`작업 ${r.designs}개, 링크 ${r.links}개를 불러왔어요.`);
        } catch (err) { toast(err.message); }
      });
      break;
    }
  }
});

document.addEventListener('keydown', e => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undo(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && selectedId) { e.preventDefault(); removeSelected(); }
  else if (e.key === 'Escape' && !typing) { selectedId = null; renderViewer(); renderRightPanel(); }
});

// ---------- 시작 ----------
compute();
renderAll({ refit: true });
saveSoon();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
