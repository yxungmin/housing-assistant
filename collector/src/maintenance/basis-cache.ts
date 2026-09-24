/**
 * K-apt 단지 기본정보 캐시 파일 (collector/data/kapt-basis.json, **커밋한다**).
 *
 * 세대수·전용면적합은 바뀌지 않는데 목록 API에는 없어 단지마다 한 번 물어야 한다(강서구 212단지 = 212회).
 * 파일로 남기면 구마다 한 번만 들고, Actions에서도 저장소의 값을 그대로 쓴다.
 * 값이 null인 항목은 "물어봤는데 기본정보가 없더라" — 다시 묻지 않는다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fromRoot } from "../paths";
import type { BasisCache, KaptBasis } from "./kapt";

export const BASIS_CACHE_PATH = fromRoot("collector", "data", "kapt-basis.json");

export function loadBasisCache(path = BASIS_CACHE_PATH): BasisCache {
  if (!existsSync(path)) return new Map();
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, KaptBasis | null>;
  return new Map(Object.entries(raw));
}

/** 코드 순으로 정렬해 쓴다 — 실행마다 diff가 흔들리지 않게 */
export function saveBasisCache(cache: BasisCache, path = BASIS_CACHE_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  const sorted = Object.fromEntries([...cache.entries()].sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(path, JSON.stringify(sorted, null, 1));
}
