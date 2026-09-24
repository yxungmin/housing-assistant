/**
 * 공고 하나의 보강 — 좌표·주변 → 시세 → 대기현황 → 관리비 → 통근.
 *
 * 수집기(run.ts, 신규 공고를 DB에)와 번들 스크립트(enrich.ts, 파일에)가 **같은 함수**를 부른다.
 * 전에는 둘이 60줄을 각자 들고 있었고 이미 어긋나 있었다 — 시세의 "법정동이 구보다 굵으면 안 쓴다" 가드가
 * enrich에만 있어 run.ts는 서울 전체 시세를 단지 시세로 저장할 수 있었고, 관리비 지역 라벨도 서로 달랐다 (2026-09-24 감사).
 *
 * 값을 **돌려준다**(patch). 어디에 쓰는지는 부르는 쪽이 정한다 — DB upsert든 번들 행이든.
 * 이미 있는 값은 건너뛴다(force가 아니면). 어느 단계도 다음 단계를 막지 않는다 — 좌표만 예외다(시세·통근의 전제).
 */
import type { UnitPlaces } from "@housing/schema";
import { regionByCode } from "@housing/schema";
import type { Env } from "./config";
import { geocodeAddress } from "./geo/kakao";
import { loadBasisCache, saveBasisCache } from "./maintenance/basis-cache";
import { KaptClient, type MaintenanceInfo } from "./maintenance/kapt";
import { isUsable, RentClient, type MarketRent } from "./market/rent";
import { commuteTable, type CommuteTable } from "./transit/table";
import { WaitClient, type WaitSummary } from "./wait/myhome";

export interface EnrichInput {
  /** 로그에 찍을 이름 (번들 id 또는 제목) */
  label: string;
  title: string;
  region_code: string;
  address: string;
  /** 공급기관 단지명 (LH 상세). 대기현황·관리비 단지 맞추기에 쓴다 */
  complex?: string;
  /** 단지 세대수 (LH 상세). 관리비 지역 표본을 비슷한 크기로 고르는 기준 */
  households?: number;
  extraction: { tracks: { unit_types: { exclusive_area_m2?: number }[] }[] };
  /** 이미 채워진 값. 있으면 그 단계는 건너뛴다 */
  existing?: Partial<EnrichPatch>;
}

export interface EnrichPatch {
  lat?: number;
  lng?: number;
  /** 법정동 코드 10자리 (지오코딩). 시세·관리비의 시군구를 여기서 자른다 */
  b_code?: string;
  transit?: Record<string, unknown>;
  nearby?: Record<string, unknown>[];
  market?: MarketRent;
  waiting?: WaitSummary;
  maintenance?: MaintenanceInfo;
  commute?: CommuteTable;
}

export interface EnrichDeps {
  env: Pick<Env, "KAKAO_REST_API_KEY" | "MOLIT_API_KEY" | "MYHOME_API_KEY" | "KAPT_API_KEY" | "TRANSIT_API_KEY">;
  /** 통근표를 만들 시도 코드 (COLLECT_REGIONS) */
  regions: string[];
  log?: (msg: string) => void;
  /** 다시 채운다 (있어도) */
  force?: boolean;
}

/** 시세를 비교할 기준 면적. 공고의 주택형 중 가장 많이 나오는 전용면적을 쓴다 */
export function representativeArea(extraction: EnrichInput["extraction"]): number | undefined {
  const areas = extraction.tracks.flatMap((t) => t.unit_types.map((u) => u.exclusive_area_m2)).filter((a): a is number => typeof a === "number" && a > 0);
  if (areas.length === 0) return undefined;
  const counts = new Map<number, number>();
  for (const a of areas) counts.set(a, (counts.get(a) ?? 0) + 1);
  return [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0]![0];
}

/**
 * "서울 강서구" — 관리비 지역 평균의 범위를 화면에 적기 위한 라벨.
 * 주소 두 번째 어절이 시·군·구로 끝날 때만 붙인다 (앱 remote.ts와 같은 규칙). SH 공고는 "서울특별시 일원(…)"처럼 온다.
 */
export function districtLabel(regionCode: string, address?: string): string {
  const sido = regionByCode(regionCode)?.label ?? regionCode;
  const token = address?.split(/\s+/)[1];
  return token && /[시군구]$/.test(token) ? `${sido} ${token}` : sido;
}

