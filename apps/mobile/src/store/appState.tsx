/**
 * 앱 상태. 프로필(민감)은 SecureStore에만 저장하고 서버로 보내지 않는다.
 * 구독 상태는 billing.ts 어댑터(지금은 로컬 목)로 바뀌고, 저장된 값은 불러올 때 만료 규칙으로 정리한다.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type PropsWithChildren } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { UserProfile } from "@housing/schema";
import { hasAccess, normalizeSubscription, type Subscription } from "@/lib/billing";

export type { Subscription };
export type ThemePref = "system" | "light" | "dark";

export interface AppState {
  loaded: boolean;
  profile: UserProfile | null;
  onboarded: boolean;
  /** 첫 1건 무료 해제 (기기에만 기록) */
  freeUnlockId: string | null;
  saved: string[];
  subscription: Subscription;
  themePref: ThemePref;
  /** 마감 알림·신규 공고 푸시 켬 (권한 허용 뒤에만 true) */
  notifications: boolean;
  pushToken: string | null;
}

type Action =
  | { type: "hydrate"; state: Partial<AppState> }
  | { type: "setProfile"; profile: UserProfile; onboarded?: boolean }
  | { type: "setFreeUnlock"; id: string }
  | { type: "toggleSaved"; id: string }
  | { type: "setSubscription"; subscription: Subscription }
  | { type: "setTheme"; pref: ThemePref }
  | { type: "setNotifications"; on: boolean; pushToken?: string | null }
  | { type: "reset" };

const initial: AppState = {
  loaded: false,
  profile: null,
  onboarded: false,
  freeUnlockId: null,
  saved: [],
  subscription: { status: "none" },
  themePref: "system",
  notifications: false,
  pushToken: null,
};

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case "hydrate":
      return { ...s, ...a.state, subscription: normalizeSubscription(a.state.subscription ?? s.subscription), loaded: true };
    case "setProfile":
      return { ...s, profile: a.profile, onboarded: a.onboarded ?? s.onboarded };
    case "setFreeUnlock":
      return s.freeUnlockId ? s : { ...s, freeUnlockId: a.id };
    case "toggleSaved":
      return { ...s, saved: s.saved.includes(a.id) ? s.saved.filter((x) => x !== a.id) : [...s.saved, a.id] };
    case "setSubscription":
      return { ...s, subscription: normalizeSubscription(a.subscription) };
    case "setTheme":
      return { ...s, themePref: a.pref };
    case "setNotifications":
      return { ...s, notifications: a.on, pushToken: a.pushToken === undefined ? s.pushToken : a.pushToken };
    case "reset":
      return { ...initial, loaded: true };
  }
}

const KEYS = { profile: "profile.v1", meta: "meta.v1" } as const;

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
  setFreeUnlock: (id: string) => void;
  toggleSaved: (id: string) => void;
  setSubscription: (subscription: Subscription) => void;
  setTheme: (pref: ThemePref) => void;
  setNotifications: (on: boolean, pushToken?: string | null) => void;
  reset: () => void;
}

const AppStateContext = createContext<Ctx | null>(null);

export function AppStateProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(reducer, initial);

  useEffect(() => {
    (async () => {
      const [profile, meta] = await Promise.all([read(KEYS.profile), read(KEYS.meta)]);
      const parsedMeta = meta ? (JSON.parse(meta) as Partial<AppState>) : {};
      dispatch({ type: "hydrate", state: { ...parsedMeta, profile: profile ? (JSON.parse(profile) as UserProfile) : null } });
    })();
  }, []);

  useEffect(() => {
    if (!state.loaded) return;
    void write(KEYS.profile, state.profile ? JSON.stringify(state.profile) : null);
    const { onboarded, freeUnlockId, saved, subscription, themePref, notifications, pushToken } = state;
    void write(KEYS.meta, JSON.stringify({ onboarded, freeUnlockId, saved, subscription, themePref, notifications, pushToken }));
  }, [state]);

  const value = useMemo<Ctx>(
    () => ({
      state,
      setProfile: (profile, onboarded) => dispatch({ type: "setProfile", profile, onboarded }),
      setFreeUnlock: (id) => dispatch({ type: "setFreeUnlock", id }),
      toggleSaved: (id) => dispatch({ type: "toggleSaved", id }),
      setSubscription: (subscription) => dispatch({ type: "setSubscription", subscription }),
      setTheme: (pref) => dispatch({ type: "setTheme", pref }),
      setNotifications: (on, pushToken) => dispatch({ type: "setNotifications", on, pushToken }),
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

/** 계산 화면을 열 수 있는가: 첫 무료 1건 또는 체험·구독 중 (만료 후 3일 유예는 billing.ts) */
export function canOpenCost(state: AppState, announcementId: string): boolean {
  if (state.freeUnlockId === announcementId) return true;
  return hasAccess(state.subscription);
}

export const useCanOpenCost = (id: string) => {
  const { state } = useAppState();
  return useCallback(() => canOpenCost(state, id), [state, id])();
};
