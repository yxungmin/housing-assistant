/**
 * 관심 공고의 값이 바뀌었는지 찾아 사용자에게 알린다.
 *
 * 값은 두 가지 이유로 바뀐다 — 우리가 신고를 받아 고쳤거나(검수), 공고가 정정되었거나.
 * 어느 쪽이든 조용히 바꾸면 안 된다. 사용자는 그 숫자를 보고 판단했고, 계산까지 돌렸을 수 있다.
 *
 * 무엇이 바뀌었는지까지 말한다 ("보증금 5억 1,402만 원 → 4억 3,524만 원").
 * 바뀐 사실만 알리면 사용자는 앱을 열어 처음부터 다시 확인해야 한다.
 */
import type { Announcement } from "@/data/announcements";
import { longDate, manwon, won } from "./format";

export type ChangeKind = "deadline" | "price" | "rule" | "verified";

export interface AnnouncementChange {
  kind: ChangeKind;
  text: string;
}

export interface ChangeRecord {
  announcementId: string;
  title: string;
  /** 바뀐 것을 발견한 시각 (ISO) */
  at: string;
  changes: AnnouncementChange[];
  /** 사용자가 그 공고를 열어 봤는가 */
  seen: boolean;
}

/** 한 화면에 몰아 보여 주지 않는다. 가장 중요한 것부터 몇 줄만. */
const MAX_LINES = 3;
const ORDER: Record<ChangeKind, number> = { price: 0, deadline: 1, rule: 2, verified: 3 };

/** 같은 임대조건 행을 가리키는 키. 이름이 같으면 같은 행으로 본다. */
const priceKey = (p: { unit_type: string; tier?: string }) => `${p.unit_type}|${p.tier ?? ""}`;

const priceRows = (a: Announcement) =>
  new Map(a.extraction.tracks.flatMap((t) => t.pricing.map((p) => [priceKey(p), p] as const)));

/** 조건은 (category, operator, 값)으로 센다. 트랙 이름·순번이 바뀌어도 내용이 같으면 같은 조건이다. */
const ruleKeys = (a: Announcement) =>
  new Set(a.extraction.tracks.flatMap((t) => t.rules.map((r) => `${r.category}|${r.operator}|${JSON.stringify(r.value)}`)));

export function diffAnnouncement(before: Announcement, after: Announcement): AnnouncementChange[] {
  const out: AnnouncementChange[] = [];

  if (before.apply_end !== after.apply_end && after.apply_end) {
    out.push({ kind: "deadline", text: `접수 마감이 ${longDate(after.apply_end)}로 바뀌었어요` });
  }

  const was = priceRows(before);
  for (const [key, now] of priceRows(after)) {
    const old = was.get(key);
    if (!old) continue; // 새로 생긴 행은 아래 "조건·임대조건" 줄로 묶는다
    const label = now.tier ? `${now.unit_type} ${now.tier}` : now.unit_type;
    if (old.deposit !== now.deposit && now.deposit !== undefined && old.deposit !== undefined) {
      out.push({ kind: "price", text: `${label} 보증금 ${manwon(old.deposit)} → ${manwon(now.deposit)}` });
    }
    if (old.monthly_rent !== now.monthly_rent && now.monthly_rent !== undefined && old.monthly_rent !== undefined) {
      out.push({ kind: "price", text: `${label} 월임대료 ${won(old.monthly_rent)} → ${won(now.monthly_rent)}` });
    }
  }
  const rowsBefore = was.size;
  const rowsAfter = priceRows(after).size;
  if (rowsBefore !== rowsAfter) {
    out.push({ kind: "price", text: `임대조건이 ${rowsBefore}개에서 ${rowsAfter}개로 바뀌었어요` });
  }

  const rulesBefore = ruleKeys(before);
  const rulesAfter = ruleKeys(after);
  const added = [...rulesAfter].filter((k) => !rulesBefore.has(k)).length;
  const removed = [...rulesBefore].filter((k) => !rulesAfter.has(k)).length;
  if (added || removed) {
    const parts = [added ? `${added}개 추가` : "", removed ? `${removed}개 빠짐` : ""].filter(Boolean);
    out.push({ kind: "rule", text: `자격 조건이 바뀌었어요 (${parts.join(" · ")})` });
  }

  if (before.status !== "VERIFIED" && after.status === "VERIFIED") {
    out.push({ kind: "verified", text: "사람이 공고문과 대조해 확인했어요" });
  }

  return out.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]).slice(0, MAX_LINES);
}

/** 관심 공고만 본다. 저장하지 않은 공고까지 알리면 알림이 소음이 된다. */
export function detectChanges(
  before: Announcement[],
  after: Announcement[],
  savedIds: string[],
  now: Date = new Date(),
): ChangeRecord[] {
  const saved = new Set(savedIds);
  const byId = new Map(before.filter((a) => saved.has(a.id)).map((a) => [a.id, a]));
  const out: ChangeRecord[] = [];
  for (const a of after) {
    if (!saved.has(a.id)) continue;
    const old = byId.get(a.id);
    if (!old) continue; // 처음 본 공고는 "바뀐 것"이 아니다
    const changes = diffAnnouncement(old, a);
    if (changes.length > 0) out.push({ announcementId: a.id, title: a.title, at: now.toISOString(), changes, seen: false });
  }
  return out;
}

/** 알림 한 줄 (기기 알림 본문). 여러 개면 첫 줄 + 나머지 개수. */
export const changeSummary = (r: ChangeRecord): string =>
  r.changes.length > 1 ? `${r.changes[0]!.text} 외 ${r.changes.length - 1}건` : (r.changes[0]?.text ?? "");

export const unseenChange = (records: ChangeRecord[], announcementId: string): ChangeRecord | undefined =>
  records.find((r) => r.announcementId === announcementId && !r.seen);
