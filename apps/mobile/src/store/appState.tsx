/**
 * 앱 상태. 프로필(민감)은 SecureStore에만 저장하고 서버로 보내지 않는다.
 * 구독 상태는 billing.ts 어댑터(지금은 로컬 목)로 바뀌고, 저장된 값은 불러올 때 만료 규칙으로 정리한다.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type PropsWithChildren } from "react";
import { AppState as AppLifecycle, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { withDerived } from "@/lib/onboarding";
import type { UserProfile } from "@housing/schema";
import { billing, canUseFirstMonthFree, normalizeSubscription, type Subscription } from "@/lib/billing";
import type { ChangeRecord } from "@/lib/changes";
import {
  addNotifications,
  fromChange,
  markAllRead,
  markRead,
  pruneNotifications,
  removeNotification,
  type AppNotification,
} from "@/lib/inbox";
import { emptySeen, markOpened, noteSeen, type SeenState } from "@/lib/unseen";
import { canOpenCost as canOpenCostRule, type Account } from "@/lib/access";
import { CANCELLED, type AuthProvider } from "@/lib/auth";
import { authConfigured, deleteAccountRemote, loadSession, recordConsentRemote, refreshIfNeeded, signInWith, signOutRemote } from "@/data/auth";
import { consentToSend, newConsent, type TermsConsent as TermsConsentValue } from "@/lib/consent";
import { initStoreBilling, linkStoreAccount, onStoreSubscriptionChange, readStoreSubscription, storeBillingConfigured } from "@/lib/billing-store";
import { canSend, type LocalReport } from "@/lib/reports";
import { fetchReportStatuses, remoteConfigured, sendIssueReport } from "@/data/remote";

export type { Subscription };
export type ThemePref = "system" | "light" | "dark";

export interface AppState {
  loaded: boolean;
  profile: UserProfile | null;
  onboarded: boolean;
  /**
   * 로그인 계정. 지금은 모의 값이고 실제 인증(Supabase Auth 카카오·Apple)은 M8에서 붙인다.
   * 프로필(소득·자산)은 로그인 뒤에도 기기에만 둔다 — 계정은 구독 상태만 들고 있는다.
   */
  account: Account | null;
  saved: string[];
  /** "이 공고에 신청했어요"로 표시한 공고. 당첨자 발표 알림 대상 (무료) */
  applied: string[];
  subscription: Subscription;
  themePref: ThemePref;
  /** 마감 알림·신규 공고 푸시 켬 (권한 허용 뒤에만 true) */
  notifications: boolean;
  pushToken: string | null;
  /** "이 숫자 이상해요" 신고. 기기에 먼저 쌓고 보낼 수 있을 때 보낸다 */
  reports: LocalReport[];
  /** 관심 공고에서 값이 바뀐 기록. 공고를 열면 seen 처리한다 */
  changes: ChangeRecord[];
  /**
   * 알림 이력 (lib/inbox.ts). 푸시는 한 번 뜨고 사라지므로 앱 안에 남긴다.
   * 90일이 지난 것은 불러올 때 버린다.
   */
  inbox: AppNotification[];
  /** 목록에 떴던 공고와 아직 안 연 새 공고 (lib/unseen.ts) */
  seen: SeenState;
}

type Action =
  | { type: "hydrate"; state: Partial<AppState> }
  | { type: "setProfile"; profile: UserProfile; onboarded?: boolean }
  | { type: "signIn"; account: Account }
  | { type: "signOut" }
  | { type: "agreeTerms"; consent: TermsConsentValue }
  | { type: "consentSent"; termsVersion: string }
  | { type: "toggleSaved"; id: string }
  | { type: "toggleApplied"; id: string }
  | { type: "setSubscription"; subscription: Subscription }
  | { type: "setTheme"; pref: ThemePref }
  | { type: "setNotifications"; on: boolean; pushToken?: string | null }
  | { type: "addReport"; report: LocalReport }
  | { type: "mergeReports"; reports: LocalReport[] }
  | { type: "addChanges"; records: ChangeRecord[] }
  | { type: "addNotifications"; items: AppNotification[] }
  | { type: "readNotification"; id: string }
  | { type: "readAllNotifications" }
  | { type: "removeNotification"; id: string }
  | { type: "seeChange"; announcementId: string }
  | { type: "noteSeen"; ids: string[] }
  | { type: "openAnnouncement"; id: string }
  | { type: "reset" };

