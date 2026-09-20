import type { ExtractionOutput, HousingType, UserProfile } from "@housing/schema";
import { haversineKm, matchAnnouncement, type AnnouncementMatch } from "@housing/engine";
import raw from "../../data/announcements.json";

export interface Announcement {
  id: string;
  lh_id: string;
  title: string;
  housing_type: HousingType;
  region_code: string;
  region_name: string;
  status: "VERIFIED" | "UNVERIFIED";
  notice_date?: string;
  apply_start?: string;
  apply_end?: string;
  address?: string;
  lat?: number;
  lng?: number;
  transit?: { nearest_station?: string; station_walk_min?: number };
  extraction: ExtractionOutput;
}

export const ANNOUNCEMENTS = raw as unknown as Announcement[];

export function getAnnouncement(id: string): Announcement | undefined {
  return ANNOUNCEMENTS.find((a) => a.id === id);
}

export interface Matched {
  announcement: Announcement;
  match: AnnouncementMatch | null; // UNVERIFIED면 null
  /** 조건 N/M (best_track 기준, 그룹 단위) */
  matched: number;
  needsCheck: number;
  total: number;
  /** 직장까지 직선거리 (km). 통근 시간 API 연결 전 대체 표시 */
  distanceKm: number | null;
}

export function matchAll(profile: UserProfile | null): Matched[] {
  return ANNOUNCEMENTS.map((a) => {
    if (a.status !== "VERIFIED" || !profile) {
      return { announcement: a, match: null, matched: 0, needsCheck: 0, total: 0, distanceKm: null };
    }
    const match = matchAnnouncement(a.extraction, profile);
    const best = match.best_track ?? [...match.tracks].sort((x, y) => y.summary.matched - x.summary.matched)[0];
    const matched = best?.summary.matched ?? 0;
    const needsCheck = best?.summary.needs_check ?? 0;
    const total = best ? best.summary.matched + best.summary.needs_check + best.summary.mismatched : 0;
    const distanceKm =
      profile.workplace && a.lat !== undefined && a.lng !== undefined
        ? haversineKm(profile.workplace, { lat: a.lat, lng: a.lng })
        : null;
    return { announcement: a, match, matched, needsCheck, total, distanceKm };
  });
}

/** 홈 목록: 조건에 맞는 공고 (best_track.mismatched == 0) */
export function matching(list: Matched[]): Matched[] {
  return list.filter((m) => m.match?.is_match);
}

/** 온보딩 직후 자동으로 계산을 열어 줄 최적 공고: 일치 수 우선, 같으면 접수 임박 (문서 미결 사항의 기본값) */
export function pickBest(list: Matched[]): Matched | null {
  const candidates = matching(list).filter((m) => m.announcement.extraction.tracks.some((t) => t.pricing.some((p) => p.kind === "rental")));
  candidates.sort((a, b) => b.matched - a.matched || (a.announcement.apply_end ?? "").localeCompare(b.announcement.apply_end ?? ""));
  return candidates[0] ?? null;
}