export async function enrichAnnouncement(input: EnrichInput, deps: EnrichDeps): Promise<EnrichPatch> {
  const { env, regions, force = false } = deps;
  const log = deps.log ?? (() => {});
  const have = input.existing ?? {};
  const patch: EnrichPatch = {};
  const need = (k: keyof EnrichPatch) => force || have[k] === undefined;

  // 1) 좌표·주변 (시세·통근의 전제). 좌표가 손으로 넣은 값이면 법정동 코드가 없다 — 그때도 지오코딩한다.
  let lat = have.lat;
  let lng = have.lng;
  let bCode = have.b_code;
  if (need("lat") || need("b_code")) {
    const geo = env.KAKAO_REST_API_KEY ? await geocodeAddress(input.address, env.KAKAO_REST_API_KEY).catch(() => null) : null;
    if (geo) {
      lat = patch.lat = geo.lat;
      lng = patch.lng = geo.lng;
      bCode = patch.b_code = geo.b_code;
      patch.transit = geo.transit;
      patch.nearby = geo.nearby;
      log(`  좌표 ${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)} · 법정동 ${geo.b_code ?? "?"} · 주변 ${geo.nearby.length}곳`);
    } else log(env.KAKAO_REST_API_KEY ? `  좌표 실패 — 시세·통근은 건너뜀` : `  KAKAO_REST_API_KEY 없음 — 좌표·시세·통근 건너뜀`);
  }

  // 2) 주변 시세: 법정동 앞 5자리 + 대표 전용면적. 표본이 적으면 넣지 않는다 — 몇 건으로 "시세"라고 말하면 거짓말이 된다.
  //    법정동 코드가 시군구보다 굵으면(1100000000 = 서울 전체) 그 시세는 이 단지 것이 아니다.
  const area = representativeArea(input.extraction);
  const preciseDong = !!bCode && bCode.slice(2, 5) !== "000";
  if (need("market") && preciseDong && area && env.MOLIT_API_KEY) {
    const m = await new RentClient(env.MOLIT_API_KEY).summary(bCode!.slice(0, 5), area).catch((e: unknown) => {
      log(`  시세 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    });
    if (m && isUsable(m)) {
      patch.market = m;
      log(`  시세 ${m.deals}건 (전용 ${m.area_from}~${m.area_to}㎡, ${m.from}~${m.to}) · 전세 중앙값 ${((m.jeonse_median ?? 0) / 100_000_000).toFixed(2)}억`);
    } else if (m) log(`  시세 표본 부족 — 넣지 않음`);
  }

  // 3) 예비입주자 대기현황: 단지명이 공고 제목·주소에 들어 있을 때만 맞춘다. 못 맞추면 없는 채로 둔다.
  if (need("waiting") && env.MYHOME_API_KEY) {
    const w = await new WaitClient(env.MYHOME_API_KEY).forAnnouncement(input.region_code, input.title, input.address).catch(() => null);
    if (w) {
      patch.waiting = w;
      log(`  대기현황 ${w.complex} 대기 ${w.total_waiting}명 (${w.as_of ?? "기준일 미상"})`);
    } else log(`  대기현황 단지 못 맞춤`);
  }

  // 4) 관리비 단가 (K-apt): 단지를 맞추면 그 단지 신고값, 못 맞추면(신축) 같은 구 단지들의 중앙값. 앱이 전용면적을 곱한다.
  //    구가 없는 법정동 코드(서울 전체)면 클라이언트가 스스로 건너뛴다. 단지 기본정보 캐시는 파일에 남긴다 — 실패했어도 그때까지 받은 것은 저장한다.
  const kaptKey = env.KAPT_API_KEY ?? env.MOLIT_API_KEY;
  if (need("maintenance") && bCode && kaptKey) {
    const basisCache = loadBasisCache();
    const kapt = new KaptClient(kaptKey, fetch, basisCache);
    const m = await kapt
      .forAnnouncement({ sigunguCode: bCode.slice(0, 5), district: districtLabel(input.region_code, input.address), title: input.title, complex: input.complex, address: input.address, households: input.households })
      .catch((e: unknown) => {
        log(`  관리비 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      });
    saveBasisCache(basisCache);
    if (m) {
      patch.maintenance = m;
      const who = m.basis === "complex" ? `${m.complex} 신고값` : `${m.district} ${m.sample}단지 중앙값${m.sample_households ? ` (${m.sample_households[0]}~${m.sample_households[1]}세대, 공고 ${input.households ?? "?"}세대)` : ""}`;
      log(`  관리비 ${who} · 공용 ${m.common_per_m2}원/㎡${m.individual_per_m2 ? ` + 사용료 ${m.individual_per_m2}원/㎡` : ""} (${m.months.join("·")}, ${kapt.calls}회)`);
    } else log(`  관리비 단지·지역 표본 없음 (${kapt.calls}회)`);
  }

  // 5) 통근 (시군구 대표 좌표 × 이 단지). 사용자마다 부르면 호출이 사용자 수에 비례하고 직장 위치도 서버로 나가야 한다.
  if (need("commute") && lat !== undefined && lng !== undefined) {
    const t = await commuteTable({ lat, lng }, regions, { kakao: env.KAKAO_REST_API_KEY, seoul: env.TRANSIT_API_KEY }).catch(() => undefined);
    if (t) {
      patch.commute = t;
      const vals = Object.values(t).map((v) => v.minutes);
      log(`  통근 ${Object.keys(t).length}곳 · ${Math.min(...vals)}~${Math.max(...vals)}분`);
    } else log(`  통근 경로 없음`);
  }

  return patch;
}

/** 다 채워졌는가 — enrich.ts가 "이미 채워짐"으로 건너뛸지 판단할 때 */
export const fullyEnriched = (have: Partial<EnrichPatch> & { unit_places?: UnitPlaces }): boolean =>
  have.lat !== undefined && have.b_code !== undefined && have.market !== undefined && have.commute !== undefined && have.maintenance !== undefined;