const initial: AppState = {
  loaded: false,
  profile: null,
  onboarded: false,
  account: null,
  saved: [],
  applied: [],
  subscription: { status: "none" },
  themePref: "system",
  notifications: false,
  pushToken: null,
  reports: [],
  changes: [],
  inbox: [],
  seen: emptySeen,
};

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case "hydrate":
      return {
        ...s,
        ...a.state,
        subscription: normalizeSubscription(a.state.subscription ?? s.subscription),
        // 90일이 지난 알림은 불러올 때 버린다. 지우는 시점을 한 곳으로 모아 둔다.
        inbox: pruneNotifications(a.state.inbox ?? s.inbox),
        loaded: true,
      };
    case "setProfile":
      return { ...s, profile: withDerived(a.profile), onboarded: a.onboarded ?? s.onboarded };
    case "signIn":
      return { ...s, account: a.account };
    case "agreeTerms":
      return s.account ? { ...s, account: { ...s.account, consent: a.consent } } : s;
    case "consentSent":
      return s.account?.consent?.termsVersion === a.termsVersion ? { ...s, account: { ...s.account, consent: { ...s.account.consent, sent: true } } } : s;
    case "signOut":
      // 프로필·저장 목록은 기기에 남긴다. 로그아웃이 입력한 걸 지우는 일이 되면 안 된다.
      return { ...s, account: null };
    case "toggleSaved":
      return { ...s, saved: s.saved.includes(a.id) ? s.saved.filter((x) => x !== a.id) : [...s.saved, a.id] };
    case "toggleApplied":
      return { ...s, applied: s.applied.includes(a.id) ? s.applied.filter((x) => x !== a.id) : [...s.applied, a.id] };
    case "setSubscription": {
      // 첫 달 무료는 한 번뿐이다. 어느 경로로 구독을 바꾸든 여기서 기록을 지킨다 —
      // 호출부마다 챙기게 두면 한 군데만 빠져도 무료 달이 다시 생긴다.
      const next = normalizeSubscription(a.subscription);
      const firstMonthUsedAt = s.subscription.firstMonthUsedAt ?? (next.status === "trial" ? new Date().toISOString() : undefined);
      return { ...s, subscription: firstMonthUsedAt ? { ...next, firstMonthUsedAt } : next };
    }
    case "setTheme":
      return { ...s, themePref: a.pref };
    case "setNotifications":
      return { ...s, notifications: a.on, pushToken: a.pushToken === undefined ? s.pushToken : a.pushToken };
    case "addReport":
      return { ...s, reports: [a.report, ...s.reports] };
    case "addChanges": {
      // 같은 공고의 이전 기록은 새 것으로 덮는다. 쌓아 두면 "무엇이 최신인지"를 사용자가 판단해야 한다.
      const ids = new Set(a.records.map((r) => r.announcementId));
      return {
        ...s,
        changes: [...a.records, ...s.changes.filter((c) => !ids.has(c.announcementId))].slice(0, 30),
        // 변경 기록은 덮어쓰지만 알림 이력은 남긴다. "언제 무엇이 바뀌었나"를 되짚을 수 있어야 한다.
        inbox: addNotifications(s.inbox, a.records.map(fromChange)),
      };
    }
    case "addNotifications":
      return { ...s, inbox: addNotifications(s.inbox, a.items) };
    case "readNotification":
      return { ...s, inbox: markRead(s.inbox, a.id) };
    case "readAllNotifications":
      return { ...s, inbox: markAllRead(s.inbox) };
    case "removeNotification":
      return { ...s, inbox: removeNotification(s.inbox, a.id) };
    case "seeChange":
      return { ...s, changes: s.changes.map((c) => (c.announcementId === a.announcementId ? { ...c, seen: true } : c)) };
    case "noteSeen": {
      const { next } = noteSeen(s.seen, a.ids);
      return next === s.seen ? s : { ...s, seen: next };
    }
    case "openAnnouncement": {
      const next = markOpened(s.seen, a.id);
      return next === s.seen ? s : { ...s, seen: next };
    }
    case "mergeReports": {
      const byId = new Map(a.reports.map((r) => [r.id, r]));
      return { ...s, reports: s.reports.map((r) => byId.get(r.id) ?? r) };
    }
    case "reset":
      // "처음부터"가 무료 달을 다시 주는 문이 되면 안 된다. 첫 달을 썼다는 사실만 남긴다.
      return {
        ...initial,
        subscription: s.subscription.firstMonthUsedAt ? { status: "none", firstMonthUsedAt: s.subscription.firstMonthUsedAt } : initial.subscription,
        loaded: true,
      };
  }
}

