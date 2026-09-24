import { inflateRawSync } from "node:zlib";

/**
 * xlsx에서 표만 꺼낸다.
 *
 * 라이브러리를 넣지 않은 이유: 우리가 읽는 것은 LH가 만든 공급주택목록 한 종류이고,
 * 거기서 필요한 것은 셀의 문자열뿐이다. 서식·수식·차트를 읽을 일이 없다.
 * xlsx는 zip 안에 XML 몇 개가 든 형식이라 zlib만으로 열린다.
 *
 * 읽는 파일은 둘이다.
 *  - xl/sharedStrings.xml: 시트가 문자열을 번호로 참조한다. 그 번호표.
 *  - xl/worksheets/sheet1.xml: 행과 셀.
 *
 * 스타일·날짜 서식은 무시한다. 날짜 셀은 1900년 기준 일련번호로 나오는데,
 * 우리가 읽는 표에는 날짜 칸이 없다. 생기면 그때 맞춘다 — 지금 짐작해서 넣으면
 * 확인할 수 없는 변환 코드만 남는다.
 */

/** zip 로컬 헤더를 훑어 필요한 엔트리만 푼다. 중앙 디렉터리는 읽지 않는다 — 이름으로 찾으면 충분하다. */
function unzip(buf: Buffer, want: (name: string) => boolean): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let i = 0;
  while (i + 30 <= buf.length && buf.readUInt32LE(i) === 0x04034b50) {
    const method = buf.readUInt16LE(i + 8);
    const csize = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString("utf8");
    const start = i + 30 + nameLen + extraLen;
    if (want(name)) {
      const raw = buf.subarray(start, start + csize);
      out.set(name, method === 8 ? inflateRawSync(raw) : Buffer.from(raw));
    }
    i = start + csize;
  }
  return out;
}

const decode = (s: string): string =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

/** "BC12" → 54 (0부터). 셀이 비면 XML에서 통째로 빠지므로 열 위치를 좌표로 알아야 한다. */
export function columnIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? "";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * 시트 하나를 문자열 표로. 빈 셀은 "".
 * 행 번호가 건너뛰어도 그 자리를 빈 행으로 채운다 — 머리글이 9행이면 9행에 있어야 한다.
 */
export function readSheet(file: Buffer): string[][] {
  const files = unzip(file, (n) => n === "xl/sharedStrings.xml" || n === "xl/worksheets/sheet1.xml");
  const sheet = files.get("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("xl/worksheets/sheet1.xml 없음 — xlsx가 아니거나 시트 이름이 다르다");

  const sharedXml = files.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    // 한 셀 안에 서식이 나뉘면 <t>가 여러 개다. 붙여야 원래 문자열이 된다.
    decode([...m[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]!).join("")),
  );

  const xml = sheet.toString("utf8");
  const rows: string[][] = [];
  for (const m of xml.matchAll(/<row[^>]*?r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const at = Number(m[1]) - 1;
    const cells: string[] = [];
    // 값이 없고 서식만 있는 칸은 <c r="B7" s="5"/>처럼 자기닫힘으로 온다.
    // 닫는 태그를 요구하면 그 칸부터 다음 </c>까지를 한 칸으로 삼아 값이 엉뚱한 열에 들어간다
    // (머리글이 병합 셀인 행에서 실제로 그랬다). 두 모양을 다 받는다.
    for (const c of m[2]!.matchAll(/<c\s+r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const col = columnIndex(c[1]!);
      const type = /t="([^"]*)"/.exec(c[2]!)?.[1];
      const body = c[3] ?? "";
      let value: string;
      if (type === "s") {
        const idx = Number(/<v>([^<]*)<\/v>/.exec(body)?.[1]);
        value = shared[idx] ?? "";
      } else if (type === "inlineStr") {
        value = decode([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]!).join(""));
      } else {
        value = decode(/<v>([^<]*)<\/v>/.exec(body)?.[1] ?? "");
      }
      while (cells.length < col) cells.push("");
      cells[col] = value.trim();
    }
    while (rows.length < at) rows.push([]);
    rows[at] = cells;
  }
  return rows;
}
