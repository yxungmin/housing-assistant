/**
 * Supabase 읽기 (anon 키, 공개 데이터만).
 *  - app_announcements 뷰: 공고 + 게시(VERIFIED)된 버전의 extraction JSON (supabase/migrations/0003_app_feed.sql)
 *  - push_subscriptions: 푸시 토큰 + 관심 지역·유형 등록 (RLS: 익명 insert/update만)
 * 사용자 프로필은 절대 보내지 않는다. 설정은 apps/mobile/.env 의 EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY.
 */
import { ExtractionOutput, type HousingType } from "@housing/schema";
import { regionByCode } from "@/lib/regions";
import type { Announcement } from "./announcements";

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const remoteConfigured = !!URL && !!KEY;

interface FeedRow {
  id: string;
  lh_id: string;
  title: string;
  housing_type: HousingType;
  region_code: string;
  status: "VERIFIED" | "UNVERIFIED";
  notice_date: string | null;
  apply_start: string | null;
  apply_end: string | null;
  lat: number | null;
  lng: number | null;
  transit: { nearest_station?: string; station_walk_min?: number } | null;
  extraction: unknown | null;
}

const headers = () => ({ apikey: KEY!, Authorization: `Bearer ${KEY!}`, "Content-Type": "application/json" });

export async function fetchRemoteAnnouncements(fetchImpl: typeof fetch = fetch): Promise<Announcement[]> {
  if (!remoteConfigured) throw new Error("Supabase 미설정");
  const res = await fetchImpl(`${URL}/rest/v1/app_announcements?select=*&order=apply_end.asc.nullslast`, { headers: headers() });
  if (!res.ok) throw new Error(`app_announcements HTTP ${res.status}`);
  const rows = (await res.json()) as FeedRow[];
  const out: Announcement[] = [];
  for (const r of rows) {
    const parsed = r.extraction ? ExtractionOutput.safeParse(r.extraction) : null;
    const verified = r.status === "VERIFIED" && !!parsed?.success;
    const extraction: ExtractionOutput = verified
      ? parsed!.data
      : { title: r.title, housing_type: r.housing_type, schedule: {}, tracks: [{ name: "-", unit_types: [], rule_groups: [], rules: [], pricing: [] }], notes: [] };
    const sido = regionByCode(r.region_code)?.label ?? r.region_code;
    const sigungu = extraction.address?.split(/\s+/)[1];
    out.push({
      id: r.id,
      lh_id: r.lh_id,
      title: r.title,
      housing_type: r.housing_type,
      region_code: r.region_code,
      region_name: sigungu ? `${sido} ${sigungu}` : sido,
      status: verified ? "VERIFIED" : "UNVERIFIED",
      notice_date: r.notice_date ?? extraction.schedule.notice_date,
      apply_start: r.apply_start ?? extraction.schedule.apply_start,
      apply_end: r.apply_end ?? extraction.schedule.apply_end,
      address: extraction.address,
      lat: r.lat ?? undefined,
      lng: r.lng ?? undefined,
      transit: r.transit ?? undefined,
      extraction,
    });
  }
  return out;
}

/** 신규 공고 푸시 대상 등록. 토큰과 관심 지역·유형만 보낸다 (프로필 아님). */
export async function registerPushSubscription(expoToken: string, regions: string[], housingTypes: HousingType[], fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!remoteConfigured) return false;
  const res = await fetchImpl(`${URL}/rest/v1/push_subscriptions?on_conflict=expo_token`, {
    method: "POST",
    headers: { ...headers(), Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ expo_token: expoToken, regions, housing_types: housingTypes, updated_at: new Date().toISOString() }),
  });
  return res.ok;
}