/**
 * firstMonth를 meta와 따로 두는 이유: meta는 "모든 데이터 지우고 처음부터"에서 통째로 지워지고,
 * iOS는 SecureStore가 키체인을 쓰기 때문에 앱을 지워도 이 키가 남는다 (= 재설치로 무료 달이 다시 생기지 않는다).
 * Android는 재설치하면 사라지고, 웹은 사이트 데이터를 지우면 사라진다. 완전한 차단은 스토어·서버 몫이다.
 */
const KEYS = { profile: "profile.v1", meta: "meta.v1", firstMonth: "first-month.v1" } as const;

/**
 * 네이티브: SecureStore(암호화). 웹: 개발·시안 확인용으로만 쓰므로 localStorage.
 * 웹은 배포 대상이 아니다 — 민감 프로필은 실제 사용자 기기(네이티브)에서만 저장된다.
 */
const isWeb = Platform.OS === "web";

async function read(key: string): Promise<string | null> {
  try {
    if (isWeb) return globalThis.localStorage?.getItem(key) ?? null;
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}
async function write(key: string, value: string | null): Promise<void> {
  try {
    if (isWeb) {
      if (value === null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, value);
      return;
    }
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    /* 저장소가 없는 환경에서는 메모리만 */
  }
}

interface Ctx {
  state: AppState;
  setProfile: (profile: UserProfile, onboarded?: boolean) => void;
  /**
   * 제공자 로그인 → 계정 + 첫 달 0원 시작.
   * 사용자가 창을 닫으면 조용히 false를 준다 (실패 문구를 띄우지 않는다).
   * 실제로 실패하면 던진다 — 호출부가 `signInErrorText`로 옮겨 보여 준다.
   */
  /** 약관에 동의하고(만 14세 이상 확인 포함) 로그인한다. 동의는 계정에 붙는다 */
  signIn: (provider: AuthProvider) => Promise<boolean>;
  /** 약관이 바뀌었거나 동의 기록이 없는 계정이 지금 판에 동의한다 */
  agreeTerms: () => void;
  /**
   * 개발 빌드 전용 우회. 제공자를 아직 안 켠 동안에도 게이트 뒤를 볼 수 있어야 한다.
   * 배포 빌드에서는 아무 일도 하지 않는다 — 여기가 유료선이라 실수로 열리면 제품이 없어진다.
   */
  devSignIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * 계정 삭제 (App Store 5.1.1(v)). 서버 계정과 기기의 모든 입력을 함께 지운다.
   * 서버 삭제가 실패하면 던진다 — 기기만 비우고 끝내면 지워진 줄 알고 떠나는데 계정은 남는다.
   */
  deleteAccount: () => Promise<void>;
  toggleSaved: (id: string) => void;
  toggleApplied: (id: string) => void;
  setSubscription: (subscription: Subscription) => void;
  setTheme: (pref: ThemePref) => void;
  setNotifications: (on: boolean, pushToken?: string | null) => void;
  addReport: (report: LocalReport) => void;
  addChanges: (records: ChangeRecord[]) => void;
  /** 마감·새 공고 알림을 이력에 넣는다. 이미 있는 것은 무시된다 (lib/inbox.ts) */
  addNotifications: (items: AppNotification[]) => void;
  readNotification: (id: string) => void;
  readAllNotifications: () => void;
  removeNotification: (id: string) => void;
  seeChange: (announcementId: string) => void;
  /** 목록이 바뀔 때 부른다. 처음 켠 기기에서는 그 목록이 기준선이 되고 아무것도 새 것이 아니다 */
  noteSeen: (ids: string[]) => void;
  /** 상세를 열면 "새 공고" 표시를 지운다 */
  openAnnouncement: (id: string) => void;
  reset: () => void;
}

const AppStateContext = createContext<Ctx | null>(null);

export function AppStateProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(reducer, initial);

  useEffect(() => {
    (async () => {
      const [profile, meta, firstMonth] = await Promise.all([read(KEYS.profile), read(KEYS.meta), read(KEYS.firstMonth)]);
      const parsedMeta = meta ? (JSON.parse(meta) as Partial<AppState>) : {};
      // 이 필드가 생기기 전에 깔린 기기에는 seen이 없다. 그 경우 다음 목록이 기준선이 된다.
      // 이 필드가 생기기 전에 깔린 기기에는 applied가 없다
      if (!parsedMeta.applied) parsedMeta.applied = [];
      if (!parsedMeta.seen) parsedMeta.seen = emptySeen;
      // meta가 지워졌어도 첫 달 기록이 남아 있으면 되살린다
      if (firstMonth) {
        const sub = parsedMeta.subscription ?? { status: "none" as const };
        parsedMeta.subscription = { ...sub, firstMonthUsedAt: sub.firstMonthUsedAt ?? firstMonth };
      }
      dispatch({ type: "hydrate", state: { ...parsedMeta, profile: profile ? (JSON.parse(profile) as UserProfile) : null } });
    })();
  }, []);

  useEffect(() => {
    if (!state.loaded) return;
    void write(KEYS.profile, state.profile ? JSON.stringify(state.profile) : null);
    const { onboarded, account, saved, applied, subscription, themePref, notifications, pushToken, reports, changes, seen, inbox } = state;
    void write(KEYS.meta, JSON.stringify({ onboarded, account, saved, applied, subscription, themePref, notifications, pushToken, reports, changes, seen, inbox }));
    // 한 번 쓰면 지우지 않는다 — 여기서 null을 쓰면 위 주석의 보호가 통째로 없어진다
    if (subscription.firstMonthUsedAt) void write(KEYS.firstMonth, subscription.firstMonthUsedAt);
  }, [state]);

  // 켤 때 토큰이 아직 살아 있는지 본다. 저장된 계정만 믿으면 서버에서 지워진 계정으로도
  // 계속 로그인 상태가 된다. 갱신이 안 되면 로그아웃시킨다 — 조용히 401만 나는 것보다 낫다.
  const checkedSession = useRef(false);
  useEffect(() => {
    if (!state.loaded || !state.account || !authConfigured || checkedSession.current) return;
    checkedSession.current = true;
    void (async () => {
      const stored = await loadSession();
      if (!stored || !(await refreshIfNeeded(stored))) dispatch({ type: "signOut" });
      // 앱을 다시 켰을 때도 계정을 스토어에 다시 묶는다. 한 번만으로는 기기를 바꾼 경우가 빠진다.
      else void linkStoreAccount(state.account!.id);
    })();
  }, [state.loaded, state.account]);

  // 결제 SDK는 켤 때 한 번. 키가 없으면 아무것도 하지 않는다 (개발 빌드에서는 목으로 돈다)
  useEffect(() => {
    initStoreBilling();
  }, []);

  // 구독 상태는 스토어가 진실 원본이다. 켤 때·앱으로 돌아올 때·SDK가 알릴 때 다시 맞춘다
  // (billing-store.ts의 readStoreSubscription). 안 그러면 갱신한 사람이 잠기고, 해지한 사람에게 결제 고지가 간다.
  const subscriptionRef = useRef(state.subscription);
  subscriptionRef.current = state.subscription;
  useEffect(() => {
    if (!state.loaded || !storeBillingConfigured) return;
    const apply = (subscription: Subscription) => dispatch({ type: "setSubscription", subscription });
    const sync = () => void readStoreSubscription(subscriptionRef.current).then((s) => s && apply(s));
    sync();
    const off = onStoreSubscriptionChange(() => subscriptionRef.current, apply);
    const lifecycle = AppLifecycle.addEventListener("change", (s) => s === "active" && sync());
    return () => {
      off();
      lifecycle.remove();
    };
  }, [state.loaded]);

  // 약관 동의를 계정에 기록한다 (terms_consents). 로그인 직후 한 번, 실패했으면 다음 실행 때 다시.
  // 모의 계정(서버 설정 없음)은 보낼 곳이 없어 기기에만 남는다.
  const sendingConsent = useRef(false);
  useEffect(() => {
    const pending = consentToSend(state.account);
    if (!state.loaded || !pending || !authConfigured || sendingConsent.current) return;
    sendingConsent.current = true;
    void (async () => {
      try {
        const stored = await loadSession();
        const session = stored ? await refreshIfNeeded(stored) : null;
        if (!session) return;
        await recordConsentRemote(session, pending.termsVersion);
        dispatch({ type: "consentSent", termsVersion: pending.termsVersion });
      } catch {
        // 못 보내도 동의 자체는 기기에 있다. 다음 실행 때 다시 보낸다.
      } finally {
        sendingConsent.current = false;
      }
    })();
  }, [state.loaded, state.account]);

  // 신고 동기화: 못 보낸 건 보내고, 보낸 건의 처리 결과를 받아 "확인 중"을 끝맺는다.
  // Supabase가 없으면 기기에 그대로 둔다 — 버튼은 동작하고, 연결되면 그때 올라간다.
  const syncing = useRef(false);
  useEffect(() => {
    if (!state.loaded || !remoteConfigured || syncing.current) return;
    const unsent = state.reports.filter((r) => !r.sent && canSend(r));
    const waiting = state.reports.filter((r) => r.sent && r.status === "OPEN");
    if (unsent.length === 0 && waiting.length === 0) return;
    syncing.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const updated: LocalReport[] = [];
        for (const r of unsent) {
          const ok = await sendIssueReport(r).catch(() => false);
          if (ok) updated.push({ ...r, sent: true });
        }
        const sent = [...waiting, ...updated];
        const statuses = await fetchReportStatuses(sent.map((r) => r.id)).catch(() => []);
        for (const st of statuses) {
          const base = updated.find((u) => u.id === st.client_id) ?? state.reports.find((r) => r.id === st.client_id);
          if (!base) continue;
          const resolution = st.resolution ?? undefined;
          if (base.status === st.status && base.resolution === resolution) continue;
          const merged: LocalReport = { ...base, sent: true, status: st.status, resolution, resolvedAt: st.resolved_at ?? undefined };
          const at = updated.findIndex((u) => u.id === merged.id);
          if (at >= 0) updated[at] = merged;
          else updated.push(merged);
        }
        if (!cancelled && updated.length > 0) dispatch({ type: "mergeReports", reports: updated });
      } finally {
        syncing.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.loaded, state.reports]);

  const value = useMemo<Ctx>(
    () => ({
      state,
      setProfile: (profile, onboarded) => dispatch({ type: "setProfile", profile, onboarded }),
      // 로그인하면 첫 달 무료를 아직 안 썼을 때만 시작한다.
      // 첫 달만 무료다 — 로그아웃 후 다시 들어와도 또 주지 않는다 (setSubscription이 지킨다).
      //
      // Supabase 설정이 없으면 개발 빌드에서만 모의 계정으로 넘어간다. 배포 빌드에서
      // 조용히 모의 계정을 내주면 유료선이 통째로 뚫린다 — 그래서 __DEV__로 못을 박는다.
      signIn: async (provider) => {
        let account: Account;
        if (authConfigured) {
          try {
            const session = await signInWith(provider);
            account = { id: session.userId, provider, signedInAt: new Date().toISOString(), ...(session.email ? { email: session.email } : {}), consent: newConsent() };
          } catch (e) {
            if (e instanceof Error && e.message === CANCELLED) return false;
            throw e;
          }
        } else if (__DEV__) {
          account = { id: `mock-${provider}-${Date.now()}`, provider, signedInAt: new Date().toISOString(), consent: newConsent() };
        } else {
          throw new Error("로그인 설정이 없어요");
        }
        dispatch({ type: "signIn", account });
        // 구독을 계정에 묶는다. 안 하면 기기마다 익명 id가 생겨 아이폰에서 산 구독이
        // 안드로이드에서 안 보인다.
        void linkStoreAccount(account.id);
        /*
         * **로그인이 결제를 시작하지 않는다.**
         *
         * 전에는 여기서 바로 `billing.startTrial()`을 불렀다. 목 어댑터로는 화면에 아무 일도
         * 일어나지 않아 괜찮아 보였는데, RevenueCat을 끼우는 순간 그게 **실제 구매 시트**가 된다.
         * 공고를 보려고 로그인했는데 결제창이 뜨는 앱이 된다.
         *
         * 그리고 그건 우리가 정한 선과도 어긋난다 — 조건 매칭은 무료다.
         * 체험은 유료 기능(주거비 계산)을 처음 열 때 구독 시트에서 시작한다.
         */
        return true;
      },
      devSignIn: async () => {
        if (!__DEV__) return;
        dispatch({ type: "signIn", account: { id: `dev-${Date.now()}`, provider: "google", signedInAt: new Date().toISOString(), consent: newConsent() } });
        if (canUseFirstMonthFree(state.subscription)) {
          dispatch({ type: "setSubscription", subscription: await billing.startTrial() });
        }
      },
      // 토큰부터 지우고 상태를 바꾼다. 순서가 뒤집히면 화면은 로그아웃인데 키체인에 토큰이 남는다.
      signOut: async () => {
        await signOutRemote(await loadSession());
        await linkStoreAccount(null);
        dispatch({ type: "signOut" });
      },
      // 서버를 먼저 지운다. 여기서 실패하면 기기 데이터는 건드리지 않고 던진다 —
      // 계정은 남았는데 입력만 사라지는 것이 가장 나쁜 결말이다.
      deleteAccount: async () => {
        const session = await loadSession();
        if (session) await deleteAccountRemote(session);
        else if (authConfigured && !__DEV__) throw new Error("로그인이 만료됐어요. 다시 로그인한 뒤 삭제해 주세요.");
        dispatch({ type: "reset" });
      },
      agreeTerms: () => dispatch({ type: "agreeTerms", consent: newConsent() }),
      toggleSaved: (id) => dispatch({ type: "toggleSaved", id }),
      toggleApplied: (id) => dispatch({ type: "toggleApplied", id }),
      setSubscription: (subscription) => dispatch({ type: "setSubscription", subscription }),
      setTheme: (pref) => dispatch({ type: "setTheme", pref }),
      setNotifications: (on, pushToken) => dispatch({ type: "setNotifications", on, pushToken }),
      addReport: (report) => dispatch({ type: "addReport", report }),
      addChanges: (records) => dispatch({ type: "addChanges", records }),
      addNotifications: (items) => dispatch({ type: "addNotifications", items }),
      readNotification: (id) => dispatch({ type: "readNotification", id }),
      readAllNotifications: () => dispatch({ type: "readAllNotifications" }),
      removeNotification: (id) => dispatch({ type: "removeNotification", id }),
      seeChange: (announcementId) => dispatch({ type: "seeChange", announcementId }),
      noteSeen: (ids) => dispatch({ type: "noteSeen", ids }),
      openAnnouncement: (id) => dispatch({ type: "openAnnouncement", id }),
      reset: () => dispatch({ type: "reset" }),
    }),
    [state],
  );
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): Ctx {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("AppStateProvider 밖에서 useAppState를 호출했다");
  return ctx;
}

/** 계산 화면을 열 수 있는가. 규칙은 lib/access.ts 한 곳에 있고 여기서는 스토어 모양으로 넘겨 줄 뿐이다. */
export const canOpenCost = (state: AppState): boolean => canOpenCostRule(state);

export const useCanOpenCost = (): boolean => canOpenCost(useAppState().state);
