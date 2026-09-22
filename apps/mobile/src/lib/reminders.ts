/**
 * 기기에 걸 알림을 정하는 규칙. 실제 예약은 `notifications.ts`가 한다 —
 * 여기는 순수 함수라 테스트로 고정할 수 있다.
 *
 * 세 가지를 건다.
 *  - **접수 마감 3일 전**: 관심 공고. 놓치면 다음 기회까지 몇 달이다.
 *  - **당첨자 발표 3일 전·1일 전·당일**: "신청함"으로 표시한 공고.
 *  - **첫 결제 3일 전**: 첫 달 0원이 끝나기 전에 미리 알린다.
 *
 * 둘 다 무료다. 알림을 잠그면 돈을 안 낸 사람이 마감을 놓치게 되고, 그건 해를 끼치는 것이다.
 * 게다가 알림은 기기에서 예약해 원가가 0이면서 사람을 앱으로 되돌리는 장치다 — 잠글 이유가 없다.
 *
 * 예약은 한 번에 다시 건다(`cancelAll` 후 재예약). 그래서 두 종류를 한 곳에서 만들어야 한다.
 * 따로 걸면 나중에 거는 쪽이 앞의 것을 지운다.
 */

/**
 * 첫 결제 며칠 전에 알릴 것인가.
 *
 * 공정위 다크패턴 가이드라인이 "숨은 갱신"을 지목한다 — 무료 체험을 걸어 두고 결제일에
 * 말없이 긁는 방식이다. 그걸 안 하겠다는 약속을 코드로 지키는 자리다.
 * 사용자가 잊고 있다가 결제되는 것과, 알고도 그냥 두는 것은 전혀 다른 일이다.
 *
 * 알림을 꺼 둔 사람에게는 이것도 가지 않는다 (끈 것을 무시하지 않는다).
 * 대신 첫 결제일은 내 정보 화면에 늘 적혀 있어, 알림이 유일한 통로가 되지는 않는다.
 */
export const CHARGE_DAYS_BEFORE = 3;

/** 알림을 띄울 시각 (현지 시간 기준 시) */
const HOUR = 9;
const DEADLINE_DAYS_BEFORE = 3;
/** 발표는 여러 번 알린다. 당첨이면 그날부터 서류·계약금 일정이 시작된다 */
const ANNOUNCE_DAYS_BEFORE = [3, 1, 0];

export interface ReminderItem {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  apply_end?: string;
  /** 당첨자 발표일. "2027-02"처럼 월까지만 있는 공고도 있어 날짜로 읽히는 것만 쓴다 */
  winner_announce?: string;
  /** 관심 공고인가 — 마감 알림 대상 */
  saved?: boolean;
  /** "신청함"으로 표시했는가 — 발표 알림 대상 */
  applied?: boolean;
}

export interface PlannedReminder {
  id: string;
  /** 결제 고지는 공고와 무관하다 — 그때는 빈 문자열이고 화면 이동도 하지 않는다 */
  announcementId: string;
  kind: "deadline" | "announce" | "charge";
  at: Date;
  title: string;
  body: string;
  /** Android 알림 채널 */
  channel: string;
}

const FULL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** YYYY-MM-DD만 받는다. 월까지만 있는 값으로 날짜를 지어내지 않는다. */
function at(date: string, daysBefore: number): Date | null {
  const m = FULL_DATE.exec(date.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - daysBefore, HOUR, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

const md = (date: string) => {
  const m = FULL_DATE.exec(date.trim());
  return m ? `${Number(m[2])}월 ${Number(m[3])}일` : date;
};

/**
 * 지금 걸어야 할 알림 전부. 이미 지난 시각은 뺀다.
 *
 * 결제 고지까지 여기서 같이 만든다. 예약은 전부 지우고 다시 거는 방식이라
 * 종류마다 따로 부르면 나중에 부른 쪽이 앞의 것을 지운다.
 */
export function plannedReminders(
  items: ReminderItem[],
  now: Date = new Date(),
  opts: {
    /** 첫 결제 예정 시각 (ISO). 체험 중이 아니거나 해지했으면 넘기지 않는다 (`chargeDate`) */
    chargeAt?: string | null;
    /** 화면에 적히는 가격. 고지에 금액이 없으면 고지가 아니다 */
    priceText?: string;
  } = {},
): PlannedReminder[] {
  const out: PlannedReminder[] = [];

  if (opts.chargeAt) {
    const charge = new Date(opts.chargeAt);
    if (!Number.isNaN(charge.getTime())) {
      const when = new Date(
        charge.getFullYear(),
        charge.getMonth(),
        charge.getDate() - CHARGE_DAYS_BEFORE,
        HOUR,
        0,
        0,
      );
      if (when.getTime() > now.getTime()) {
        const day = `${charge.getMonth() + 1}월 ${charge.getDate()}일`;
        out.push({
          id: "charge:first",
          announcementId: "",
          kind: "charge",
          at: when,
          title: `${CHARGE_DAYS_BEFORE}일 뒤 첫 결제예요`,
          body: opts.priceText
            ? `무료 이용이 ${day}에 끝나고 ${opts.priceText}이 결제돼요. 계속 안 쓰실 거면 그전에 해지해 주세요.`
            : `무료 이용이 ${day}에 끝나요. 계속 안 쓰실 거면 그전에 해지해 주세요.`,
          channel: "billing",
        });
      }
    }
  }

  for (const it of items) {
    if (it.saved && it.apply_end) {
      const when = at(it.apply_end, DEADLINE_DAYS_BEFORE);
      if (when && when.getTime() > now.getTime()) {
        out.push({
          id: `deadline:${it.id}`,
          announcementId: it.id,
          kind: "deadline",
          at: when,
          title: "접수 마감 3일 전",
          body: `${it.title} 접수가 ${md(it.apply_end)}에 끝나요.`,
          channel: "deadline",
        });
      }
    }

    if (it.applied && it.winner_announce) {
      for (const before of ANNOUNCE_DAYS_BEFORE) {
        const when = at(it.winner_announce, before);
        if (!when || when.getTime() <= now.getTime()) continue;
        out.push({
          id: `announce:${it.id}:${before}`,
          announcementId: it.id,
          kind: "announce",
          at: when,
          title: before === 0 ? "오늘 당첨자 발표예요" : `당첨자 발표 ${before}일 전`,
          body:
            before === 0
              ? `${it.title} 당첨자 발표가 오늘이에요.`
              : `${it.title} 당첨자 발표가 ${md(it.winner_announce)}이에요.`,
          channel: "announce",
        });
      }
    }
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}
