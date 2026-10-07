// 자재 목록. 단가는 2026-10 온라인 판매가 기준 추정값 (docs/research 참고).
// kind: lumber(각재), tube(각파이프), flat(평철) = 길이로 자르는 자재
//       sheet(판재·철판) = 면으로 자르는 자재, item(드럼통처럼 통째로 쓰는 것)
// section: [두께, 폭] mm, stock: 원장 길이 mm 또는 [가로, 세로] mm

export const MATERIALS = {
  spf_2x4:       { name: '구조목 2x4', kind: 'lumber', group: 'wood', section: [38, 89], stock: 3600, price: 10000, unit: '본', color: '#e2c08d' },
  spf_2x2:       { name: '구조목 2x2', kind: 'lumber', group: 'wood', section: [38, 38], stock: 3600, price: 4600, unit: '본', color: '#e6c793' },
  spf_1x4:       { name: '구조목 1x4', kind: 'lumber', group: 'wood', section: [19, 89], stock: 3600, price: 5000, unit: '본', color: '#e9cc9c' },
  treated_2x4:   { name: '방부목 2x4', kind: 'lumber', group: 'wood', section: [38, 89], stock: 3600, price: 13000, unit: '본', color: '#b59366' },
  treated_2x6:   { name: '방부목 2x6', kind: 'lumber', group: 'wood', section: [38, 140], stock: 3600, price: 20000, unit: '본', color: '#a98a5f' },
  slat_30:       { name: '소나무 각재 30x30', kind: 'lumber', group: 'wood', section: [30, 30], stock: 2400, price: 3000, unit: '본', color: '#dcb582' },
  pine_board_18: { name: '집성목 18T', kind: 'sheet', group: 'wood', thickness: 18, stock: [2440, 1220], price: 65000, unit: '장', color: '#d9ad72' },
  pine_board_24: { name: '집성목 24T', kind: 'sheet', group: 'wood', thickness: 24, stock: [2440, 1220], price: 90000, unit: '장', color: '#c99a5e' },
  birch_ply_18:  { name: '자작합판 18T', kind: 'sheet', group: 'wood', thickness: 18, stock: [2440, 1220], price: 75000, unit: '장', color: '#ecd9b4' },
  sq_tube_20:    { name: '각파이프 20x20 1.4T', kind: 'tube', group: 'metal', section: [20, 20], stock: 6000, price: 6000, unit: '본', color: '#4a4f57' },
  sq_tube_25:    { name: '각파이프 25x25 1.4T', kind: 'tube', group: 'metal', section: [25, 25], stock: 6000, price: 9000, unit: '본', color: '#454a52' },
  sq_tube_30:    { name: '각파이프 30x30 1.6T', kind: 'tube', group: 'metal', section: [30, 30], stock: 6000, price: 18900, unit: '본', color: '#40454d' },
  sq_tube_40:    { name: '각파이프 40x40 1.6T', kind: 'tube', group: 'metal', section: [40, 40], stock: 6000, price: 25470, unit: '본', color: '#3b4048' },
  flat_bar_40:   { name: '평철 40x4', kind: 'flat', group: 'metal', section: [4, 40], stock: 6000, price: 8000, unit: '본', color: '#50555d' },
  steel_plate_32:{ name: '철판 3.2T (흑판)', kind: 'sheet', group: 'metal', thickness: 3.2, stock: [2438, 1219], price: 90000, unit: '장', color: '#7d838b' },
  steel_plate_16:{ name: '철판 1.6T (흑판)', kind: 'sheet', group: 'metal', thickness: 1.6, stock: [2438, 1219], price: 50000, unit: '장', color: '#868c94' },
  drum_200:      { name: '드럼통 200L (중고)', kind: 'item', group: 'metal', price: 20000, unit: '개', color: '#6b3a2a' },
  // 2026-10 추가 조사 (docs/research/2026-10-06-추가자재-단가.md). profile: round = 둥근 단면, angle = ㄱ자 단면
  round_pipe_25: { name: '원형 파이프 25.4 1.4T', kind: 'tube', profile: 'round', group: 'metal', section: [25.4, 25.4], stock: 6000, price: 7000, unit: '본', color: '#4d525a' },
  round_pipe_32: { name: '원형 파이프 31.8 1.4T', kind: 'tube', profile: 'round', group: 'metal', section: [31.8, 31.8], stock: 6000, price: 8800, unit: '본', color: '#484d55' },
  round_bar_10:  { name: '환봉 10mm', kind: 'bar', profile: 'round', group: 'metal', section: [10, 10], stock: 6000, price: 6000, unit: '본', color: '#565b63' },
  round_bar_12:  { name: '환봉 12mm', kind: 'bar', profile: 'round', group: 'metal', section: [12, 12], stock: 6000, price: 8500, unit: '본', color: '#545961' },
  angle_30:      { name: '앵글 30x30 3T', kind: 'angle', profile: 'angle', group: 'metal', section: [30, 30], thickness: 3, stock: 4000, price: 7900, unit: '본', color: '#4f545c' },
  ply_9:         { name: '합판 9T (실제 8.5mm)', kind: 'sheet', group: 'wood', thickness: 8.5, stock: [2440, 1220], price: 18000, unit: '장', color: '#e3cfa6' },
  ply_12:        { name: '합판 12T (실제 11.5mm)', kind: 'sheet', group: 'wood', thickness: 11.5, stock: [2440, 1220], price: 22000, unit: '장', color: '#dfc99c' },
  mdf_18:        { name: 'MDF 18T', kind: 'sheet', group: 'wood', thickness: 18, stock: [2440, 1220], price: 28000, unit: '장', color: '#c9b08a' },
  dowel_30:      { name: '원목 둥근 봉 30mm', kind: 'lumber', profile: 'round', group: 'wood', section: [30, 30], stock: 1800, price: 9000, unit: '본', color: '#dcb27c' },
  // 2026-10-07 벽돌 화덕용 (docs/research/2026-10-07-화덕자재-단가.md)
  // kind: masonry(벽돌, 부피로 장 수), cast(콘크리트·미장, 부피로 포대), wrap(단열 담요, 면적으로 롤)
  sq_tube_50:    { name: '각파이프 50x50 2.3T', kind: 'tube', group: 'metal', section: [50, 50], stock: 6000, price: 23000, unit: '본', color: '#363b43', kgPerM: 3.45 },
  stainless_pipe_125: { name: '스테인리스 연통 125 (1m)', kind: 'tube', profile: 'round', group: 'metal', section: [125, 125], stock: 1000, price: 25000, unit: '본', color: '#c9ccd1', kgPerM: 1.55, paint: false },
  caster_150:    { name: '중량 캐스터 150mm 브레이크 (720kg급)', kind: 'item', group: 'metal', price: 80000, unit: '개', color: '#2b2b2b', itemKg: 1.5, desc: '완제품 바퀴 1개 (shape wheel, size [40, 150, 150])' },
  red_brick:     { name: '적벽돌 190x90x57', kind: 'masonry', group: 'masonry', brick: [190, 90, 57], joint: 10, price: 800, unit: '장', color: '#b5523b', density: 1800, mortar: { name: '조적용 레미탈 40kg', per: 80, price: 6000 } },
  fire_brick:    { name: '내화벽돌 SK-34 230x114x65', kind: 'masonry', group: 'masonry', brick: [230, 114, 65], joint: 3, price: 3500, unit: '장', color: '#e3cf9f', density: 2000, mortar: { name: '내화 몰탈 25kg', per: 50, price: 35000 } },
  concrete_mix:  { name: '바닥용 레미탈 40kg (21MPa 이상)', kind: 'cast', group: 'masonry', yield: 0.022, price: 6000, unit: '포', color: '#a9a59c', density: 2400 },
  cement_render: { name: '미장용 레미탈 40kg', kind: 'cast', group: 'masonry', yield: 0.02, price: 6000, unit: '포', color: '#d6cdbb', density: 2000 },
  ceramic_blanket: { name: '세라믹 단열 담요 25T (600x7200)', kind: 'wrap', group: 'masonry', layer: 25, roll: [600, 7200], price: 45000, unit: '롤', color: '#f3f0e6', density: 128 }
};

