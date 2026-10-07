// 브라우저 전용: 사진 줄이기, 영상 장면 잡기 (파일은 내 기기 안에서만 다룬다)
import { fitSize, pickFrameTimes, PHOTO_EDGE, FRAME_EDGE, THUMB_EDGE } from '../core/vision.js';

function toJpeg(source, sw, sh, maxEdge, quality) {
  const { width, height } = fitSize(sw, sh, maxEdge);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  c.getContext('2d').drawImage(source, 0, 0, width, height);
  return c.toDataURL('image/jpeg', quality);
}
const base64Of = url => url.slice(url.indexOf(',') + 1);

// 사진 파일 → { base64, mediaType, thumb, label }
export async function imageFromFile(file) {
  if (/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
    throw new Error(`'${file.name}'은 아이폰 HEIC 사진이라 브라우저가 못 열어요. 아이폰 설정 > 카메라 > 포맷 > "높은 호환성"으로 찍거나 JPG로 바꿔서 올려 주세요.`);
  }
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`'${file.name}' 사진을 열 수 없어요. JPG나 PNG로 올려 주세요.`);
  }
  try {
    const full = toJpeg(bmp, bmp.width, bmp.height, PHOTO_EDGE, 0.85);
    return {
      base64: base64Of(full),
      mediaType: 'image/jpeg',
      thumb: toJpeg(bmp, bmp.width, bmp.height, THUMB_EDGE, 0.7),
      label: file.name.slice(0, 20)
    };
  } finally {
    bmp.close?.();
  }
}

// 녹화 앱이 만든 webm 은 길이가 Infinity 로 나올 때가 있어, 끝으로 한 번 보내서 길이를 알아낸다
function settleDuration(el) {
  if (Number.isFinite(el.duration)) return Promise.resolve();
  return new Promise(resolve => {
    const done = () => { el.removeEventListener('durationchange', check); clearTimeout(timer); el.currentTime = 0; resolve(); };
    const check = () => { if (Number.isFinite(el.duration)) done(); };
    const timer = setTimeout(done, 4000);
    el.addEventListener('durationchange', check);
    el.currentTime = 1e9;
  });
}

const VIDEO_FAIL = '이 영상은 브라우저가 못 열어요. mp4 파일로 바꾸거나, 폰에서 "호환성 우선"으로 찍거나, 클로드와의 대화로 보내 주세요.';

// 영상 파일을 화면의 <video> 에 연결 → { video, url, duration }
export function openVideo(file, el) {
  const url = URL.createObjectURL(file);
  el.muted = true;
  el.playsInline = true;
  el.preload = 'auto';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => fail(), 15000);
    const cleanup = () => { clearTimeout(timer); el.removeEventListener('loadeddata', ok); el.removeEventListener('error', fail); };
    function fail() { cleanup(); URL.revokeObjectURL(url); reject(new Error(VIDEO_FAIL)); }
    async function ok() {
      cleanup();
      if (!el.videoWidth) return fail();
      await settleDuration(el);
      if (!Number.isFinite(el.duration) || el.duration <= 0) return fail();
      resolve({ video: el, url, duration: el.duration });
    }
    el.addEventListener('loadeddata', ok);
    el.addEventListener('error', fail);
    el.src = url;
  });
}

function frameItem(el, t) {
  if (!el.videoWidth || !el.videoHeight) throw new Error('빈 화면');
  const full = toJpeg(el, el.videoWidth, el.videoHeight, FRAME_EDGE, 0.85);
  return {
    base64: base64Of(full),
    mediaType: 'image/jpeg',
    thumb: toJpeg(el, el.videoWidth, el.videoHeight, THUMB_EDGE, 0.7),
    label: `${t.toFixed(1)}초`,
    time: t
  };
}

// 영상의 t 초 장면 그림. 장면 이동이 5초 안에 안 끝나면 엉뚱한 화면을 잡지 않도록 실패로 본다
export function seekFrame(el, time) {
  if (!Number.isFinite(el.duration) || !el.videoWidth) return Promise.reject(new Error('영상이 아직 준비되지 않았어요.'));
  const t = Math.min(Math.max(0, time), Math.max(0, el.duration - 0.05));
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = timedOut => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      el.removeEventListener('seeked', onSeeked);
      if (timedOut) { reject(new Error('장면 이동이 너무 느려요. 다시 해 보거나 직접 장면을 추가해 주세요.')); return; }
      try { resolve(frameItem(el, t)); } catch { reject(new Error('장면을 그림으로 바꾸지 못했어요.')); }
    };
    const onSeeked = () => finish(false);
    const timer = setTimeout(() => finish(true), 5000);
    if (Math.abs(el.currentTime - t) < 0.01 && el.readyState >= 2) { finish(false); return; }
    el.addEventListener('seeked', onSeeked);
    el.currentTime = t;
  });
}

// 자동 장면 뽑기: 못 뽑은 장면은 건너뛰고 몇 장 실패했는지 알려 준다
export async function autoFrames(el, n) {
  el.pause();
  const frames = [];
  let failed = 0;
  for (const t of pickFrameTimes(el.duration, n)) {
    try { frames.push(await seekFrame(el, t)); } catch { failed += 1; }
  }
  return { frames, failed };
}
