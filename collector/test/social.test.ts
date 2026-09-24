import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { buildFacts } from "../src/social/facts";
import { headlineTarget, templateScript, type ReelScript } from "../src/social/script";
import { verifyScript } from "../src/social/verify";
import { polishScript } from "../src/social/copy";

// 번들은 커밋되는 실제 공고 데이터다 (apps/mobile/data). 앱 번들은 서비스 지역(수도권)만 담으므로,
// 지방 공고로만 확인되는 경우(제주 행복주택 세대 수, 양산 완화 모집)는 그 공고를 떼어 둔 픽스처에서 읽는다.
const load = (url: URL) => JSON.parse(readFileSync(url, "utf8"));
const rows = [
  ...load(new URL("../../apps/mobile/data/announcements.json", import.meta.url)),
  ...load(new URL("./fixtures/outside-region-announcements.json", import.meta.url)),
].filter((r: { status: string }) => r.status !== "UNVERIFIED");
const row = (id: string) => rows.find((r: { id: string }) => r.id === id)!;
const TODAY = new Date(2026, 8, 23);

describe("사실 추출", () => {
  it("제목이 청년 공급이면 트랙의 가구 계층(한부모·수급자)을 대상으로 부르지 않는다", () => {
    // 청년매입임대 1순위 "수급자·한부모 가구"는 그런 가구의 청년이라는 순위 조건이다
    const f = buildFacts(row("014"));
    expect(headlineTarget(f)).toBe("청년");
    expect(f.targets.map((t) => t.value)).not.toContain("한부모");
  });

  it("세대 수가 일부 트랙에만 있으면 모집 규모를 말하지 않는다 — '모집 4세대'가 될 뻔했다", () => {
    expect(buildFacts(row("008")).supply).toBeUndefined();
    expect(buildFacts(row("007")).supply?.value).toEqual({ count: 57, unit: "세대" });
  });

  it("일반공급이 있으면 특정 계층으로 좁혀 부르지 않고, 완화 모집은 그 사실을 앞에 둔다", () => {
    const f = buildFacts(row("010"));
    expect(headlineTarget(f)).toBe("");
    expect(f.splits[0]?.value).toBe("자격 요건을 완화한 모집이에요");
  });

  it("예비신혼은 이름에 없어도 혼인 규칙이 받으면 대상이다", () => {
    expect(buildFacts(row("012")).targets.map((t) => t.value)).toContain("예비신혼부부");
  });
});

describe("템플릿 대본", () => {
  it("지금 공고 전부 재대조를 통과한다", () => {
    for (const r of rows) {
      const f = buildFacts(r);
      for (const type of ["new", "caution"] as const) {
        const v = verifyScript(templateScript(f, type, { today: TODAY }), f, TODAY);
        expect(v.errors, `${r.id} ${type}`).toEqual([]);
      }
    }
  });

  it("다운로드 링크가 없으면 캡션의 링크 문장과 첫 댓글을 만들지 않는다 (출시 전)", () => {
    const s = templateScript(buildFacts(row("012")), "new", { today: TODAY });
    expect(s.comment).toBeNull();
    expect(s.caption).not.toContain("프로필 링크");
    expect(templateScript(buildFacts(row("012")), "new", { today: TODAY, appLink: "https://x" }).comment).not.toBeNull();
  });
});

describe("정보가 먼저, 앱 안내는 마지막 한 번", () => {
  it("앞 장면들은 공고 숫자다 — 앱 이야기는 cta 장면에만 나온다", () => {
    for (const r of rows) {
      const s = templateScript(buildFacts(r), "new", { today: TODAY });
      expect(s.scenes.at(-1)?.kind, r.id).toBe("cta");
      for (const sc of s.scenes.slice(0, -1)) expect(sc.lines.join(" "), `${r.id} ${sc.kind}`).not.toMatch(/앱/);
    }
  });

  it("임대료와 기준을 숫자로 말한다 (신혼·신생아 매입임대)", () => {
    const s = templateScript(buildFacts(row("012")), "new", { today: TODAY });
    const byKind = Object.fromEntries(s.scenes.map((sc) => [sc.kind, sc.lines.join(" / ")]));
    expect(byKind.price).toContain("보증금");
    expect(byKind.price).toContain("월세");
    // 3,432,027원 → 만 원 아래는 버린다 (기준이 실제보다 높게 보이면 안 된다)
    expect(byKind.who).toContain("1인 가구 월소득 343만 원 이하");
    expect(byKind.split).toContain("2인 가구 맞벌이 586만 원 이하");
  });

  it("기준이 일부 트랙에만 있으면 공고 전체 조건처럼 쓰지 않는다 — 강서염창의 나이는 청년 계층 기준이다", () => {
    const who = templateScript(buildFacts(row("008")), "new", { today: TODAY }).scenes.find((sc) => sc.kind === "who")!.lines;
    expect(who).toContain("청년 계층 만 18~39세");
    expect(who.join()).not.toMatch(/^만 18/);
  });

  it("조건주의 편은 갈리는 지점을 첫 장면 바로 뒤에 둔다", () => {
    const s = templateScript(buildFacts(row("012")), "caution", { today: TODAY });
    expect(s.scenes.map((sc) => sc.kind).slice(0, 2)).toEqual(["hook", "split"]);
  });
});

