import { builder, sec, thick, spread } from './helpers.js';
import { METAL_TOOLS, METAL_SAFETY } from './metal.js';

const FIRE_SAFETY = [...METAL_SAFETY, '아연도금(은색 반짝이는) 자재 사용 금지: 가열·용접 때 유해 연기'];
const rod = { name: '용접봉 2.6mm', qty: 1, unit: '봉지(1kg)', price: 8000 };

export const firePlate = {
  id: 'fire-plate', name: '조립식 철판 화로대', category: 'fire', trend: true, difficulty: 2, laborHours: 3,
  summary: '철판 5장을 홈에 끼워 조립하는 화로대. 납작하게 분해돼서 캠핑에 들고 다니기 좋아요.',
  keywords: ['화로', '화로대', '불멍', '캠핑화로', '조립식', '접이식화로', '모닥불'],
  params: [
    { key: 'width', label: '폭', unit: 'mm', min: 300, max: 600, step: 10, default: 400 },
    { key: 'depth', label: '깊이', unit: 'mm', min: 300, max: 600, step: 10, default: 400 },
    { key: 'height', label: '높이', unit: 'mm', min: 200, max: 450, step: 10, default: 300 }
  ],
  materialOptions: { plate: ['steel_plate_32', 'steel_plate_16'] },
  build(p, m) {
    const b = builder();
    const T = thick(m.plate);
    const { width: W, depth: D, height: H } = p;
    for (const sz of [-1, 1]) b.add('앞뒤 벽판', m.plate, [W, H, T], [0, H / 2, sz * (D / 2 - T / 2)], { note: '아래 다리 모양 따내기 + 끼움 홈', shape: 'notched' });
    for (const sx of [-1, 1]) b.add('옆 벽판', m.plate, [T, H, D - 2 * T], [sx * (W / 2 - T / 2), H / 2, 0], { note: '아래 다리 모양 따내기 + 끼움 홈 + 공기구멍', shape: 'notched' });
    b.add('장작 받침판', m.plate, [W - 2 * T, T, D - 2 * T], [0, Math.round(H * 0.45), 0], { note: '공기구멍 지름 10mm 여러 개' });
    return b.parts;
  },
  hardware: () => [{ name: '레이저·플라즈마 재단 외주(도면 전달)', qty: 1, unit: '건', price: 30000 }],
  tools: ['줄자', '그라인더(연마석·플랩디스크)', '줄(쇠줄)', '도면 출력물'], safety: FIRE_SAFETY,
  steps: p => [
    `도면 탭의 판 크기(${p.width}x${p.height}mm 등)로 재단 업체에 레이저 또는 플라즈마 재단을 맡깁니다. 끼움 홈 폭은 판 두께 + 0.5mm로 요청하세요.`,
    '받은 판의 날카로운 모서리를 그라인더와 줄로 갈아냅니다.',
    '임시로 끼워 보고 빡빡한 홈은 줄로 조금씩 넓힙니다.',
    '처음 쓰기 전 야외에서 한 번 태워 기름기를 날리고, 내열 페인트(600도)를 뿌립니다.',
    '사용할 때는 바닥에 내열 받침을 깔고, 실내·텐트 안에서는 절대 쓰지 않습니다.'
  ]
};

