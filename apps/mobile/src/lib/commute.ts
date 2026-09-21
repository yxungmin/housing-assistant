/**
 * 통근·대중교통 문구, 그리고 지도 앱 열기.
 *
 * 우리가 실제로 가진 건 둘뿐이다 — 공고지 좌표와, 그 좌표에서 가장 가까운 지하철역·버스정류장까지의
 * 거리(수집 시 Kakao Local, `collector/src/geo/kakao.ts`). 경로·환승·문 앞에서 문 앞까지 걸리는 시간은
 * 교통 API를 붙여야 나온다. 수집할 때 시군구 대표 좌표에서 미리 계산해 둔 값이 있으면(`Announcement.commute`)
 * 시간으로 말하고, 없으면 직선거리로 되돌아간다 — "약 40분"처럼 없는 값을 지어내지 않는다.
 *
 * 걷는 시간은 거리에서 환산한 값이라(4km/h) "약"을 뗄 수 없다. 화면도 "약 7분"으로 쓴다.
 */
import { Linking, Platform } from "react-native";
import type { Announcement, Transit } from "@/data/announcements";
import type { UserProfile } from "@housing/schema";

/** 한 사람 몫의 통근 표시. 부부는 두 줄이 된다. */
export interface CommuteLine {
  who: string;
  /** 직장 라벨 ("서울 강남구") */
  where?: string;
  km: number;
  /** 미리 계산해 둔 대중교통 소요 (분). 없으면 거리만 말한다 */
  minutes?: number;
  transfers?: number;
}

/** 미리 계산한 표에서 이 직장 라벨의 값을 찾는다 */
export const commuteFor = (
  commute: Record<string, { minutes: number; transfers: number }> | undefined,
  label: string | undefined,
): { minutes: number; transfers: number } | undefined => (commute && label ? commute[label] : undefined);

/** "약 42분 · 환승 1회" / "약 21분" */
export function commuteDetail(line: CommuteLine): string {
  if (line.minutes === undefined) return `직선 약 ${line.km < 10 ? line.km.toFixed(1) : line.km.toFixed(0)}km`;
  const transfer = line.transfers ? ` · 환승 ${line.transfers}회` : "";
  return `대중교통 약 ${line.minutes}분${transfer}`;
}

export function commuteLines(
  profile: UserProfile | null | undefined,
  distanceKm: number | null,
  distancePartnerKm: number | null,
  commute?: Record<string, { minutes: number; transfers: number }>,
): CommuteLine[] {
  const out: CommuteLine[] = [];
  const couple = distancePartnerKm !== null;
  if (distanceKm !== null) {
    out.push({ who: couple ? "내 직장" : "직장", where: profile?.workplace?.label, km: distanceKm, ...commuteFor(commute, profile?.workplace?.label) });
  }
  if (distancePartnerKm !== null) {
    const who = profile?.marriage === "pre_marriage" ? "예비 배우자 직장" : "배우자 직장";
    out.push({ who, where: profile?.workplace_partner?.label, km: distancePartnerKm, ...commuteFor(commute, profile?.workplace_partner?.label) });
  }
  return out;
}

/**
 * 목록 한 줄에 쓰는 짧은 꼴. 시간을 알면 시간으로 말한다 ("직장 42분") —
 * 거리보다 시간이 사람이 실제로 쓰는 기준이다. 모르면 거리로 돌아간다 ("직장 12km").
 */
export function commuteShort(
  distanceKm: number | null,
  distancePartnerKm: number | null,
  mine?: { minutes: number },
  partner?: { minutes: number },
): string | null {
  if (mine || partner) {
    const parts: string[] = [];
    if (mine) parts.push(`직장 ${mine.minutes}분`);
    if (partner) parts.push(`${mine ? "배우자" : "배우자 직장"} ${partner.minutes}분`);
    if (parts.length) return parts.join(" · ");
  }
  const km = (v: number) => `${v < 10 ? v.toFixed(1) : v.toFixed(0)}km`;
  if (distanceKm === null && distancePartnerKm === null) return null;
  if (distancePartnerKm === null) return `직장 ${km(distanceKm!)}`;
  if (distanceKm === null) return `배우자 직장 ${km(distancePartnerKm)}`;
  return `직장 ${km(distanceKm)} · 배우자 ${km(distancePartnerKm)}`;
}

/**
 * Kakao의 지하철역 이름은 "망원역 6호선"처럼 호선이 붙어 온다. 붙어 있으면 갈라 놓는다.
 * 여러 호선이 지나면 "왕십리역 2호선" 하나만 오므로, 없는 환승 정보를 만들어 내지는 않는다.
 */
export function splitStation(name: string): { station: string; line?: string } {
  const m = /^(.*?역)\s+(.+)$/.exec(name.trim());
  return m ? { station: m[1]!, line: m[2] } : { station: name.trim() };
}

export interface TransitLine {
  icon: "subway" | "bus";
  /** "지하철 망원역 6호선" */
  title: string;
  /** "도보 약 7분 (450m)" */
  detail: string;
}

const WALK_M_PER_MIN = 67; // 약 4km/h — 수집기와 같은 값

export function transitLines(transit: Transit | undefined): TransitLine[] {
  if (!transit) return [];
  const out: TransitLine[] = [];
  const walk = (min?: number, m?: number) => {
    const dist = m ?? (min !== undefined ? Math.round(min * WALK_M_PER_MIN) : undefined);
    return dist !== undefined && min !== undefined ? `도보 약 ${min}분 (${dist}m)` : min !== undefined ? `도보 약 ${min}분` : "거리 정보 없음";
  };
  if (transit.nearest_station) {
    const { station, line } = splitStation(transit.nearest_station);
    out.push({ icon: "subway", title: line ? `${station} ${line}` : station, detail: walk(transit.station_walk_min, transit.station_distance_m) });
  }
  if (transit.nearest_bus_stop) {
    out.push({ icon: "bus", title: `${transit.nearest_bus_stop} 정류장`, detail: walk(transit.bus_walk_min, transit.bus_distance_m) });
  }
  return out;
}

/**
 * 지도 앱으로 넘긴다. 앱 안에 지도를 그리지 않는 이유는 지도 SDK가 네이티브 의존이고,
 * 사용자는 어차피 길찾기를 쓰던 앱에서 한다 — 여기서 할 일은 정확한 좌표를 넘겨 주는 것까지다.
 */
export function mapUrl(a: Pick<Announcement, "lat" | "lng" | "title" | "address">): string | null {
  if (a.lat === undefined || a.lng === undefined) return null;
  const label = encodeURIComponent(a.address || a.title);
  return Platform.OS === "ios"
    ? `http://maps.apple.com/?ll=${a.lat},${a.lng}&q=${label}`
    : `geo:${a.lat},${a.lng}?q=${a.lat},${a.lng}(${label})`;
}

export async function openMap(a: Pick<Announcement, "lat" | "lng" | "title" | "address">): Promise<boolean> {
  const url = mapUrl(a);
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
