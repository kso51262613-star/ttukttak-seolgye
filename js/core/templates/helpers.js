import { MATERIALS } from '../materials.js';

// 각재·파이프 단면 [두께, 폭], 판재는 [두께, 두께]
export function sec(matKey) {
  const m = MATERIALS[matKey];
  if (!m) throw new Error(`없는 자재: ${matKey}`);
  if (m.section) return m.section;
  return [m.thickness, m.thickness];
}

export function thick(matKey) {
  const m = MATERIALS[matKey];
  return m.thickness ?? m.section?.[0] ?? 0;
}

const r1 = v => Math.round(v * 10) / 10;

// 부품을 차례로 쌓는 도우미. 이름별 번호로 id를 만들어 매번 같은 id가 나온다.
export function builder() {
  const parts = [];
  const counts = {};
  return {
    parts,
    add(name, material, size, pos, opts = {}) {
      counts[name] = (counts[name] || 0) + 1;
      const part = {
        id: opts.id || `${name}-${counts[name]}`,
        name,
        material,
        size: size.map(r1),
        pos: pos.map(r1),
        shape: opts.shape || 'box',
        note: opts.note || ''
      };
      parts.push(part);
      return part;
    }
  };
}

// 0..n-1 을 시작~끝 사이에 고르게 놓은 값
export function spread(n, start, end) {
  if (n <= 1) return [(start + end) / 2];
  const step = (end - start) / (n - 1);
  return Array.from({ length: n }, (_, i) => start + i * step);
}

export const SAFETY_BASE = ['보안경', '귀마개', '작업 장갑', '먼지 마스크'];
export const SAFETY_METAL = ['용접면', '용접용 가죽 장갑', '긴팔 면 작업복', '소화기'];
