import type { SupplyUnit } from "@housing/schema";
import { readSheet } from "../xlsx";

/**
 * 매입임대·전세임대의 "공급주택목록" 첨부를 읽는다.
 *
 * 이 유형은 단지가 아니라 흩어진 개별 주택이다. 공고문 본문에는 "총 81호"만 있고,
 * 주택마다의 소재지·면적·임대조건은 별도 엑셀 첨부에 있다. 그 목록이 이 유형의 핵심이다 —
 * 어느 집이 내 직장에서 가까운지가 신청할지 말지를 가른다. 총 호수만으로는 아무것도 못 고른다.
 *
 * 2026-09-22 실제 파일로 확인한 모양 (26년3차 신혼·신생아매입임대Ⅰ, 서울지역본부):
 *   1~8행 제목·안내문, 9행 머리글, 10행부터 데이터 (81행)
 *   A 순번 · E 주소 · F 동 · G 호 · H 주택군 · J 전용면적 · M 방수 · N 층수 · O 승강기 · P 주택유형
 *   Q/R 수급자등 기본 보증금·월세 · S/T 그 최대전환 · U/V 그 외(소득70%이하) 기본 · W/X 그 최대전환
 *
 * 열 위치를 숫자로 박지 않고 머리글 이름으로 찾는다. 지역본부마다 열이 하나씩 다를 수 있고,
 * 위치로 박아 두면 그때 조용히 다른 값을 읽는다. 이름을 못 찾으면 빈 목록을 주고 넘어간다 —
 * 틀린 주소를 화면에 올리느니 목록이 없는 편이 낫다.
 */

/** 머리글이 줄바꿈("전용\n면적")과 공백을 섞어 쓴다. 비교 전에 다 지운다. */
const key = (s: string): string => s.replace(/\s+/g, "");

/**
 * 머리글 행 찾기.
 *
 * "순번"·"지역본부" 같은 칸은 세 행에 걸친 병합 셀이라 값이 맨 윗 행에만 있다.
 * 그래서 "순번이 있는 행"으로 찾으면 실제 열 이름이 늘어선 행을 놓친다 (2026-09-22 실측).
 * 우리가 읽는 열이 모두 있는 행을 찾는다 — 주소와, 면적이나 임대료 중 하나.
 */
function headerRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = rows[i]!.map(key);
    if (cells.includes("주소") && cells.some((c) => c === "전용면적" || c === "월임대료" || c === "면적계")) return i;
  }
  return -1;
}

/**
 * 임대조건 열 짝 찾기.
 *
 * 임대보증금·월임대료가 소득 구간 × (기본/최대전환) = 네 번 반복된다. 구간 이름은 두 행 위,
 * 기본/전환 구분은 한 행 위에 병합 셀로 있어서 그 열에는 값이 없다 — 왼쪽으로 훑어 가장 가까운 값을 쓴다.
 *
 * 실측 (2026-09-22): Q 수급자·기본 / S 수급자·최대전환 / U 그 외·기본 / W 그 외·최대전환.
 */
function rentColumns(rows: string[][], headerAt: number): { at: number; tier: string; maxConversion: boolean }[] {
  const header = rows[headerAt] ?? [];
  const leftward = (row: string[] | undefined, from: number): string => {
    for (let i = from; i >= 0; i--) if (row?.[i]) return row[i]!;
    return "";
  };
  const out: { at: number; tier: string; maxConversion: boolean }[] = [];
  header.forEach((h, i) => {
    if (key(h) !== "임대보증금") return;
    const tier = leftward(rows[headerAt - 2], i) || leftward(rows[headerAt - 1], i);
    const kind = leftward(rows[headerAt - 1], i);
    out.push({ at: i, tier: tier.replace(/\s+/g, " ").trim(), maxConversion: /전환/.test(kind) });
  });
  return out;
}

function columnMap(header: string[]): Map<string, number> {
  const out = new Map<string, number>();
  header.forEach((h, i) => {
    const k = key(h);
    // 임대보증금·월임대료는 소득 구간마다 반복된다. 처음 것(수급자 등 기본)만 잡는다.
    if (k && !out.has(k)) out.set(k, i);
  });
  return out;
}

const num = (s: string | undefined): number | undefined => {
  if (!s) return undefined;
  const v = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(v) ? v : undefined;
};

/** "4층" → 4, "지하1층" → -1 */
const floor = (s: string | undefined): number | undefined => {
  if (!s) return undefined;
  const v = num(s);
  if (v === undefined) return undefined;
  return /지하|B/i.test(s) ? -Math.abs(v) : v;
};

export function parseUnitList(file: Buffer): SupplyUnit[] {
  const rows = readSheet(file);
  const at = headerRow(rows);
  if (at < 0) return [];
  const col = columnMap(rows[at]!);
  const rentCols = rentColumns(rows, at);

  const get = (row: string[], name: string): string | undefined => {
    const i = col.get(name);
    return i === undefined ? undefined : row[i] || undefined;
  };

  const out: SupplyUnit[] = [];
  for (const row of rows.slice(at + 1)) {
    const address = get(row, "주소");
    // 주소가 없으면 그 행은 합계·안내문이다. 목록의 끝이 아니라 사이에도 섞여 있어 건너뛴다.
    if (!address || !/[시군구]/.test(address)) continue;

    const dong = get(row, "동");
    const ho = get(row, "호");
    const options = rentCols
      .map((c) => ({ tier: c.tier, max_conversion: c.maxConversion, deposit: num(row[c.at]), monthly_rent: num(row[c.at + 1]) }))
      .filter((o): o is { tier: string; max_conversion: boolean; deposit: number; monthly_rent: number } => o.deposit !== undefined && o.monthly_rent !== undefined);
    out.push({
      // 주소 하나에 여러 세대가 있다. 동·호까지 합쳐야 한 집이 된다.
      id: [address, dong, ho].filter(Boolean).join(" "),
      address,
      dong,
      ho,
      complex: get(row, "주택군이름"),
      housing_form: get(row, "주택유형"),
      exclusive_area_m2: num(get(row, "전용면적")),
      total_area_m2: num(get(row, "면적계")),
      rooms: num(get(row, "방수")),
      floor: floor(get(row, "층수")),
      elevator: get(row, "승강기유무") === "Y" ? true : get(row, "승강기유무") === "N" ? false : undefined,
      viewing: get(row, "주택열람일정"),
      rent_options: options.length > 0 ? options : undefined,
      // 호환용. 화면은 rent_options에서 사람에 맞는 구간을 고른다.
      deposit: options[0]?.deposit ?? num(get(row, "임대보증금")),
      monthly_rent: options[0]?.monthly_rent ?? num(get(row, "월임대료")),
    });
  }
  return out;
}

/** 목록 첨부 고르기. 이름에 "주택목록"이나 "공급주택"이 들어간 xlsx 하나. */
export function pickUnitList<T extends { name: string; url: string }>(attachments: T[]): T | undefined {
  return attachments.find((a) => /\.xlsx?$/i.test(a.name) && /주택목록|공급주택|주택내역/.test(a.name));
}
