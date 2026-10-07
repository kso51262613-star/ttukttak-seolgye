// 제작 순서와 당근 판매글 초안
import { MATERIALS } from './materials.js';
import { bounds, clampParams, resolveMaterials } from './model.js';

export function suggestPrice(cost, hours, rate) {
  const v = (Number(cost) || 0) + (Number(hours) || 0) * (Number(rate) || 0);
  return Math.round(v / 1000) * 1000;
}

export function buildSteps(design, template) {
  if (Array.isArray(design.aiSteps) && design.aiSteps.length) return design.aiSteps;
  if (!template) return [];
  const { params } = clampParams(template, design.params || {});
  return template.steps(params, resolveMaterials(template, design));
}

const won = n => `${Number(n).toLocaleString('ko-KR')}원`;
const cm = mm => Math.round(mm / 10);

export function buildListing({ design, template, parts, bom, price }) {
  const [w, h, d] = bounds(parts).size;
  const name = design.title || template?.name || '수제 가구';
  const mats = [...new Set(parts.map(p => MATERIALS[p.material]?.name).filter(Boolean))];
  const groups = new Set(parts.map(p => MATERIALS[p.material]?.group));
  const joins = [];
  if (groups.has('wood')) joins.push('피스·본드 조립');
  if (groups.has('metal')) joins.push('철 프레임 용접');
  const finishes = (bom?.finish || []).map(f => f.name).filter(n => !n.includes('사포') && !n.includes('탈지'));
  const big = Math.max(w, h, d) > 1200;

  const title = `직접 만든 ${name} (${cm(w)}x${cm(d)}x${cm(h)}cm)`;
  const lines = [
    `직접 설계하고 만든 ${name}이에요.`,
    '',
    `- 크기: 폭 ${cm(w)}cm, 깊이 ${cm(d)}cm, 높이 ${cm(h)}cm`,
    `- 자재: ${mats.join(', ')}`,
    finishes.length ? `- 마감: ${finishes.join(', ')}` : null,
    `- 제작: ${joins.join(', ') || '직접 재단·조립'}`,
    '- 상태: 새로 만든 제품이고 사용하지 않았어요.',
    '- 수제품이라 나무결이나 용접 자국 같은 작은 차이가 있을 수 있어요.',
    '',
    `가격: ${won(price)}`,
    '크기나 색을 바꾼 주문 제작도 상담 가능해요.',
    big ? '부피가 커서 차에 실리는지 크기를 먼저 확인해 주세요. 직거래로 진행해요.' : '직거래로 진행해요.',
    template?.category === 'fire' ? '화로는 실내나 텐트 안에서 쓰면 안 돼요. 바닥에 내열 받침을 깔고 써 주세요.' : null
  ].filter(x => x !== null);
  return { title, body: lines.join('\n') };
}
