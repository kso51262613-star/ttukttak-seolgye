// js/core/numbering.js
// 부품 번호: 이름별로 처음 나온 순서대로 1, 2, 3 ... (참고용 부품은 번호 없음)
// 도면·연결부 표·재단표·부품 카드가 같은 번호를 쓴다. 부품을 빼서 이름 묶음이 사라지면 번호가 당겨진다(참고용).
import { isRef } from './model.js';

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

export function numLabel(n) {
  return n >= 1 && n <= 20 ? CIRCLED[n - 1] : `(${n})`;
}

export function partNumbers(parts) {
  const byName = new Map();
  const byId = new Map();
  for (const p of parts || []) {
    if (!p || isRef(p)) continue;
    if (!byName.has(p.name)) byName.set(p.name, byName.size + 1);
    byId.set(p.id, byName.get(p.name));
  }
  const label = numLabel;
  const tag = p => {
    const n = p ? byId.get(p.id) : null;
    return n ? `${label(n)} ${p.name}` : String(p?.name ?? '');
  };
  return { byName, byId, label, tag };
}
