import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { buildFacts } from "../src/social/facts";
import { headlineTarget, templateScript, type ReelScript } from "../src/social/script";
import { verifyScript } from "../src/social/verify";
import { polishScript } from "../src/social/copy";

// 번들은 커밋되는 실제 공고 데이터다 (apps/mobile/data)
const rows = JSON.parse(readFileSync(new URL("../../apps/mobile/data/announcements.json", import.meta.url), "utf8")).filter(
  (r: { status: string }) => r.status !== "UNVERIFIED",
);
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
    expect(tamper(editLine("신혼부부도 신청 대상", "신혼부부 신청 가능")).ok).toBe(false);
  });
  it("대상이 아닌 사람을 부르면", () => {
    expect(tamper(editLine("새 공고가 올라왔어요", "고령자 새 공고")).errors.join()).toContain("고령자");
  });
  it("다른 지역·다른 공급 유형", () => {
    expect(tamper(editLine("새 공고가 올라왔어요", "부산 새 공고")).ok).toBe(false);
    expect(tamper(editLine("매입임대", "행복주택")).ok).toBe(false);
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
