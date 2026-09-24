import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 글자 크기와 아이콘 크기는 토큰에서만 나온다.
 *
 * 2026-09-24 점검에서 화면 코드에 fontSize 13가지(12~36)와 아이콘 크기 12가지가 흩어져 있었다 —
 * 같은 자리인데 화면마다 15·16·17이 섞여 "중구난방"으로 보였다. 규칙을 문서에 적어 두는 것으로는 안 지켜져서
 * 테스트로 막는다: 화면·부품은 `T variant`(글자)와 `iconSize`/`tileSize`(아이콘)만 쓴다.
 * 예외는 토큰 파일 하나(src/theme/tokens.ts)뿐이다.
 */
const root = join(__dirname, "..");
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
};
const files = [...walk(join(root, "app")), ...walk(join(root, "src"))];
const offenders = (re: RegExp) =>
  files.flatMap((f) => {
    const s = readFileSync(f, "utf8");
    return s.split("\n").flatMap((line, i) => (re.test(line) ? [`${f.slice(root.length + 1)}:${i + 1}`] : []));
  });

describe("디자인 토큰", () => {
  it("화면·부품 코드에 fontSize 숫자를 직접 쓰지 않는다 — T variant를 쓴다", () => {
    expect(offenders(/fontSize:\s*\d/)).toEqual([]);
  });

  it("Icon·IconTile 크기는 iconSize·tileSize 토큰이다", () => {
    expect(offenders(/<Icon(Tile)?\b[^>]*\bsize=\{\s*\d/)).toEqual([]);
  });
});
