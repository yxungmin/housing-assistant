/**
 * 직장 위치 검색 (장소 이름 → 좌표).
 *
 * 전에는 직장을 시군구로 받았다. 구청 좌표를 쓰니 통근 시간이 실제와 몇 십 분씩 달랐다.
 * 사람은 "강남역에서 몇 분"으로 생각하지 "강남구청에서 몇 분"으로 생각하지 않는다.
 *
 * 역만 따로 목록으로 갖고 있지 않는 이유: 그러면 버스정류장·회사·건물이 빠진다.
 * 수도권 정류장은 5만 곳이 넘고 이름이 겹쳐서("현대아파트") 목록으로는 고를 수가 없다.
 * 키워드 검색이면 "강남역"도 "판교 카카오"도 "삼성전자 수원사업장"도 한 번에 잡힌다.
 *
 * 앱이 직접 카카오를 부르지 못하는 이유는 transit 함수와 같다 — REST 키를 앱에 넣으면 누구나 뽑아 쓴다.
 *
 * 검색어는 저장하지 않는다. 어디서 일하는지는 그 사람의 정보이고 우리가 알 이유가 없다.
 * 캐시도 두지 않는다 — 캐시하려면 검색어를 키로 남겨야 한다.
 *
 * 배포:
 *   npx supabase functions deploy places
 *   npx supabase secrets set KAKAO_REST_API_KEY=...
 */

/** 카카오 키워드 검색 한도는 하루 10만이다. 한 번에 몇 개만 보여 주면 충분하다. */
const SIZE = 12;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });

interface KakaoDoc {
  place_name: string;
  road_address_name?: string;
  address_name?: string;
  category_group_name?: string;
  x: string;
  y: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST만 받는다" }, 405);

  const key = Deno.env.get("KAKAO_REST_API_KEY");
  if (!key) return json({ places: [], error: "검색이 설정되지 않았다" }, 200);

  let q = "";
  try {
    q = String(((await req.json()) as { q?: unknown }).q ?? "").trim();
  } catch {
    return json({ error: "본문을 읽지 못했다" }, 400);
  }
  // 한 글자로는 쓸모 있는 결과가 안 나오고 호출만 쓴다
  if (q.length < 2) return json({ places: [] });
  if (q.length > 40) q = q.slice(0, 40);

  try {
    const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
    url.searchParams.set("query", q);
    url.searchParams.set("size", String(SIZE));
    // 수도권만 서비스하므로 서울 시청을 중심으로 정렬한다. 필터가 아니라 가중치라 지방도 나온다.
    url.searchParams.set("x", "126.9780");
    url.searchParams.set("y", "37.5665");
    url.searchParams.set("sort", "accuracy");

    const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
    if (!res.ok) return json({ places: [], error: `검색 실패 (${res.status})` }, 200);

    const body = (await res.json()) as { documents?: KakaoDoc[] };
    const places = (body.documents ?? [])
      .filter((d) => d.x && d.y)
      .map((d) => ({
        name: d.place_name,
        address: d.road_address_name || d.address_name || "",
        category: d.category_group_name || "",
        lat: Number(d.y),
        lng: Number(d.x),
      }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

    return json({ places });
  } catch {
    return json({ places: [], error: "검색 실패" }, 200);
  }
});
