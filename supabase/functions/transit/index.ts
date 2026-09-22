/**
 * 흩어진 집 한 채까지의 대중교통 소요 시간.
 *
 * 앱이 직접 카카오를 부르지 못하는 이유는 하나다 — REST 키를 앱에 넣으면 누구나 뽑아 쓴다.
 * 그래서 키를 쥔 이쪽이 대신 부르고 결과를 캐시한다.
 *
 * 미리 계산하지 않는 이유: 집 주소 176곳 × 시군구 56곳 = 9,856회인데
 * 카카오 대중교통 경로는 하루 1,000회다. 사람이 고른 집 하나만 부르면 1회다.
 *
 * 저장하는 것은 (공고, 집, 출발 시군구) → 분·환승·요금뿐이다.
 * 출발점은 사용자의 정확한 직장이 아니라 시군구 대표 좌표이고, 같은 시군구 사람이 한 줄을 같이 쓴다.
 * 누가 물었는지는 남기지 않는다.
 *
 * 배포:
 *   npx supabase functions deploy transit
 *   npx supabase secrets set KAKAO_REST_API_KEY=...
 */
import { createClient } from "jsr:@supabase/supabase-js@2";

/** 하루에 이만큼까지만 새로 부른다. 카카오 한도(1,000)에 여유를 둔다 */
const DAILY_BUDGET = 900;

/** 좌표를 소수 3자리(약 100m)로 묶는다. 같은 시군구에서 온 요청이 한 칸을 같이 쓴다 */
const keyOf = (lat: number, lng: number) => `${lat.toFixed(3)},${lng.toFixed(3)}`;

interface Body {
  announcement_id?: string;
  unit_id?: string;
  /**
   * 출발 좌표. 앱이 직장 위치를 소수 3자리(약 100m)로 뭉개서 보낸다 (data/transit.ts).
   * 전체 정밀도를 받지 않는다 — 쓰지도 않을뿐더러 직장 건물을 특정할 수 있는 값이다.
   */
  from?: { lat: number; lng: number };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, content-type, apikey",
        "access-control-allow-methods": "POST, OPTIONS",
      },
    });
  }
  if (req.method !== "POST") return json({ error: "POST만" }, 405);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "JSON이 아님" }, 400);
  }
  const { announcement_id, unit_id, from } = body;
  if (!announcement_id || !unit_id || typeof from?.lat !== "number" || typeof from?.lng !== "number") {
    return json({ error: "announcement_id·unit_id·from이 필요" }, 400);
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const fromKey = keyOf(from.lat, from.lng);

  // 1) 캐시
  const hit = await db
    .from("commute_cache")
    .select("minutes, transfers, fare")
    .eq("announcement_id", announcement_id)
    .eq("unit_id", unit_id)
    .eq("from_key", fromKey)
    .maybeSingle();
  if (hit.data) return json({ ...hit.data, cached: true });

  // 2) 집 좌표. 공고의 units에서 찾는다 — 앱이 보낸 좌표를 믿지 않는다.
  const row = await db.from("announcements").select("units").eq("id", announcement_id).maybeSingle();
  const units = (row.data?.units ?? []) as { id: string; lat?: number; lng?: number }[];
  const unit = units.find((u) => u.id === unit_id);
  if (!unit || typeof unit.lat !== "number" || typeof unit.lng !== "number") {
    return json({ error: "그 집의 좌표가 없음" }, 404);
  }

  // 3) 하루 예산. 넘으면 부르지 않고 없다고 답한다 — 한도를 넘겨 전부 실패하는 것보다 낫다.
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const used = await db.from("commute_cache").select("*", { count: "exact", head: true }).gte("fetched_at", since);
  if ((used.count ?? 0) >= DAILY_BUDGET) return json({ error: "오늘 계산 한도를 다 썼어요", retry_after_hours: 24 }, 429);

  // 4) 카카오
  const kakaoKey = Deno.env.get("KAKAO_REST_API_KEY");
  if (!kakaoKey) return json({ error: "KAKAO_REST_API_KEY 없음" }, 500);
  const q = new URLSearchParams({
    start_x: String(from.lng),
    start_y: String(from.lat),
    end_x: String(unit.lng),
    end_y: String(unit.lat),
  });
  const res = await fetch(`https://dapi.kakao.com/v2/routing/publictraffic?${q}`, {
    headers: { Authorization: `KakaoAK ${kakaoKey}` },
  });
  if (!res.ok) return json({ error: `카카오 HTTP ${res.status}` }, 502);

  const payload = (await res.json()) as {
    status?: string;
    routes?: { properties?: { totalTime?: number; transfers?: number; fare?: { value?: number } } }[];
  };
  if (payload.status !== "OK" || !Array.isArray(payload.routes)) {
    // 경로가 없는 경우다 (섬·장거리). 없는 값을 지어내지 않는다.
    return json({ minutes: null });
  }
  let best: { minutes: number; transfers: number; fare?: number } | null = null;
  for (const r of payload.routes) {
    const seconds = r.properties?.totalTime;
    if (typeof seconds !== "number" || seconds <= 0) continue;
    const one = { minutes: Math.round(seconds / 60), transfers: r.properties?.transfers ?? 0, fare: r.properties?.fare?.value };
    if (!best || one.minutes < best.minutes) best = one;
  }
  if (!best) return json({ minutes: null });

  await db.from("commute_cache").insert({
    announcement_id,
    unit_id,
    from_key: fromKey,
    minutes: best.minutes,
    transfers: best.transfers,
    fare: best.fare ?? null,
  });

  return json({ ...best, cached: false });
});