export const drumFirePit = {
  id: 'drum-fire-pit', name: '드럼통 화로대', category: 'fire', trend: false, difficulty: 2, laborHours: 4,
  summary: '200L 드럼통을 잘라 만드는 큰 화로. 단체 모임·바비큐에 많이 찾아요.',
  keywords: ['드럼통', '드럼', '화로', '바베큐', '바비큐', '모닥불', '큰화로'],
  params: [
    { key: 'cutHeight', label: '통 높이', unit: 'mm', min: 300, max: 880, step: 10, default: 450 },
    { key: 'legHeight', label: '다리 높이', unit: 'mm', min: 0, max: 400, step: 10, default: 200 }
  ],
  materialOptions: { body: ['drum_200'], leg: ['flat_bar_40'] },
  // 말로 설계에서 "높이 650" 이면 통 높이로 맞춘다
  fromHints(h) {
    if (!Number.isFinite(h.height)) return {};
    const leg = 200;
    return { cutHeight: h.height - leg, legHeight: leg };
  },
  build(p, m) {
    const b = builder();
    const dia = 580;
    const [ft, fw] = sec(m.leg);
    const { cutHeight: CH, legHeight: LH } = p;
    b.add('드럼 몸통', m.body, [dia, CH, dia], [0, LH + CH / 2, 0], { shape: 'cylinder', note: '아래쪽 공기구멍 지름 20mm 8~12개' });
    const legLen = LH + 150;
    const r = dia / 2 + ft / 2;
    b.add('다리', m.leg, [ft, legLen, fw], [r, legLen / 2, 0]);
    b.add('다리', m.leg, [ft, legLen, fw], [-r, legLen / 2, 0]);
    b.add('다리', m.leg, [fw, legLen, ft], [0, legLen / 2, r]);
    b.add('다리', m.leg, [fw, legLen, ft], [0, legLen / 2, -r]);
    spread(2, -120, 120).forEach(z => b.add('석쇠 받침', m.leg, [dia, ft, fw], [0, LH + CH + ft / 2, z]));
    return b.parts;
  },
  hardware: () => [rod, { name: '내열 손잡이(선택)', qty: 2, unit: '개', price: 5000 }],
  tools: [...METAL_TOOLS, '철판용 홀쏘 또는 철공 드릴날 10~20mm'], safety: FIRE_SAFETY,
  steps: p => [
    '내용물이 확인된 드럼통만 씁니다. 기름·화학물질 통은 피하고, 안을 세제로 씻어 완전히 말립니다.',
    `통을 ${p.cutHeight}mm 높이로 그라인더로 자릅니다. 뚜껑을 연 상태로, 불씨가 튀지 않게 주변을 정리합니다.`,
    '아래쪽 둘레에 공기구멍을 뚫습니다.',
    `평철 다리 4개(${p.legHeight + 150}mm)를 통 바깥에 용접합니다.`,
    '야외에서 한 번 크게 태워 안쪽 도장과 잔여물을 날린 뒤 내열 페인트로 마감합니다.',
    '사용할 때는 바닥에 내열 받침, 근처에 물이나 소화기를 둡니다.'
  ]
};

export const campTable = {
  id: 'camp-table', name: '접이식 캠핑 테이블', category: 'fire', trend: true, difficulty: 2, laborHours: 4,
  summary: '원목 상판 + 철제 접이 다리. 캠핑 감성 영상에 자주 나오는 낮은 테이블이에요.',
  keywords: ['캠핑테이블', '캠핑', '접이식', '폴딩', '로우테이블', '좌식테이블', '테이블'],
  params: [
    { key: 'width', label: '폭', unit: 'mm', min: 500, max: 1200, step: 10, default: 800 },
    { key: 'depth', label: '깊이', unit: 'mm', min: 350, max: 600, step: 10, default: 450 },
    { key: 'height', label: '높이', unit: 'mm', min: 250, max: 700, step: 10, default: 380 }
  ],
  materialOptions: { leg: ['sq_tube_20', 'sq_tube_25'], top: ['pine_board_18', 'birch_ply_18'] },
  build(p, m) {
    const b = builder();
    const [s] = sec(m.leg);
    const T = thick(m.top);
    const { width: W, depth: D, height: H } = p;
    const fh = H - T;
    const fx = W / 2 - 60;
    const vz = D / 2 - 40 - s / 2;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) b.add('다리 기둥', m.leg, [s, fh, s], [sx * fx, fh / 2, sz * vz]);
      b.add('다리 윗대', m.leg, [s, s, 2 * vz - s], [sx * fx, fh - s / 2, 0], { note: '접이 힌지 자리' });
      b.add('다리 발대', m.leg, [s, s, 2 * vz - s], [sx * fx, s / 2, 0]);
    }
    b.add('상판', m.top, [W, T, D], [0, H - T / 2, 0]);
    return b.parts;
  },
  hardware: () => [
    { name: '접이식 다리 브라켓(폴딩 힌지)', qty: 4, unit: '개', price: 3000 },
    { name: '볼트·너트 M6', qty: 8, unit: '세트', price: 200 },
    rod
  ],
  tools: [...METAL_TOOLS, '각도절단기 또는 원형톱'], safety: METAL_SAFETY,
  steps: p => [
    `상판 ${p.width}x${p.depth}mm를 자르고 모서리를 둥글게 다듬습니다.`,
    'ㄷ자 다리 2개를 용접합니다(기둥 2개 + 윗대 + 발대).',
    '다리 정리·도장 후, 상판 아래에 접이식 브라켓을 피스로 고정합니다.',
    '다리 윗대를 브라켓에 볼트로 연결하고 접었다 폈다 해 봅니다.',
    '상판은 물에 강한 우레탄 바니쉬로 마감합니다.'
  ]
};