// 무게 계산용: density(kg/㎥) 또는 kgPerM(1m 무게) 또는 itemKg(1개 무게). 목재 밀도는 건조재 기준 추정
const WEIGHT_INFO = {
  spf_2x4: { density: 450 }, spf_2x2: { density: 450 }, spf_1x4: { density: 450 },
  treated_2x4: { density: 550 }, treated_2x6: { density: 550 }, slat_30: { density: 500 },
  pine_board_18: { density: 500 }, pine_board_24: { density: 500 }, birch_ply_18: { density: 650 },
  sq_tube_20: { kgPerM: 0.82 }, sq_tube_25: { kgPerM: 1.04 }, sq_tube_30: { kgPerM: 1.43 }, sq_tube_40: { kgPerM: 1.93 },
  flat_bar_40: { kgPerM: 1.26 }, steel_plate_32: { density: 7850 }, steel_plate_16: { density: 7850 },
  drum_200: { itemKg: 18, desc: '통째로 사용 (지름 580mm, 높이 880mm, shape cylinder)' },
  round_pipe_25: { kgPerM: 0.83 }, round_pipe_32: { kgPerM: 1.05 }, round_bar_10: { kgPerM: 0.617 }, round_bar_12: { kgPerM: 0.888 },
  angle_30: { kgPerM: 1.36 }, ply_9: { density: 550 }, ply_12: { density: 550 }, mdf_18: { density: 750 }, dowel_30: { density: 550 }
};
for (const [k, w] of Object.entries(WEIGHT_INFO)) Object.assign(MATERIALS[k], w);

// 재단할 때 톱날이 먹는 두께
export const KERF = { wood: 3, metal: 2 };

export function getMaterial(key, priceOverrides = {}) {
  const m = MATERIALS[key];
  if (!m) return null;
  const price = priceOverrides && Number.isFinite(priceOverrides[key]) ? priceOverrides[key] : m.price;
  return { key, ...m, price };
}

export function materialKind(key) {
  return MATERIALS[key]?.kind ?? null;
}

const LINEAR_KINDS = new Set(['lumber', 'tube', 'flat', 'bar', 'angle']);
export function isLinear(key) {
  return LINEAR_KINDS.has(materialKind(key));
}

export function materialProfile(key) {
  return MATERIALS[key]?.profile || 'square';
}

// 둥근 자재의 축: 크기 세 값 중 가장 긴 방향 (0 = x, 1 = y, 2 = z)
export function longAxis(size) {
  return size.indexOf(Math.max(...size));
}
