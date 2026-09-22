/**
 * 지난 회차 결과를 공고에 잇는다.
 *
 * 이을 열쇠가 단지명뿐이다. LH 결과 쪽에는 "전북혁신 A10블럭"이, 우리 공고에는
 * 제목 꼬리표("…모집 공고('26.05.15.)-전북혁신 A10블럭")나 `units[].complex`에 같은 이름이 있다.
 * 번호(`ltrUntNo`)로 이으면 정확하지만, 그 번호는 **결과 쪽에만** 있고 모집공고 API에는 없다.
 *
 * 그래서 이름으로 잇되, **틀릴 바에는 안 보여 준다.**
 * 이 앱에서 잘못 이은 경쟁률은 없는 것보다 나쁘다 — 사용자는 그걸 근거로 신청을 정하고,
 * 나중에 다른 단지 숫자였다는 걸 알면 나머지 숫자도 전부 의심한다.
 *
 * 그래서 두 가지를 지킨다.
 *  1. **정규화 후 정확히 일치**할 때만 잇는다. 부분 일치·유사도는 쓰지 않는다.
 *  2. 후보가 여럿이면 **포기한다.** 하나를 고르면 그 근거를 화면에서 설명할 수 없다.
 */
import type { ExtractionOutput, SupplyUnit } from "@housing/schema";

export interface PastResult {
  /** LH PAN_ID. 같은 공고의 결과면 이름을 맞출 필요가 없다 */
  pan_id?: string;
  unit_no?: string;
  complex: string;
  announced_at?: string;
  draw_type?: string;
  households?: number;
  applicants?: number;
  competition?: number;
  closed_rank?: number;
}

/**
 * 단지명 정규화.
 *
 * 같은 단지가 "A10블럭" / "A10블록" / "A-10BL" / "A10 BL"로 흩어진다. 공백과 하이픈을 지우고
 * 블럭 표기를 하나로 모은다. 여기서 너무 세게 지우면 다른 단지가 같은 이름이 되므로,
 * **표기 차이만** 없애고 글자는 남긴다.
 */
export function normalizeComplex(name: string): string {
  return name
    .replace(/\(.*?\)/g, "")           // 괄호 주석은 단지를 가르는 정보가 아니다
    .replace(/블록|블럭|BL\b/gi, "블록")
    .replace(/[\s\-_·]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * 공고가 가리키는 단지 이름들.
 * 제목 꼬리표("…-전북혁신 A10블럭")와 `units[].complex`를 모은다.
 */
export function complexNames(input: { title?: string; complex?: string; units?: SupplyUnit[] }): string[] {
  const out = new Set<string>();
  /*
   * LH 결과 쪽 공고명은 "<모집공고명>-<단지명>" 꼴이다. 그런데 하이픈이 단지명 앞에만
   * 있는 게 아니라 실제 데이터에서 세 가지가 섞인다:
   *   "…예비입주자 모집 공고('26.05.15.)-전북혁신 A10블럭"   → 뒤가 단지
   *   "…예비입주자 모집-광주하남A-1BL"                      → 단지명 안에도 하이픈이 있다
   *   "과천지식정보타운 S-11BL 행복주택(리츠) 입주자 모집공고" → 단지 꼬리표가 아예 없다
   * 그래서 첫 조각도 마지막 조각도 답이 아니다.
   *
   * 가르는 자리는 **모집공고명이 끝나는 곳**이다. 모집공고명은 "공고"나 "모집"으로 끝나므로,
   * 앞쪽에 그 말이 들어간 **첫 번째** 하이픈에서 자른다. 그 뒤는 통째로 단지명이다.
   */
  // LH 상세 API가 주는 단지명(dsSbd.LCC_NT_NM)이 있으면 그게 제일 정확하다.
  // 제목에서 뽑는 건 그게 없을 때의 차선책이다.
  if (input.complex) out.add(input.complex);
  const title = input.title ?? "";
  for (let i = title.indexOf("-"); i >= 0; i = title.indexOf("-", i + 1)) {
    if (!/공고|모집/.test(title.slice(0, i))) continue;
    const tail = title.slice(i + 1).trim();
    // 꼬리가 또 제목이면 단지명이 아니다. 단지명은 짧고 "모집"·"공고" 같은 말이 없다.
    if (tail.length >= 2 && tail.length <= 30 && !/공고|모집|입주자/.test(tail)) out.add(tail);
    break;
  }
  for (const u of input.units ?? []) if (u.complex) out.add(u.complex);
  return [...out];
}

/**
 * 공고에 붙일 지난 회차 결과.
 *
 * 같은 단지의 결과가 여러 회차면 **가장 최근 것만** 준다. 오래된 회차는 기준이 달라져
 * 비교가 안 되고, 여러 줄을 보여 주면 사용자가 어느 것을 믿을지 스스로 정해야 한다.
 */
export function matchPastResults(
  announcement: { lh_id?: string; title?: string; complex?: string; units?: SupplyUnit[] },
  pool: PastResult[],
): PastResult[] {
  // 같은 공고의 결과가 있으면 이름을 맞출 이유가 없다. PAN_ID는 정확하다.
  if (announcement.lh_id) {
    const exact = pool.filter((r) => r.pan_id && r.pan_id === announcement.lh_id);
    if (exact.length > 0) return exact;
  }

  const wanted = new Set(complexNames(announcement).map(normalizeComplex).filter((n) => n.length >= 2));
  if (wanted.size === 0) return [];

  const hits = pool.filter((r) => wanted.has(normalizeComplex(r.complex)));
  if (hits.length === 0) return [];

  // 이름은 같은데 단지 번호가 갈리면 동명이인이다. 어느 쪽인지 모르면서 하나를 고를 수 없다.
  const unitNos = new Set(hits.map((r) => r.unit_no).filter(Boolean));
  if (unitNos.size > 1) return [];

  const latest = hits.reduce<string | undefined>((a, r) => (r.announced_at && (!a || r.announced_at > a) ? r.announced_at : a), undefined);
  return hits.filter((r) => r.announced_at === latest);
}

/**
 * 화면에 쓸 한 줄. 순위를 앞세우고 경쟁률은 뒤에 붙인다 —
 * 공공임대는 순위제라 "1순위에서 마감"이 내 순위와 직접 비교된다.
 * 순위를 모르면 경쟁률만 말하고, 둘 다 모르면 아무 말도 하지 않는다.
 */
export function pastResultText(r: PastResult): string | null {
  const rate = r.competition !== undefined ? `${r.competition}대 1` : null;
  if (r.closed_rank !== undefined) {
    return rate ? `지난 회차는 ${r.closed_rank}순위에서 마감됐어요 (${rate})` : `지난 회차는 ${r.closed_rank}순위에서 마감됐어요`;
  }
  return rate ? `지난 회차 경쟁률은 ${rate}이었어요` : null;
}

/** 여러 주택형이 있으면 가장 치열했던 쪽을 대표로 쓴다 — 낙관적인 값을 앞에 두지 않는다 */
export function toughest(rows: PastResult[]): PastResult | undefined {
  return rows.reduce<PastResult | undefined>((a, r) => {
    if (!a) return r;
    const rank = (x: PastResult) => x.closed_rank ?? 99;
    if (rank(r) !== rank(a)) return rank(r) < rank(a) ? r : a;
    return (r.competition ?? 0) > (a.competition ?? 0) ? r : a;
  }, undefined);
}

export type { ExtractionOutput };
