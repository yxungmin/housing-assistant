/**
 * 시군구 대표 좌표 → 단지까지의 통근 시간표를 수집할 때 미리 만든다.
 *
 * 사용자마다 부르지 않는 이유가 둘이다.
 *  1. 호출이 사용자 수에 비례하면 하루 1,000회 한도를 금방 넘긴다.
 *     이렇게 하면 새 공고 1건당 시군구 수만큼(서울 25 + 경기 31 = 56회)이고, 월 27건이면 약 1,500회다.
 *  2. 직장 위치가 서버로 나가지 않는다. 앱은 표에서 자기 시군구를 찾아보기만 한다.
 *
 * 키는 앱이 프로필에 저장하는 형식과 같아야 한다 ("서울 마포구"). 표가 갈라지면 앱이 값을 못 찾는다 —
 * 그래서 좌표표를 packages/schema에 두고 앱·수집기가 같이 쓴다.
 *
 * 경로는 카카오맵으로 구한다. 서울시 API는 서울 구간만 답해서 경기·지방이 통째로 빈다
 * (실측: 군산·제주·양산 공고에서 경로 없음). 카카오는 전국을 덮는다.
 * 카카오가 답하지 않을 때만 서울시 API로 한 번 더 본다.
 */
import { placeFor, REGION_LIST } from "@housing/schema";
import { KakaoTransitClient } from "./kakao";
import { TransitClient } from "./seoul";

export type CommuteTable = Record<string, { minutes: number; transfers: number }>;

/**
 * @param to 단지 좌표
 * @param regionCodes 수집 대상 시도 코드. 빈 배열이면 전국 (호출이 급증하니 권하지 않는다)
 */
export async function commuteTable(
  to: { lat: number; lng: number },
  regionCodes: string[],
  keys: { kakao?: string; seoul?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<CommuteTable | undefined> {
  const regions = regionCodes.length ? REGION_LIST.filter((r) => regionCodes.includes(r.code)) : REGION_LIST;
  if (regions.length === 0) return undefined;

  const kakao = keys.kakao ? new KakaoTransitClient(keys.kakao, fetchImpl) : null;
  const seoul = keys.seoul ? new TransitClient(keys.seoul, fetchImpl) : null;
  if (!kakao && !seoul) return undefined;

  const table: CommuteTable = {};
  for (const region of regions) {
    for (const sigungu of region.sigungu) {
      const from = placeFor(region.code, sigungu);
      if (!from) continue;
      const origin = { lat: from.lat, lng: from.lng };
      const commute = (await kakao?.commute(origin, to)) ?? (await seoul?.commute(origin, to)) ?? null;
      // 경로를 못 구한 곳은 넣지 않는다. 화면은 값이 없으면 직선거리로 되돌아간다.
      if (commute) table[from.label] = { minutes: commute.minutes, transfers: commute.transfers };
    }
  }
  return Object.keys(table).length > 0 ? table : undefined;
}
