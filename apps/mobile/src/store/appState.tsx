/**
 * 앱 상태. 프로필(민감)은 SecureStore에만 저장하고 서버로 보내지 않는다.
 * 구독 상태는 V0.1 M8 전까지 로컬 목(mock)이다.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type PropsWithChildren } from "react";
import * as SecureStore from "expo-secure-store";
import type { UserProfile } from "@housing/schema";

export type ThemePref = "system" | "light" | "dark";

export interface Subscription {
  status: "none" | "trial" | "active" | "expired";
  expiresAt?: string; // ISO
}

export interface AppState {
  loaded: boolean;
  profile: UserProfile | null;
  onboarded: boolean;
  /** 첫 1건 무료 해제 (기기에만 기록) */
  freeUnlockId: string | null;
  saved: string[];
  subscription: Subscription;
  themePref: ThemePref;
}

type Action =
  | { type: "hydrate"; state: Partial<AppState> }
  | { type: "setProfile"; profile: UserProfile; onboarded?: boolean }
  | { type: "setFreeUnlock"; id: string }
  | { type: "toggleSaved"; id: string }
  | { type: "setSubscription"; subscription: Subscription }
  | { type: "setTheme"; pref: ThemePref }
  | { type: "reset" };

const initial: AppState = {
  loaded: false,
  profile: null,
  onboarded: false,
  freeUnlockId: null,
  saved: [],
  subscription: { status: "none" },
  themePref: "system",
};

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case "hydrate":
      return { ...s, ...a.state, loaded: true };
    case "setProfile":
      return { ...s, profile: a.profile, onboarded: a.onboarded ?? s.onboarded };
    case "setFreeUnlock":
      return s.freeUnlockId ? s : { ...s, freeUnlockId: a.id };
    case "toggleSaved":
      return { ...s, saved: s.saved.includes(a.id) ? s.saved.filter((x) => x !== a.id) : [...s.saved, a.id] };
    case "setSubscription":
      return { ...s, subscription: a.subscription };
    case "setTheme":
      return { ...s, themePref: a.pref };
    case "reset":
      return { ...initial, loaded: true };
  }
}

const KEYS = { profile: "profile.v1", meta: "meta.v1" } as const;

async function read(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}
async function write(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    /* 웹 등 SecureStore가 없는 환경에서는 메모리만 */
  }
}

interface Ctx {
  state: AppState;
  setProfile: (profile: UserProfile, onboarded?: boolean) => void;
  setFreeUnlock: (id: string) => void;
  toggleSaved: (id: string) => void;
  setSubscription: (subscription: Subscription) => void;
  setTheme: (pref: ThemePref) => void;
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
    const { onboarded, freeUnlockId, saved, subscription, themePref } = state;
    void write(KEYS.meta, JSON.stringify({ onboarded, freeUnlockId, saved, subscription, themePref }));
  }, [state]);

  const value = useMemo<Ctx>(
    () => ({
      state,
      setProfile: (profile, onboarded) => dispatch({ type: "setProfile", profile, onboarded }),
      setFreeUnlock: (id) => dispatch({ type: "setFreeUnlock", id }),
      toggleSaved: (id) => dispatch({ type: "toggleSaved", id }),
      setSubscription: (subscription) => dispatch({ type: "setSubscription", subscription }),
      setTheme: (pref) => dispatch({ type: "setTheme", pref }),
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

/** 계산 화면을 열 수 있는가: 첫 무료 1건 또는 체험·구독 중 */
export function canOpenCost(state: AppState, announcementId: string): boolean {
  if (state.freeUnlockId === announcementId) return true;
  if (state.subscription.status === "trial" || state.subscription.status === "active") {
    if (!state.subscription.expiresAt) return true;
    // 만료일 + 3일 유예 (오프라인 캐시 규칙)
    return Date.parse(state.subscription.expiresAt) + 3 * 86_400_000 > Date.now();
  }
  return false;
}

export const useCanOpenCost = (id: string) => {
  const { state } = useAppState();
  return useCallback(() => canOpenCost(state, id), [state, id])();
};
