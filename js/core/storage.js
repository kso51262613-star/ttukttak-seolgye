// 기기 안 저장 (localStorage 같은 backend). 저장이 막혀도 앱은 메모리로 계속 동작한다.
import { cleanRefImages } from './vision.js';
import { MATERIALS } from './materials.js';
const K = { designs: 'ttk.designs', settings: 'ttk.settings', links: 'ttk.links', current: 'ttk.current', aiUsage: 'ttk.aiUsage' };
const APP = 'ttukttak';
const SAFE_ID = /^[\w-]{1,80}$/;
export const isSafeUrl = u => typeof u === 'string' && /^https?:\/\//i.test(u);
const isSafeLink = l => l && SAFE_ID.test(String(l.id)) && isSafeUrl(l.url);

// 불러온 파일의 설정은 아는 칸만, 맞는 모양만 받는다.
// 남이 만든 백업 파일로 화면에 코드를 심어 API 키를 빼 가지 못하게 하려는 것
export function cleanImportedSettings(s) {
  const out = {};
  if (s.priceOverrides && typeof s.priceOverrides === 'object') {
    const prices = {};
    for (const [k, v] of Object.entries(s.priceOverrides)) {
      if (Object.hasOwn(MATERIALS, k) && typeof v === 'number' && Number.isFinite(v) && v >= 0) prices[k] = v;
    }
    out.priceOverrides = prices;
  }
  if (typeof s.useAI === 'boolean') out.useAI = s.useAI;
  if (typeof s.hourlyRate === 'number' && Number.isFinite(s.hourlyRate) && s.hourlyRate >= 0) out.hourlyRate = s.hourlyRate;
  return out;
}

export function memoryBackend() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); }
  };
}

export function browserBackend() {
  try {
    const ls = globalThis.localStorage;
    const probe = '__ttk_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

export function createStore(backend) {
  const mem = memoryBackend();
  let available = !!backend;
  const be = backend || mem;

  // 저장 공간이 꽉 차서 기기에 못 쓴 칸들. 이 칸은 메모리 값을 읽는다
  const unsaved = new Set();

  function read(key, fallback) {
    try {
      const v = (available && !unsaved.has(key) ? be : mem).getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      available = false;
      const v = mem.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    }
  }
  function write(key, value) {
    const s = JSON.stringify(value);
    mem.setItem(key, s);
    if (!available) return;
    try {
      be.setItem(key, s);
      unsaved.delete(key);
    } catch (e) {
      // 꽉 찬 것은 지우면 다시 저장되므로 저장 기능을 끄지 않는다
      if (e?.name === 'QuotaExceededError' || e?.code === 22 || e?.code === 1014) {
        unsaved.add(key);
      } else {
        available = false;
      }
    }
  }
  // 첫 읽기로 사용 가능 여부 확인
  read(K.settings, null);

  const store = {
    get available() { return available; },
    // 못 저장한 칸이 하나라도 남아 있으면 '꽉 참'
    get lastError() { return unsaved.size ? 'full' : null; },
    listDesigns() {
      return Object.values(read(K.designs, {})).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },
    getDesign(id) { return read(K.designs, {})[id] || null; },
    saveDesign(d) {
      const all = read(K.designs, {});
      all[d.id] = { ...d, updatedAt: Date.now() };
      write(K.designs, all);
      return all[d.id];
    },
    deleteDesign(id) {
      const all = read(K.designs, {});
      delete all[id];
      write(K.designs, all);
    },
    getSettings() { return { apiKey: '', priceOverrides: {}, hourlyRate: 15000, ...read(K.settings, {}) }; },
    saveSettings(s) { write(K.settings, { ...store.getSettings(), ...s }); },
    // 이번 달 AI 사용 요금 기록 (참고값). 내보내기에는 넣지 않는다
    getAiUsage() { return read(K.aiUsage, null); },
    saveAiUsage(u) { write(K.aiUsage, u); },
    getLinks() { return read(K.links, []); },
    saveLinks(list) { write(K.links, list); },
    getCurrentId() { return read(K.current, null); },
    setCurrentId(id) { write(K.current, id); },

    exportAll() {
      const { apiKey, ...settings } = store.getSettings();
      return JSON.stringify({
        app: APP, version: 1, exportedAt: new Date().toISOString(),
        designs: read(K.designs, {}), links: store.getLinks(), settings
      }, null, 2);
    },
    importAll(text) {
      let data;
      try { data = JSON.parse(text); } catch { throw new Error('파일을 읽을 수 없어요. 뚝딱설계에서 내보낸 파일인지 확인해 주세요.'); }
      if (!data || data.app !== APP || typeof data.designs !== 'object') throw new Error('뚝딱설계에서 내보낸 파일이 아니에요.');
      const all = read(K.designs, {});
      let n = 0;
      for (const d of Object.values(data.designs)) {
        if (d && SAFE_ID.test(String(d.id)) && SAFE_ID.test(String(d.templateId))) {
          all[d.id] = { ...d, refImages: cleanRefImages(d.refImages) };
          n++;
        }
      }
      write(K.designs, all);
      const links = (Array.isArray(data.links) ? data.links : []).filter(isSafeLink);
      const existing = store.getLinks();
      const ids = new Set(existing.map(l => l.id));
      write(K.links, [...existing, ...links.filter(l => l && !ids.has(l.id))]);
      // 키는 절대 받지 않고, 나머지도 정해진 칸만
      if (data.settings && typeof data.settings === 'object') store.saveSettings(cleanImportedSettings(data.settings));
      return { designs: n, links: links.length };
    }
  };
  return store;
}
