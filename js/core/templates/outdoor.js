import { builder, sec, spread, SAFETY_BASE } from './helpers.js';
import { WOOD_TOOLS } from './wood.js';
import { METAL_TOOLS, METAL_SAFETY } from './metal.js';

export const raisedBed = {
  id: 'raised-bed', name: '텃밭 상자 (레이즈드 베드)', category: 'outdoor', trend: false, difficulty: 1, laborHours: 3,
  summary: '방부목으로 짜는 텃밭 상자. 베란다·마당 텃밭용으로 봄철에 많이 찾아요.',
  keywords: ['텃밭', '화분', '레이즈드베드', '텃밭상자', '화단', '정원'],
  params: [
    { key: 'width', label: '폭', unit: 'mm', min: 600, max: 2400, step: 10, default: 1200 },
    { key: 'depth', label: '깊이', unit: 'mm', min: 400, max: 1200, step: 10, default: 600 },
    { key: 'rows', label: '판 단 수', unit: '단', min: 1, max: 4, step: 1, default: 2 }
  ],
  materialOptions: { board: ['treated_2x6', 'treated_2x4'], post: ['treated_2x4'] },
  fromHints(h) {
    return Number.isFinite(h.height) ? { rows: Math.round(h.height / 140) } : {};
  },
  build(p, m) {
    const b = builder();
    const [t, w] = sec(m.board);
    const [pt, pw] = sec(m.post);
    const { width: W, depth: D, rows } = p;
    const Hh = rows * w;
    for (let r = 0; r < rows; r++) {
      const y = w / 2 + r * w;
      for (const sz of [-1, 1]) b.add('앞뒤 판', m.board, [W, w, t], [0, y, sz * (D / 2 - t / 2)]);
      for (const sx of [-1, 1]) b.add('옆 판', m.board, [t, w, D - 2 * t], [sx * (W / 2 - t / 2), y, 0]);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('모서리 기둥', m.post, [pt, Hh, pw], [sx * (W / 2 - t - pt / 2), Hh / 2, sz * (D / 2 - t - pw / 2)]);
    return b.parts;
  },
  hardware: (parts, p) => [
    { name: '스테인리스 피스 75mm(야외용)', qty: p.rows * 16, unit: '개', price: 40 },
    { name: '방초 부직포', qty: 1, unit: '장', price: 5000 }
  ],
  tools: WOOD_TOOLS, safety: SAFETY_BASE,
  steps: p => [
    `방부목을 자릅니다. 앞뒤 판 ${p.width}mm, 옆 판 ${p.depth - 76}mm.`,
    '모서리 기둥에 앞뒤 판과 옆 판을 한 단씩 피스로 고정합니다(야외용 스테인리스 피스).',
    `${p.rows}단까지 쌓으며 대각선 길이가 같은지 확인합니다.`,
    '놓을 자리 바닥을 평평하게 고르고 방초 부직포를 깝니다.',
    '자른 면에는 방부 오일을 한 번 더 발라 썩음을 늦춥니다.'
  ]
};

export const firewoodRack = {
  id: 'firewood-rack', name: '철제 장작 거치대', category: 'outdoor', trend: true, difficulty: 1, laborHours: 3,
  summary: '불멍·벽난로 인기로 많이 찾는 장작 거치대. 실내 장식용으로도 써요.',
  keywords: ['장작', '장작거치대', '장작받침', '땔감', '장작보관', '벽난로'],
  params: [
    { key: 'width', label: '폭', unit: 'mm', min: 600, max: 1800, step: 10, default: 1000 },
    { key: 'depth', label: '깊이', unit: 'mm', min: 250, max: 500, step: 10, default: 350 },
    { key: 'height', label: '높이', unit: 'mm', min: 600, max: 1500, step: 10, default: 1000 }
  ],
  materialOptions: { frame: ['sq_tube_25', 'sq_tube_30'] },
  build(p, m) {
    const b = builder();
    const [s] = sec(m.frame);
    const { width: W, depth: D, height: H } = p;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('기둥', m.frame, [s, H, s], [sx * (W / 2 - s / 2), H / 2, sz * (D / 2 - s / 2)]);
    for (const [y, label] of [[100, '바닥 틀'], [H - s / 2, '윗 틀']]) {
      for (const sz of [-1, 1]) b.add(`${label} 앞뒤`, m.frame, [W - 2 * s, s, s], [0, y, sz * (D / 2 - s / 2)]);
      for (const sx of [-1, 1]) b.add(`${label} 좌우`, m.frame, [s, s, D - 2 * s], [sx * (W / 2 - s / 2), y, 0]);
    }
    const k = Math.max(0, Math.floor(W / 350) - 1);
    spread(k + 2, -(W / 2 - s / 2), W / 2 - s / 2).slice(1, -1)
      .forEach(x => b.add('바닥 받침살', m.frame, [s, s, D - 2 * s], [x, 100, 0]));
    return b.parts;
  },
  hardware: () => [
    { name: '용접봉 2.6mm', qty: 1, unit: '봉지(1kg)', price: 8000 },
    { name: '고무 발 캡', qty: 4, unit: '개', price: 300 }
  ],
  tools: METAL_TOOLS, safety: METAL_SAFETY,
  steps: p => [
    `각파이프를 자릅니다. 기둥 ${p.height}mm 4개.`,
    '바닥 틀과 윗 틀을 직각자석으로 잡고 용접합니다.',
    '기둥 4개로 두 틀을 연결하고 바닥 받침살을 넣습니다.',
    '용접 정리 후 야외용이면 방청 페인트, 실내용이면 무광 락카로 마감합니다.',
    '바닥 틀이 땅에서 10cm 떠 있어 장작이 습기를 덜 먹어요.'
  ]
};

export const OUTDOOR_TEMPLATES = [raisedBed, firewoodRack];
