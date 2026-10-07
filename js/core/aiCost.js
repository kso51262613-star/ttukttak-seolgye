// AI 사용 요금(참고값). 공식 가격표(platform.claude.com/docs/en/about-claude/pricing, 2026-10-07 확인) 기준
// 단가 단위: 100만 토큰당 달러
// 거절되면 서버가 다른 모델로 다시 시도할 수 있어서, 그때 쓰일 만한 모델도 넣어 둔다
export const PRICES = {
  'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 }
};
const DEFAULT_MODEL = 'claude-opus-5-5';
// 2026-10-06 환율 약 1,337원에 카드 해외결제 수수료를 더한 참고값
export const KRW_PER_USD = 1380;

const count = (usage, key) => Math.max(0, Number(usage?.[key]) || 0);

function attemptUsd(usage, model) {
  const p = PRICES[model] || PRICES[DEFAULT_MODEL];
  return (count(usage, 'input_tokens') * p.input
    + count(usage, 'output_tokens') * p.output
    + count(usage, 'cache_creation_input_tokens') * p.cacheWrite
    + count(usage, 'cache_read_input_tokens') * p.cacheRead) / 1e6;
}

// 다른 모델로 다시 시도했으면 usage.iterations 에 시도마다 기록이 있다 (위쪽 usage 는 답을 낸 시도만).
// 거절된 시도는 안 받는 경우도 있지만, 참고값이라 넉넉하게 모두 더한다
export function costUsd(usage, model) {
  const tries = Array.isArray(usage?.iterations) ? usage.iterations : [];
  if (tries.length) return tries.reduce((sum, t) => sum + attemptUsd(t, t?.model || model), 0);
  return attemptUsd(usage, model);
}

export const costKrw = (usage, model) => Math.round(costUsd(usage, model) * KRW_PER_USD);

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// 이번 달 사용 기록 (달이 바뀌면 0부터)
export function usageThisMonth(record, now = new Date()) {
  const month = monthKey(now);
  return record && record.month === month
    ? { month, krw: Number(record.krw) || 0, count: Number(record.count) || 0 }
    : { month, krw: 0, count: 0 };
}

export function addUsage(record, krw, now = new Date()) {
  const u = usageThisMonth(record, now);
  return { month: u.month, krw: u.krw + Math.max(0, Number(krw) || 0), count: u.count + 1 };
}
