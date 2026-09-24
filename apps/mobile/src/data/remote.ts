/**
 * Supabase 읽기 (anon 키, 공개 데이터만).
 *  - app_announcements 뷰: 공고 + 게시(VERIFIED)된 버전의 extraction JSON (supabase/migrations/0003_app_feed.sql)
 *  - push_subscriptions: 푸시 토큰 + 관심 지역·유형 등록 (RLS: 익명 insert/update만)
 * 사용자 프로필은 절대 보내지 않는다. 설정은 apps/mobile/.env 의 EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY.
 */
import { ExtractionOutput, regionNameOf, type HousingType } from "@housing/schema";
import { toPayload, type LocalReport, type ReportStatus } from "@/lib/reports";
import type { Announcement, Nearby, Transit } from "./announcements";

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const remoteConfigured = !!URL && !!KEY;

interface FeedRow {
  id: string;
  lh_id: string;
  provider: string | null;
  title: string;
  housing_type: HousingType;
  region_code: string;
  /** 0006_auto_publish.sql: 게시된 버전이면 사람 확인 여부에 따라 VERIFIED / AUTO */
  status: "VERIFIED" | "AUTO" | "UNVERIFIED";
  checks: string[] | null;
  notice_date: string | null;
  apply_start: string | null;
  apply_end: string | null;
  pdf_url: string | null;
  detail_url: string | null;
  images: Announcement["images"] | null;
  units: Announcement["units"] | null;
  lat: number | null;
  lng: number | null;
  transit: Transit | null;
  nearby: Nearby[] | null;
  market: Announcement["market"] | null;
  waiting: Announcement["waiting"] | null;
  complex: string | null;
  past_results: Announcement["past_results"] | null;
  commute: Announcement["commute"] | null;
  maintenance: Announcement["maintenance"] | null;
  updated_at: string | null;
  extraction: unknown | null;
}

/**
 * 익명 요청 헤더. 옛 anon 키는 JWT라 Authorization에도 실어야 anon 역할이 되고,
 * 새 publishable 키(sb_publishable_…)는 apikey만 받는다 — Bearer에 넣으면 JWT가 아니라며 거절된다 (2026-09-24).
 */
const headers = () => ({ apikey: KEY!, ...(KEY!.startsWith("eyJ") ? { Authorization: `Bearer ${KEY!}` } : {}), "Content-Type": "application/json" });

/** 응답이 없으면 이만큼 기다리고 끊는다. 전에는 제한이 없어 끊긴 연결에서 새로고침 표시가 영영 돌았다 (2026-09-24 감사) */
export const FEED_TIMEOUT_MS = 10_000;

