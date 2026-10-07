// "사진·영상으로 설계" 창
import { imageFromFile, openVideo, seekFrame, autoFrames } from './media.js';
import { MAX_PHOTOS, MAX_FRAMES, AUTO_FRAMES, MAX_REF_IMAGES } from '../core/vision.js';
import { designFromImages } from '../core/ai.js';
import { esc } from './tabs.js';

// 작은 그림 4장: 전체에서 고르게
function spreadPick(list, k) {
  if (list.length <= k) return list;
  return Array.from({ length: k }, (_, i) => list[Math.round((i * (list.length - 1)) / (k - 1))]);
}

export function initVisionDialog({ getApiKey, onResult, onCost, openSettings, toast }) {
  const dlg = document.getElementById('vision');
  const $ = s => dlg.querySelector(s);
  let items = [];
  let source = 'photo';
  let video = null;
  let busy = false;     // AI 분석 중
  let loading = false;  // 사진 읽기·장면 뽑기 중
  let gen = 0;          // 불러오기 차례 번호. 늦게 끝난 옛 작업 결과는 버린다

  const limit = () => (source === 'video' ? MAX_FRAMES : MAX_PHOTOS);
  const locked = () => busy || loading;

  function setMsg(text, kind = '') {
    const el = $('#visionMsg');
    el.textContent = text || '';
    el.className = `vision-msg ${kind}`;
  }

  function renderAction() {
    const el = $('#visionAction');
    if (!getApiKey()) {
      el.innerHTML = `<div class="vision-nokey"><b>앱 안 분석에는 클로드 API 키가 필요해요.</b>
        <p>설정 화면에 키 만드는 법이 있어요. 키 없이 하려면 클로드와의 대화창에 사진, 영상 파일, 릴스 링크를 보내고 <b>"사진으로 설계해줘"</b>라고 말하세요. 불러오기 파일을 만들어 드려요.</p>
        <div class="row-btns"><button type="button" data-v="settings">설정 열기 (키 만드는 법)</button></div></div>`;
      return;
    }
    const disabled = !items.length || locked();
    el.innerHTML = `<button type="button" class="primary big-btn" data-v="analyze" ${disabled ? 'disabled' : ''}>${busy ? 'AI가 분석 중이에요... (20초~1분)' : '분석해서 설계 만들기 (약 200~400원)'}</button>`;
  }

  function render() {
    const lock = locked();
    $('#visionThumbs').innerHTML = items.length
      ? items.map((it, i) => `<figure><img src="${esc(it.thumb)}" alt="${esc(it.label)}"><figcaption>${esc(it.label)}</figcaption>
          <button type="button" class="icon" data-remove="${i}" title="빼기" ${lock ? 'disabled' : ''}>✕</button></figure>`).join('')
      : '<p class="empty">아직 넣은 사진이나 장면이 없어요.</p>';
    $('#visionCount').textContent = `${items.length}장 / 최대 ${limit()}장`;
    // 바쁠 때는 새 파일을 못 고르게 잠근다
    $('#visionPhotos').disabled = lock;
    $('#visionVideo').disabled = lock;
    dlg.querySelectorAll('.btn.pick').forEach(l => l.classList.toggle('disabled', lock));
    $('#visionAddFrame').disabled = !video || lock || items.length >= MAX_FRAMES;
    $('#visionAuto').disabled = !video || lock;
    renderAction();
  }

  function clearVideo() {
    if (video) URL.revokeObjectURL(video.url);
    video = null;
    $('#visionVideoBox').hidden = true;
    const p = $('#visionPlayer');
    p.removeAttribute('src');
    p.load();
  }

  async function addPhotos(files) {
    if (locked()) return;
    const my = ++gen;
    if (source === 'video') { items = []; clearVideo(); }
    source = 'photo';
    const room = Math.max(0, MAX_PHOTOS - items.length);
    const list = [...files].slice(0, room);
    setMsg(files.length > room ? `사진은 최대 ${MAX_PHOTOS}장까지예요. 앞의 ${room}장만 넣었어요.` : '');
    loading = true;
    render();
    const added = [];
    for (const f of list) {
      try { added.push(await imageFromFile(f)); } catch (e) { if (my === gen) setMsg(e.message, 'err'); }
      if (my !== gen) return;
    }
    items = [...items, ...added];
    loading = false;
    render();
  }

  async function grabAuto(my) {
    loading = true;
    render();
    setMsg('영상에서 장면을 뽑는 중이에요...');
    const { frames, failed } = await autoFrames(video.video, AUTO_FRAMES);
    if (my !== gen) return;
    items = frames;
    video.video.currentTime = 0;
    if (frames.length) {
      setMsg(`장면 ${frames.length}장을 뽑았어요${failed ? ` (${failed}장은 못 뽑았어요)` : ''}. 재생하다가 "지금 장면 추가"로 더 넣거나 ✕로 뺄 수 있어요. 물건이 잘 보이는 장면만 남기면 더 정확해요.`);
    } else {
      setMsg('장면을 하나도 못 뽑았어요. 재생하다가 "지금 장면 추가"로 직접 넣어 주세요.', 'err');
    }
    loading = false;
    render();
  }

  async function loadVideo(file) {
    if (locked()) return;
    const my = ++gen;
    items = [];
    clearVideo();
    source = 'video';
    loading = true;
    setMsg('영상을 여는 중이에요...');
    render();
    try {
      const v = await openVideo(file, $('#visionPlayer'));
      if (my !== gen) { URL.revokeObjectURL(v.url); return; }
      video = v;
      $('#visionVideoBox').hidden = false;
      await grabAuto(my);
    } catch (e) {
      if (my !== gen) return;
      loading = false;
      clearVideo();
      source = 'photo';
      setMsg(e.message, 'err');
      render();
    }
  }

  async function addCurrentFrame() {
    if (!video || locked() || items.length >= MAX_FRAMES) return;
    const my = gen;
    video.video.pause();
    loading = true;
    render();
    try {
      const frame = await seekFrame(video.video, video.video.currentTime);
      if (my !== gen) return;
      items = [...items, frame];
      setMsg('');
    } catch (e) {
      if (my !== gen) return;
      setMsg(e.message, 'err');
    }
    loading = false;
    render();
  }

  function readDims() {
    const dims = {};
    for (const k of ['width', 'depth', 'height']) {
      const v = Number($(`[data-dim="${k}"]`).value);
      if (Number.isFinite(v) && v > 0) dims[k] = v;
    }
    return dims;
  }

  function reset() {
    gen += 1;
    loading = false;
    items = [];
    clearVideo();
    source = 'photo';
    setMsg('');
    dlg.querySelectorAll('[data-dim]').forEach(i => { i.value = ''; });
    $('#visionMemo').value = '';
    $('#visionPrefer').value = 'auto';
  }

  async function analyze() {
    const key = getApiKey();
    if (!key || !items.length || locked()) return;
    // 기다리는 동안 바뀌지 않도록 지금 상태를 붙잡아 둔다
    const snapshot = items.slice();
    const src = source;
    const options = { source: src, dims: readDims(), memo: $('#visionMemo').value, prefer: $('#visionPrefer').value };
    const images = snapshot.map(({ base64, mediaType }) => ({ base64, mediaType }));
    const refImages = spreadPick(snapshot, MAX_REF_IMAGES).map(i => i.thumb);
    busy = true;
    setMsg('');
    render();
    try {
      const result = await designFromImages(images, options, key);
      busy = false;
      onResult(result, { images, options, refImages, source: src });
      reset();
      if (dlg.open) dlg.close();
      return;
    } catch (e) {
      // 응답을 받은 뒤 실패했으면 요금이 나갔으므로 기록하고 금액도 알려 준다
      const cost = onCost?.(e.costKrw) || '';
      const msg = cost ? `${e.message} (${cost})` : e.message;
      setMsg(msg, 'err');
      // 창을 닫은 뒤에 실패하면 알림으로 알려 준다
      if (!dlg.open) toast(msg);
    }
    busy = false;
    render();
  }

  $('#visionPhotos').addEventListener('change', e => { const f = e.target.files; if (f?.length) addPhotos(f); e.target.value = ''; });
  $('#visionVideo').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) loadVideo(f); e.target.value = ''; });
  $('#visionAddFrame').addEventListener('click', addCurrentFrame);
  $('#visionAuto').addEventListener('click', () => { if (video && !locked()) grabAuto(++gen); });
  $('#visionThumbs').addEventListener('click', e => {
    const b = e.target.closest('[data-remove]');
    if (!b || locked()) return;
    items.splice(Number(b.dataset.remove), 1);
    render();
  });
  $('#visionAction').addEventListener('click', e => {
    const v = e.target.closest('[data-v]')?.dataset.v;
    if (v === 'analyze') analyze();
    else if (v === 'settings') openSettings();
  });
  $('#visionClose').addEventListener('click', () => {
    if (busy) { toast('분석이 끝날 때까지 기다려 주세요. 끝나면 결과가 바로 열려요.'); return; }
    dlg.close();
  });
  dlg.addEventListener('cancel', e => { if (busy) e.preventDefault(); });

  return {
    open() { render(); dlg.showModal(); },
    refresh() { if (dlg.open) render(); }
  };
}