export const fireTable = {
  id: 'fire-table', name: '화로 테이블 (가운데 구멍)', category: 'fire', trend: false, difficulty: 3, laborHours: 10,
  summary: '가운데 화로를 넣고 둘러앉는 테이블. 볼트로 분해되게 만들면 차에 실을 수 있어요.',
  keywords: ['화로테이블', '화로', '둘레테이블', '캠핑', 'igt', '바베큐테이블'],
  params: [
    { key: 'width', label: '폭', unit: 'mm', min: 700, max: 1200, step: 10, default: 900 },
    { key: 'depth', label: '깊이', unit: 'mm', min: 700, max: 1200, step: 10, default: 900 },
    { key: 'height', label: '높이', unit: 'mm', min: 300, max: 500, step: 10, default: 400 },
    { key: 'hole', label: '가운데 구멍', unit: 'mm', min: 300, max: 600, step: 10, default: 450 }
  ],
  materialOptions: { frame: ['sq_tube_25', 'sq_tube_30'], top: ['birch_ply_18', 'pine_board_18'] },
  build(p, m) {
    const b = builder();
    const [s] = sec(m.frame);
    const T = thick(m.top);
    const { width: W, depth: D, height: H } = p;
    const hole = Math.min(p.hole, Math.min(W, D) - 250);
    const fh = H - T;
    const y = fh - s / 2;
    const lx = W / 2 - 20 - s / 2;
    const lz = D / 2 - 20 - s / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('다리', m.frame, [s, fh, s], [sx * lx, fh / 2, sz * lz]);
    for (const sz of [-1, 1]) b.add('바깥 틀 앞뒤', m.frame, [2 * lx - s, s, s], [0, y, sz * lz]);
    for (const sx of [-1, 1]) b.add('바깥 틀 좌우', m.frame, [s, s, 2 * lz - s], [sx * lx, y, 0]);
    for (const sz of [-1, 1]) b.add('안쪽 틀 앞뒤', m.frame, [hole + 2 * s, s, s], [0, y, sz * (hole / 2 + s / 2)]);
    for (const sx of [-1, 1]) b.add('안쪽 틀 좌우', m.frame, [s, s, hole], [sx * (hole / 2 + s / 2), y, 0]);
    const inner = hole / 2 + s;
    const outer = lx - s / 2;
    for (const sx of [-1, 1]) b.add('연결대', m.frame, [outer - inner, s, s], [sx * (inner + outer) / 2, y, 0]);
    for (const sz of [-1, 1]) b.add('상판 앞뒤', m.top, [W, T, (D - hole) / 2], [0, H - T / 2, sz * (hole / 2 + (D - hole) / 4)]);
    for (const sx of [-1, 1]) b.add('상판 좌우', m.top, [(W - hole) / 2, T, hole], [sx * (hole / 2 + (W - hole) / 4), H - T / 2, 0]);
    return b.parts;
  },
  hardware: () => [
    { name: '볼트·너트 M8(분해형 연결)', qty: 12, unit: '세트', price: 400 },
    { name: '판 고정 피스(철재용 트러스)', qty: 16, unit: '개', price: 30 },
    rod
  ],
  tools: [...METAL_TOOLS, '직소 또는 원형톱'], safety: [...METAL_SAFETY, '상판과 화로 사이 간격 5cm 이상, 내열 받침'],
  steps: p => [
    `가운데 구멍 크기(${p.hole}mm)를 쓸 화로보다 10cm 이상 크게 잡습니다.`,
    '바깥 틀과 안쪽 틀을 각각 용접하고 연결대로 잇습니다. 다리는 볼트 연결로 만들면 분해가 됩니다.',
    '용접 정리, 내열 도장.',
    '상판 4조각을 자르고 샌딩, 오일 마감 후 틀 위에 피스로 고정합니다.',
    '화로 열이 상판에 직접 닿지 않는지 처음 사용 때 꼭 확인합니다.'
  ]
};

export const FIRE_TEMPLATES = [firePlate, drumFirePit, campTable, fireTable];
