import type { SupplyUnit, UserProfile } from "@housing/schema";
import { remoteConfigured } from "./remote";

/**
 * 흩어진 집 한 채까지의 대중교통 소요.
 *
 * 미리 계산할 수 없어서 고른 집 하나만 그때 부른다. 집 주소 176곳 × 시군구 56곳 = 9,856회인데
 * 카카오 대중교통 경로는 하루 1,000회다 — 한 채면 1회다.
 *
 * 앱이 직접 부르지 않는다. REST 키를 앱에 넣으면 누구나 뽑아 쓴다.
 * 그래서 Edge Function(`supabase/functions/transit`)이 대신 부르고 결과를 캐시한다.
 *
 * 출발점은 직장의 정확한 좌표가 아니라 그 시군구의 대표 좌표다. 두 가지 이유가 있다 —
 * 우리가 애초에 시군구까지만 받고, 그래야 같은 시군구 사람이 캐시 한 줄을 같이 써서 호출이 0에 수렴한다.
 * 서버에 남는 것은 (공고, 집, 출발 시군구) → 분뿐이고 누가 물었는지는 남지 않는다.
 */
export interface UnitCommute {
  minutes: number;
  transfers: number;
  fare?: number;
}

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * 출발 좌표. 직장을 검색으로 받으면서 실제 좌표를 그대로 쓴다.
 *
 * 전에는 라벨에서 시군구를 되짚어 구청 좌표를 썼다. 같은 구 사람이 캐시를 같이 쓰는 이점이 있었지만
 * 통근 시간이 실제와 몇 십 분씩 어긋났다 — 강남구청과 강남역은 다른 곳이다.
 * 정확한 좌표를 쓰면 캐시가 덜 겹치므로, 호출 한도는 Edge Function 쪽 일일 예산이 지킨다.
 *
 * 옛 프로필은 좌표가 시군구 대표점이라 그대로 쓰면 예전과 같은 값이 나온다 — 따로 마이그레이션하지 않는다.
 */
export function originFor(profile: UserProfile | null | undefined): { lat: number; lng: number } | null {
  const w = profile?.workplace;
  return w ? { lat: w.lat, lng: w.lng } : null;
}

export const transitConfigured = remoteConfigured;

/**
 * 못 구하면 null. 화면은 그때 직선거리로 되돌아간다 — 없는 값을 지어내지 않는다.
 *
 * null이 나오는 경우가 여럿이다: 서버 미설정, 경로 없음(섬·장거리), 그날 계산 한도 소진.
 * 어느 쪽이든 사용자가 할 수 있는 일이 없어서 같은 자리로 되돌린다.
 */
export async function fetchUnitCommute(
  announcementId: string,
  unit: SupplyUnit,
  profile: UserProfile | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<UnitCommute | null> {
  if (!transitConfigured || !URL || !KEY) return null;
  const from = originFor(profile);
  if (!from || unit.lat === undefined) return null;
  try {
    const res = await fetchImpl(`${URL}/functions/v1/transit`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: KEY, Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ announcement_id: announcementId, unit_id: unit.id, from }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { minutes?: number | null; transfers?: number; fare?: number };
    if (typeof json.minutes !== "number") return null;
    return { minutes: json.minutes, transfers: json.transfers ?? 0, fare: json.fare };
  } catch {
    return null;
  }
}
