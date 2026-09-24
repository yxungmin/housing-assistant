/**
 * 새 공고 푸시 — Expo Push API로 보낸다.
 *
 * 앱은 알림을 켤 때 토큰과 관심 지역·유형만 서버(push_subscriptions)에 남긴다 (프로필은 아니다).
 * 수집기가 새 공고를 **게시**하면 그 지역·유형을 구독한 토큰에 한 번 보낸다. 게시되지 않은 것(CONFLICT)은 보내지 않는다 —
 * 앱에서 열어도 조건이 없으면 알림이 거짓이 된다.
 *
 * 2026-09-24까지는 대상만 세고 보내지 않았다("TODO M7"). 앱 문구는 "새 공고 알림을 켜 두면 알려드려요"라고 약속하고 있었다.
 *
 * Expo Push API (https://docs.expo.dev/push-notifications/sending-notifications/):
 *   POST https://exp.host/--/api/v2/push/send  — 한 번에 100건까지, 응답은 건마다 ticket {status: ok|error, details?.error}
 *   details.error가 DeviceNotRegistered면 그 토큰은 죽은 것이다 — 지운다. 계속 보내면 Expo가 계정을 제한한다.
 * 보내기는 PUSH_ENABLED=true일 때만 (기본 꺼짐). 추출과 같은 이유 — 바깥으로 나가는 일은 명시적인 행동이어야 한다.
 */
import { resilientFetch } from "../http";

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
/** Expo가 한 요청에 받는 최대 건수 */
export const EXPO_BATCH = 100;

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: { announcementId: string; kind: "new" };
  /** 안드로이드 채널. 앱의 setNotificationChannelAsync("new")와 같아야 한다 — 없으면 안드로이드가 조용히 버린다 */
  channelId: "new";
  sound: "default";
}

export interface PushResult {
  sent: number;
  failed: number;
  /** 죽은 토큰 (DeviceNotRegistered). 부르는 쪽이 지운다 */
  dead: string[];
  errors: string[];
}

/** 새 공고 알림 한 통. 제목은 지역, 본문은 공고 제목 — 잠금화면에서 어디 공고인지 먼저 보인다 */
export function newAnnouncementMessage(to: string, a: { id: string; title: string; regionName: string }): PushMessage {
  return {
    to,
    title: `${a.regionName} 새 공고`,
    body: a.title,
    data: { announcementId: a.id, kind: "new" },
    channelId: "new",
    sound: "default",
  };
}

/** Expo 토큰 모양인가. 다른 문자열이 섰으면 Expo가 요청 전체를 거절한다 */
export const isExpoToken = (t: string): boolean => /^Expo(nent)?PushToken\[[^\]]+\]$/.test(t);

interface Ticket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

export async function sendExpoPush(messages: PushMessage[], opts: { fetchImpl?: typeof fetch; accessToken?: string } = {}): Promise<PushResult> {
  const fetchImpl = opts.fetchImpl ?? resilientFetch();
  const result: PushResult = { sent: 0, failed: 0, dead: [], errors: [] };
  const valid = messages.filter((m) => isExpoToken(m.to));
  result.dead.push(...messages.filter((m) => !isExpoToken(m.to)).map((m) => m.to));
  for (let i = 0; i < valid.length; i += EXPO_BATCH) {
    const batch = valid.slice(i, i + EXPO_BATCH);
    const res = await fetchImpl(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(opts.accessToken ? { authorization: `Bearer ${opts.accessToken}` } : {}),
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      result.failed += batch.length;
      result.errors.push(`HTTP ${res.status}`);
      continue;
    }
    const json = (await res.json()) as { data?: Ticket[]; errors?: { code?: string; message?: string }[] };
    if (json.errors?.length) {
      result.failed += batch.length;
      result.errors.push(...json.errors.map((e) => `${e.code ?? "?"}: ${e.message ?? ""}`));
      continue;
    }
    (json.data ?? []).forEach((t, k) => {
      if (t.status === "ok") result.sent++;
      else {
        result.failed++;
        if (t.details?.error === "DeviceNotRegistered") result.dead.push(batch[k]!.to);
        else result.errors.push(t.details?.error ?? t.message ?? "error");
      }
    });
  }
  return result;
}
