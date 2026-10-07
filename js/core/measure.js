// 부품의 부피·면적·무게 계산 (재단표, 준비물, 템플릿이 같이 쓴다). 길이 단위 mm, 결과는 ㎥·㎡·kg
import { MATERIALS, isLinear } from './materials.js';

const MM3 = 1e9; // mm³ → ㎥

// 부품 부피(㎥). barrel = 반원 아치(wall 이 있으면 속 빈 아치), cylinder = 세운 원기둥
export function partVolume(part) {
  const [x, y, z] = part.size;
  if (part.shape === 'barrel') {
    const R = x / 2;
    const wall = Number(part.wall) > 0 ? Math.min(Number(part.wall), R) : R;
    const r = R - wall;
    return ((Math.PI / 2) * (R * R - r * r) * z) / MM3;
  }
  if (part.shape === 'cylinder') return (Math.PI * (x / 2) * (x / 2) * y) / MM3;
  return (x * y * z) / MM3;
}

// 벽돌 장 수(소수): 쌓은 부피 ÷ (벽돌 + 줄눈) 부피.
// 벽 두께 방향(벽돌 폭)에는 줄눈이 없다고 본다 (반장 쌓기 1㎡ = 약 75장과 맞음)
export function masonryCount(part) {
  const m = MATERIALS[part.material];
  if (!m?.brick) return 0;
  const j = m.joint || 0;
  const [l, w, h] = m.brick;
  return partVolume(part) / (((l + j) * w * (h + j)) / MM3);
}

// 단열 담요 면적(㎡): 부피 ÷ 담요 한 겹 두께
export function wrapArea(part) {
  const m = MATERIALS[part.material];
  if (!m?.layer) return 0;
  return partVolume(part) / (m.layer / 1000);
}

// 예상 무게(kg): 1m 무게가 있으면 길이로, 개당 무게가 있으면 개수로, 아니면 밀도 × 부피
export function estimateWeight(parts) {
  let kg = 0;
  for (const p of parts) {
    const m = MATERIALS[p.material];
    if (!m) continue;
    if (m.kgPerM && isLinear(p.material)) kg += m.kgPerM * (Math.max(...p.size) / 1000);
    else if (m.itemKg) kg += m.itemKg;
    else if (m.density) kg += m.density * partVolume(p);
  }
  return kg;
}
