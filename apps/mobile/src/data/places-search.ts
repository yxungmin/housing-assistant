/**
 * 직장 위치 검색. 장소 이름을 받아 좌표를 돌려준다.
 *
 * 전에는 직장을 시군구로 받아 구청 좌표를 썼다. 통근 시간이 실제와 몇 십 분씩 달랐다 —
 * 사람은 "강남역에서 몇 분"으로 생각하지 "강남구청에서 몇 분"으로 생각하지 않는다.
 *
 * 앱이 카카오를 직접 부르지 않는다. REST 키를 앱에 넣으면 누구나 뽑아 쓴다.
 * Edge Function(`supabase/functions/places`)이 대신 부른다. 검색어는 어디에도 저장되지 않는다.
 */
import { remoteConfigured } from "./remote";

export interface PlaceHit {
  name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
}

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const placeSearchConfigured = remoteConfigured;

/**
 * 못 찾으면 빈 배열. 서버가 없거나 한도를 넘겨도 마찬가지다 —
 * 어느 쪽이든 사용자가 할 수 있는 일이 같아서(다시 치거나 건너뛰기) 구분해 보여 주지 않는다.
 */
export async function searchPlaces(q: string, fetchImpl: typeof fetch = fetch): Promise<PlaceHit[]> {
  const query = q.trim();
  if (!placeSearchConfigured || !URL || !KEY || query.length < 2) return [];
  try {
    const res = await fetchImpl(`${URL}/functions/v1/places`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: KEY, Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ q: query }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { places?: PlaceHit[] };
    return json.places ?? [];
  } catch {
    return [];
  }
}