describe("재대조가 잡아야 하는 것", () => {
  const f = buildFacts(row("012"));
  const good = templateScript(f, "new", { today: TODAY });
  const tamper = (fn: (s: ReelScript) => ReelScript) => verifyScript(fn(structuredClone(good)), f, TODAY);
  const editLine = (from: string, to: string) => (s: ReelScript) => ({ ...s, scenes: s.scenes.map((sc) => ({ ...sc, lines: sc.lines.map((l) => l.replace(from, to)) })) });

  it("모집 수를 바꾸면 (81 → 18)", () => {
    expect(tamper(editLine("81호", "18호")).errors.join()).toContain("18");
  });
  it("날짜를 바꾸면 (9/28 → 9/29)", () => {
    expect(tamper((s) => ({ ...s, caption: s.caption.replace("9/28", "9/29") })).errors.join()).toContain("9/29");
  });
  it("단정 표현", () => {
    expect(tamper(editLine("앱에서 바로 확인", "신혼부부 신청 가능")).ok).toBe(false);
  });
  it("대상이 아닌 사람을 부르면", () => {
    expect(tamper(editLine("서울 신혼부부 매입임대", "서울 고령자 매입임대")).errors.join()).toContain("고령자");
  });
  it("다른 지역·다른 공급 유형", () => {
    expect(tamper(editLine("서울 신혼부부 매입임대", "부산 신혼부부 매입임대")).ok).toBe(false);
    expect(tamper(editLine("매입임대", "행복주택")).ok).toBe(false);
  });
  it("금액을 바꾸면 (소득 상한 343만 → 348만)", () => {
    expect(tamper(editLine("343만", "348만")).errors.join()).toContain("348");
  });
  it("고지 문장이 빠지면", () => {
    expect(tamper((s) => ({ ...s, caption: s.caption.replace(/공고 조건은.*$/m, "") })).ok).toBe(false);
  });
});

describe("Claude 다듬기 (가짜 클라이언트 — 과금 없음)", () => {
  const f = buildFacts(row("012"));
  const draft = templateScript(f, "new", { today: TODAY });
  const fake = (payload: unknown, stop_reason = "end_turn") =>
    ({
      messages: {
        create: async () => ({
          stop_reason,
          stop_details: stop_reason === "refusal" ? { category: "bio" } : null,
          usage: { input_tokens: 10, output_tokens: 10 },
          content: [{ type: "text", text: JSON.stringify(payload) }],
        }),
      },
    }) as unknown as Anthropic;
  const same = { scenes: draft.scenes.map(({ kind, lines }) => ({ kind, lines })), caption: draft.caption, hashtags: draft.hashtags };

  it("문장만 바꾸고 시간표는 템플릿 것을 쓴다", async () => {
    const r = await polishScript(f, draft, { client: fake({ ...same, scenes: same.scenes.map((s, i) => (i === 0 ? { ...s, lines: ["서울 신혼부부 매입임대", "새 공고 나왔어요"] } : s)) }) });
    expect(r.script?.scenes[0]?.lines[1]).toBe("새 공고 나왔어요");
    expect(r.script?.scenes.map((s) => s.at)).toEqual(draft.scenes.map((s) => s.at));
  });

  it("장면 구성을 바꾸면 버린다", async () => {
    const r = await polishScript(f, draft, { client: fake({ ...same, scenes: same.scenes.slice(1) }) });
    expect(r.script).toBeNull();
  });

  it("거절(refusal)이면 템플릿으로 돌아갈 수 있게 null", async () => {
    const r = await polishScript(f, draft, { client: fake(same, "refusal") });
    expect(r.script).toBeNull();
    expect(r.error).toContain("refusal");
  });

  it("Claude가 숫자를 틀리면 재대조에서 걸린다", async () => {
    const wrong = { ...same, scenes: same.scenes.map((s) => ({ ...s, lines: s.lines.map((l) => l.replace("81호", "82호")) })) };
    const r = await polishScript(f, draft, { client: fake(wrong) });
    expect(verifyScript(r.script!, f, TODAY).ok).toBe(false);
  });
});

describe("비용 차단", () => {
  it("SOCIAL_COPY_ENABLED가 없으면 실제 API를 부르지 않고 거부한다", async () => {
    const f = buildFacts(row("012"));
    const prev = process.env.SOCIAL_COPY_ENABLED;
    delete process.env.SOCIAL_COPY_ENABLED;
    await expect(polishScript(f, templateScript(f, "new", { today: TODAY }))).rejects.toThrow(/SOCIAL_COPY_ENABLED/);
    if (prev !== undefined) process.env.SOCIAL_COPY_ENABLED = prev;
  });
});

describe("정정 → 고정 댓글", async () => {
  const { detectCorrection } = await import("../src/social/correction");
  const before = buildFacts(row("012"));

  it("게시물에 나온 사실이 그대로면 댓글을 만들지 않는다", () => {
    expect(detectCorrection(before, buildFacts(row("012")))).toBeNull();
  });

  it("접수 마감이 바뀌면 무엇이 어떻게 바뀌었는지 적는다", () => {
    const after = buildFacts({ ...row("012"), apply_end: "2026-10-02" });
    const fix = detectCorrection(before, after)!;
    expect(fix.changes).toEqual(["접수 마감 9/30 → 10/2"]);
    expect(fix.comment).toContain("[정정 안내]");
    expect(fix.comment).toContain("게시물 내용은 정정 전 기준이에요");
    expect(fix.ok).toBe(true);
  });

  it("모집 수가 바뀌면 이전·이후를 둘 다 적는다", () => {
    const after = buildFacts({ ...row("012"), units: row("012").units.slice(0, 80) });
    expect(detectCorrection(before, after)!.changes).toContain("모집 81호 → 80호");
  });
});
