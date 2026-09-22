/**
 * 빠진 조건 찾기 — 같은 공고의 형제 트랙을 서로 비교한다.
 *
 * `regionGuard`·`incomeGuard`는 도메인 지식으로 특정 조건 하나씩을 지킨다
 * ("공공임대는 소득 상한이 거의 항상 있다"). 잘 듣지만 우리가 미리 적어 둔 것만 지킨다.
 *
 * 이건 다르게 본다. **같은 공고문 안의 다른 트랙이 갖고 있는 조건**을 증거로 쓴다.
 * 한 공고의 공급 유형들은 대개 같은 뼈대를 공유한다 — 소득·자산·무주택·청약통장이
 * 유형마다 숫자만 다르게 붙는다. 그러니 형제 대부분이 가진 조건이 한 트랙에만 없으면
 * 그건 그 트랙의 특칙이거나 추출이 빠뜨린 것이고, 둘 다 "맞음"이라고 말할 근거가 못 된다.
 *
 * 왜 이걸 굳이 하는가: 지금 구조에서는 **조건이 빠지면 조용히 통과가 된다.**
 * 룰이 없으면 평가되지 않고, 평가되지 않으면 걸리지 않는다. 즉 추출이 실패할수록
 * 사용자에게는 "더 잘 맞는 공고"로 보인다. 방향이 거꾸로다.
 *
 * 2026-09-22에 018(SH 제51차 장기전세)에서 실제로 나왔다. 공고문 p.10은 면적 구간마다
 * 청약통장 요건을 적는데, 추출은 7개 트랙 중 1개에만 그 룰을 넣었다. 나머지 세 트랙은
 * 통장이 없는 사람에게도 "조건 맞음"이 된다.
 *
 * 거짓 양성이 거짓 음성보다 훨씬 비싸다 — 맞다고 해서 서류 준비하고 신청했다가 떨어지면
 * 그 사람은 이 앱의 나머지 숫자도 전부 의심한다. 그래서 모르면 "맞음"이라고 하지 않는다.
 */
import type { ExtractionOutput, RuleCategory } from "@housing/schema";

/** 형제 트랙 몇 할이 가지고 있어야 "공통 조건"으로 보는가 */
export const SIBLING_RATIO = 0.6;
/** 형제가 이보다 적으면 비교할 근거가 없다 */
export const MIN_TRACKS = 3;

/**
 * 이미 전용 안전망이 있는 조건은 여기서 또 잡지 않는다.
 * 같은 트랙에 "확인 필요"가 두 줄 붙으면 사용자는 같은 말을 두 번 읽는다.
 */
const ALREADY_GUARDED: RuleCategory[] = ["income", "residence"];

export const CATEGORY_LABEL: Record<string, string> = {
  income: "소득 기준",
  asset: "자산 기준",
  car_value: "자동차 가액",
  debt: "부채",
  residence: "거주 요건",
  housing: "무주택 요건",
  marriage: "혼인 요건",
  children: "자녀 요건",
  age: "나이 요건",
  subscription: "청약통장 요건",
  commute: "통근 조건",
  status: "계층 자격",
};

export const categoryLabel = (c: string): string => CATEGORY_LABEL[c] ?? c;

/**
 * 트랙마다 "형제 대부분이 가졌는데 여기만 없는" 조건 목록.
 * 반환 배열의 i번째가 tracks[i]에 해당한다.
 */
export function missingCategories(extraction: Pick<ExtractionOutput, "tracks">): RuleCategory[][] {
  const tracks = extraction.tracks;
  const out: RuleCategory[][] = tracks.map(() => []);
  if (tracks.length < MIN_TRACKS) return out;

  const has = tracks.map((t) => new Set(t.rules.map((r) => r.category)));
  const all = new Set(has.flatMap((s) => [...s]));
  for (const cat of all) {
    if (ALREADY_GUARDED.includes(cat)) continue;
    const withIt = has.filter((s) => s.has(cat)).length;
    if (withIt / tracks.length < SIBLING_RATIO) continue;
    has.forEach((s, i) => {
      if (!s.has(cat)) out[i]!.push(cat);
    });
  }
  return out.map((cs) => cs.sort());
}