/** 시간 제한이 있는 fetch. AbortController는 RN·웹 모두 있다 */
async function fetchWithTimeout(fetchImpl: typeof fetch, url: string, init: RequestInit, ms = FEED_TIMEOUT_MS): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetchImpl(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * 목록이 바뀌었는지 알 수 있는 작은 값: 건수와 가장 최근 updated_at.
 * 전체(units 수백 채 포함)를 매번 받기 전에 이것만 받아 같으면 건너뛴다.
 */
export interface FeedVersion {
  count: number;
  latest: string | null;
}
export const feedVersionKey = (v: FeedVersion): string => `${v.count}|${v.latest ?? ""}`;

export async function fetchFeedVersion(fetchImpl: typeof fetch = fetch): Promise<FeedVersion> {
  if (!remoteConfigured) throw new Error("Supabase 미설정");
  const res = await fetchWithTimeout(fetchImpl, `${URL}/rest/v1/app_announcements?select=updated_at&order=updated_at.desc.nullslast&limit=1`, {
    headers: { ...headers(), Prefer: "count=exact" },
  });
  if (!res.ok) throw new Error(`app_announcements HTTP ${res.status}`);
  const rows = (await res.json()) as { updated_at: string | null }[];
  // Content-Range: 0-0/N — 뒤의 N이 전체 건수
  const total = Number(res.headers.get("content-range")?.split("/")[1]);
  return { count: Number.isFinite(total) ? total : rows.length, latest: rows[0]?.updated_at ?? null };
}

export async function fetchRemoteAnnouncements(fetchImpl: typeof fetch = fetch): Promise<Announcement[]> {
  if (!remoteConfigured) throw new Error("Supabase 미설정");
  const res = await fetchWithTimeout(fetchImpl, `${URL}/rest/v1/app_announcements?select=*&order=apply_end.asc.nullslast`, { headers: headers() });
  if (!res.ok) throw new Error(`app_announcements HTTP ${res.status}`);
  const rows = (await res.json()) as FeedRow[];
  const out: Announcement[] = [];
  for (const r of rows) {
    const parsed = r.extraction ? ExtractionOutput.safeParse(r.extraction) : null;
    // 자동 검증을 통과하면 사람 승인 없이 게시된다(AUTO). 사람이 대조한 것만 VERIFIED.
    const readable = r.status !== "UNVERIFIED" && !!parsed?.success;
    const extraction: ExtractionOutput = readable
      ? parsed!.data
      : { title: r.title, housing_type: r.housing_type, schedule: {}, tracks: [{ name: "-", unit_types: [], rule_groups: [], rules: [], pricing: [] }], notes: [] };
    out.push({
      id: r.id,
      lh_id: r.lh_id,
      provider: (r.provider as Announcement["provider"]) ?? undefined,
      title: r.title,
      housing_type: r.housing_type,
      region_code: r.region_code,
      region_name: regionNameOf(r.region_code, extraction.address),
      status: readable ? (r.status === "VERIFIED" ? "VERIFIED" : "AUTO") : "UNVERIFIED",
      checks: r.checks?.length ? r.checks : undefined,
      notice_date: r.notice_date ?? extraction.schedule.notice_date,
      apply_start: r.apply_start ?? extraction.schedule.apply_start,
      apply_end: r.apply_end ?? extraction.schedule.apply_end,
      address: extraction.address,
      pdf_url: r.pdf_url ?? undefined,
      detail_url: r.detail_url ?? undefined,
      images: r.images?.length ? r.images : undefined,
      units: r.units?.length ? r.units : undefined,
      lat: r.lat ?? undefined,
      lng: r.lng ?? undefined,
      transit: r.transit ?? undefined,
      nearby: r.nearby ?? undefined,
      market: r.market ?? undefined,
      waiting: r.waiting ?? undefined,
      complex: r.complex ?? undefined,
      past_results: r.past_results?.length ? r.past_results : undefined,
      commute: r.commute ?? undefined,
      maintenance: r.maintenance ?? undefined,
      updated_at: r.updated_at ?? undefined,
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

/** "이 숫자 이상해요" 신고 한 건. client_id가 같으면 서버에 한 건으로 남는다. */
export async function sendIssueReport(report: LocalReport, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!remoteConfigured) return false;
  // 신고는 한 번 쓰면 끝이다. upsert(on_conflict)는 쓰지 않는다 —
  // PostgREST의 upsert는 INSERT 정책만으론 통과하지 못하고 UPDATE 정책까지 요구하는데
  // (2026-09-21 실측: 42501 RLS 위반), 신고 테이블에 UPDATE를 열어 주면 누구나 남의 신고를 고칠 수 있다.
  // 대신 client_id 유일 인덱스가 중복을 막고, 재전송으로 409가 오면 이미 들어간 것이니 성공으로 본다.
  const res = await fetchImpl(`${URL}/rest/v1/issue_reports`, {
    method: "POST",
    headers: { ...headers(), Prefer: "return=minimal" },
    body: JSON.stringify(toPayload(report)),
  });
  return res.ok || res.status === 409;
}

export interface RemoteReportStatus {
  client_id: string;
  status: ReportStatus;
  resolution: string | null;
  resolved_at: string | null;
}

/** 내가 보낸 신고의 처리 결과만 가져온다 (message는 뷰에 없다). */
export async function fetchReportStatuses(clientIds: string[], fetchImpl: typeof fetch = fetch): Promise<RemoteReportStatus[]> {
  if (!remoteConfigured || clientIds.length === 0) return [];
  const list = clientIds.map((id) => `"${id}"`).join(",");
  const res = await fetchImpl(`${URL}/rest/v1/issue_report_status?select=client_id,status,resolution,resolved_at&client_id=in.(${encodeURIComponent(list)})`, { headers: headers() });
  if (!res.ok) return [];
  return (await res.json()) as RemoteReportStatus[];
}
