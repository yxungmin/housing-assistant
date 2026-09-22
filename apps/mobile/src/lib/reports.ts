/**
 * "이 숫자 이상해요" — 항목 단위 신고.
 *
 * 신고는 기기에 먼저 쌓이고(그래야 오프라인·Supabase 미설정에서도 버튼이 동작한다) 보낼 수 있을 때 보낸다.
 * 서버가 처리하면 `issue_report_status` 뷰에서 결과를 받아 "확인 중"을 끝맺는다.
 * 보내는 것은 신고한 항목과 사용자가 쓴 한 줄뿐이다. 프로필은 어떤 경우에도 보내지 않는다.
 */
export type ReportTargetKind = "rule" | "pricing" | "schedule" | "other";

/** 앱은 extraction(jsonb)만 읽어서 룰·가격의 서버 id를 모른다. 순번과 보이던 문장으로 가리킨다. */
export interface ReportTarget {
  kind: ReportTargetKind;
  trackIndex?: number;
  itemIndex?: number;
  /** 신고 당시 화면에 보이던 문장 */
  label: string;
  page?: number;
}

export type ReportStatus = "OPEN" | "NO_CHANGE" | "FIXED" | "SOURCE_AMENDED" | "INVALID";

export interface LocalReport {
  id: string;
  announcementId: string;
  announcementTitle: string;
  target: ReportTarget;
  message: string;
  suggested?: string;
  createdAt: string;
  /** 서버에 들어갔는가. false면 다음 기회에 다시 보낸다 */
  sent: boolean;
  status: ReportStatus;
  /** 처리 결과 한 줄 (서버에서 받음) */
  resolution?: string;
  resolvedAt?: string;
}

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  OPEN: "확인 중",
  NO_CHANGE: "공고문과 같음",
  FIXED: "수정함",
  SOURCE_AMENDED: "공고 정정됨",
  INVALID: "확인 불가",
};

/** 한 공고 안에서 항목을 가리키는 키. 같은 항목을 두 번 신고하지 않게 한다. */
export const targetKey = (t: ReportTarget): string => `${t.kind}:${t.trackIndex ?? "-"}:${t.itemIndex ?? "-"}`;

export const findReport = (reports: LocalReport[], announcementId: string, target: ReportTarget): LocalReport | undefined =>
  reports.find((r) => r.announcementId === announcementId && targetKey(r.target) === targetKey(target));

/** 아직 끝나지 않은 신고 */
export const isOpen = (r: LocalReport): boolean => r.status === "OPEN";

/**
 * 기기가 만드는 신고 id. 같은 신고를 다시 보내도 서버에 한 건으로 남는다(client_id unique).
 * expo-crypto를 더 끌어오지 않으려고 randomUUID가 없으면 시각+난수로 만든다.
 */
export function newReportId(): string {
  const uuid = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.();
  return uuid ?? `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function draftReport(input: {
  announcementId: string;
  announcementTitle: string;
  target: ReportTarget;
  message: string;
  suggested?: string;
  now?: Date;
}): LocalReport {
  return {
    id: newReportId(),
    announcementId: input.announcementId,
    announcementTitle: input.announcementTitle,
    target: input.target,
    message: input.message.trim(),
    suggested: input.suggested?.trim() || undefined,
    createdAt: (input.now ?? new Date()).toISOString(),
    sent: false,
    status: "OPEN",
  };
}

/** 서버 announcements.id는 uuid다. 번들·캐시 데이터의 id("018")로는 넣을 수 없으니 보내지 않고 기기에 둔다. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const canSend = (r: LocalReport): boolean => UUID.test(r.announcementId);

export interface ReportPayload {
  client_id: string;
  announcement_id: string;
  target_kind: ReportTargetKind;
  track_index: number | null;
  item_index: number | null;
  label: string;
  page: number | null;
  message: string;
  suggested: string | null;
  created_at: string;
}

export function toPayload(r: LocalReport): ReportPayload {
  return {
    client_id: r.id,
    announcement_id: r.announcementId,
    target_kind: r.target.kind,
    track_index: r.target.trackIndex ?? null,
    item_index: r.target.itemIndex ?? null,
    label: r.target.label,
    page: r.target.page ?? null,
    message: r.message,
    suggested: r.suggested ?? null,
    created_at: r.createdAt,
  };
}
