import { createContext, useContext, useMemo, type PropsWithChildren } from "react";
import { useColorScheme } from "react-native";
import { dark, light, type Colors } from "./tokens";
import { useAppState } from "@/store/appState";

interface ThemeValue {
  colors: Colors;
  scheme: "light" | "dark";
}

const ThemeContext = createContext<ThemeValue>({ colors: light, scheme: "light" });

/** 시스템 설정을 따르되, 내 정보에서 고정할 수 있다 (문서: 디자인 원칙). */
export function ThemeProvider({ children }: PropsWithChildren) {
  const system = useColorScheme();
  const { state } = useAppState();
  const value = useMemo<ThemeValue>(() => {
    const scheme = state.themePref === "system" ? (system === "dark" ? "dark" : "light") : state.themePref;
    return { colors: scheme === "dark" ? dark : light, scheme };
  }, [system, state.themePref]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
