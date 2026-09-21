import { useSyncExternalStore } from "react";
import type { ExtractionOutput, HousingType, UserProfile } from "@housing/schema";
import { haversineKm, matchAnnouncement, type AnnouncementMatch, type TrackResult } from "@housing/engine";
import raw from "../../data/announcements.json";

export type DataStatus = "VERIFIED" | "AUTO" | "UNVERIFIED";

/** 조건을 읽어 낸 공고인가 (매칭·계산을 할 수 있는가). 사람 검수 여부와는 다른 질문이다. */
export const isReadable = (a: Announcement): boolean => a.status !== "UNVERIFIED";

export interface Announcement {
  id: string;
  lh_id: string;
  title: string;
  housing_type: HousingType;
  region_code: string;
  region_name: string;
  /**
   * VERIFIED   사람이 공고문과 대조함
   * AUTO       공고문에서 자동으로 옮기고 자동 검증만 거침 (사람은 아직 안 봄)
   * UNVERIFIED 아직 조건을 못 읽음 — 매칭·계산을 하지 않는다
   */
  status: DataStatus;
  /** 자동 검증에서 걸린 것. 숨기지 않고 화면에 그대로 알린다 */
  checks?: string[];
  notice_date?: string;
  apply_start?: string;
  apply_end?: string;
  address?: string;
  lat?: number;
  lng?: number;
  transit?: { nearest_station?: string; station_walk_min?: number };
  /** 기관 사이트의 원문 공고문. 근거로 적은 쪽수를 실제로 열 수 있게 한다 */
  pdf_url?: string;
  extraction: ExtractionOutput;
}

export type AnnouncementSource = "bundled" | "cache" | "remote";

/**
 * 공고 목록 저장소. 번들 JSON으로 시작해 캐시 → Supabase 순으로 교체된다 (sync.ts).
 * 화면은 useAnnouncements()로 구독하고, 아래 순수 함수들은 인자를 안 주면 현재 목록을 쓴다.
 */
const bundled = raw as unknown as Announcement[];
let current: Announcement[] = bundled;
let snapshot = { list: bundled, source: "bundled" as AnnouncementSource, syncedAt: null as string | null };
const listeners = new Set<() => void>();

export function setAnnouncements(list: Announcement[], source: AnnouncementSource, syncedAt: string | null): void {
  current = list;
  snapshot = { list, source, syncedAt };
  for (const l of listeners) l();
}

export const currentAnnouncements = () => current;

export function useAnnouncements() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
    () => snapshot,
  );
}

export function getAnnouncement(id: string, list: Announcement[] = current): Announcement | undefined {
  return list.find((a) => a.id === id);
}

export interface Matched {
  announcement: Announcement;
  match: AnnouncementMatch | null; // 조건을 못 읽은 공고(UNVERIFIED)는 null
  /** 조건 N/M (best_track 기준, 그룹 단위) */
  matched: number;
  needsCheck: number;
  total: number;
  /** 직장까지 직선거리 (km). 통근 시간 API 연결 전 대체 표시 */
  distanceKm: number | null;
}

export function matchAll(profile: UserProfile | null, list: Announcement[] = current): Matched[] {
  return list.map((a) => {
    const distanceKm =
      profile?.workplace && a.lat !== undefined && a.lng !== undefined ? haversineKm(profile.workplace, { lat: a.lat, lng: a.lng }) : null;
    if (!isReadable(a) || !profile) {
      return { announcement: a, match: null, matched: 0, needsCheck: 0, total: 0, distanceKm };
    }
    const match = matchAnnouncement(a.extraction, profile);
    const best = match.best_track ?? [...match.tracks].sort((x, y) => y.summary.matched - x.summary.matched)[0];
    // 화면에는 규칙 단위로 센다 ("조건 8개 중 7개 일치"). 일치 판정 자체는 엔진의 그룹 단위 결과를 따른다.
    const counts = best ? ruleCounts(best) : { matched: 0, needsCheck: 0, total: 0 };
    const { matched, needsCheck, total } = counts;
    return { announcement: a, match, matched, needsCheck, total, distanceKm };
  });
}

/** 트랙의 규칙 단위 집계 (applies_to로 건너뛴 규칙 제외). any_of 그룹은 통과했으면 그 안의 불일치 규칙을 세지 않는다. */
export function ruleCounts(track: TrackResult): { matched: number; needsCheck: number; total: number } {
  let matched = 0;
  let needsCheck = 0;
  let total = 0;
  for (const g of track.groups) {
    const rules = g.rules.filter((r) => !r.skipped);
    if (g.group.mode === "any_of" && g.status === "MATCH") {
      matched += 1;
      total += 1;
      continue;
    }
    for (const r of rules) {
      total += 1;
      if (r.status === "MATCH") matched += 1;
      else if (r.status === "NEEDS_CHECK") needsCheck += 1;
    }
  }
  return { matched, needsCheck, total };
}

/** 홈 목록: 조건에 맞는 공고 (best_track.mismatched == 0) */
export function matching(list: Matched[]): Matched[] {
  return list.filter((m) => m.match?.is_match);
}

/** 온보딩 직후 무료 계산 대상: 일치 수 우선, 같으면 접수 임박 (문서 미결 사항의 기본값) */
export function pickBest(list: Matched[]): Matched | null {
  const candidates = matching(list).filter((m) => m.announcement.extraction.tracks.some((t) => t.pricing.some((p) => p.kind === "rental")));
  candidates.sort((a, b) => b.matched - a.matched || (a.announcement.apply_end ?? "").localeCompare(b.announcement.apply_end ?? ""));
  return candidates[0] ?? null;
}
