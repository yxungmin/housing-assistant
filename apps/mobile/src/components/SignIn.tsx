import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Icon } from "./icon";
import { consentReady, type ConsentValue, type LegalKey } from "@/lib/consent";
import { PROVIDER_LABEL, shownProviders, signInErrorText, type AuthProvider } from "@/lib/auth";
import { useAppState } from "@/store/appState";
import { useTheme } from "@/theme/ThemeProvider";
import { fonts, iconSize, radius } from "@/theme/tokens";
import { BottomSheet, Sub, T } from "./ui";

/**
 * 로그인 버튼들.
 *
 * 제공자 순서에는 이유가 있다. 20~40대 한국 사용자에게 기본값은 카카오라 맨 위에 둔다.
 * iOS에서는 Apple을 **같은 크기로** 바로 아래 둔다 — App Store 4.8이 소셜 로그인을 쓰면
 * "동등한" 다른 수단을 함께 제공하라고 요구한다. 작게 깔아 두면 그 조항을 어기는 것이고,
 * 실제로 그 이유로 리젝된다.
 *
 * 사용자가 창을 닫은 것은 실패가 아니다 (`signInErrorText`가 null을 준다) — 아무 말도 하지 않는다.
 */
export function SignInButtons({ onDone, onOpenDoc }: { onDone?: () => void; onOpenDoc?: (doc: LegalKey) => void }) {
  const { signIn, devSignIn } = useAppState();
  const [busy, setBusy] = useState<AuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 로그인이 곧 계정 생성이라 여기서 약관 동의를 받는다 (lib/consent.ts)
  const [checks, setChecks] = useState<ConsentValue>({ age: false, terms: false });
  const agreed = consentReady(checks);

  const providers = shownProviders(Platform.OS);

  const press = (provider: AuthProvider) => {
    if (busy || !agreed) return;
    setBusy(provider);
    setError(null);
    void signIn(provider)
      .then((ok) => {
        if (ok) onDone?.();
      })
      .catch((e: unknown) => setError(signInErrorText(e)))
      .finally(() => setBusy(null));
  };

  return (
    <View style={{ gap: 10 }}>
      <ConsentChecks value={checks} onChange={setChecks} onOpenDoc={onOpenDoc} />
      {providers.map((p) => (
        <BrandButton key={p} provider={p} busy={busy === p} disabled={!agreed || (!!busy && busy !== p)} onPress={() => press(p)} />
      ))}
      {!agreed ? (
        <Sub tone="3" variant="caption" style={{ textAlign: "center" }}>위 두 가지를 확인하면 로그인할 수 있어요</Sub>
      ) : null}
      {error ? (
        <Sub tone="3" variant="caption" style={{ textAlign: "center" }}>{error}</Sub>
      ) : null}
      {/* 개발 빌드에서만. 제공자를 아직 안 켠 동안에도 게이트 뒤를 확인할 수 있어야 한다.
          __DEV__는 배포 빌드에서 false라 이 줄은 번들에서 사라진다. */}
      {__DEV__ ? (
        <Pressable
          onPress={() => agreed && void devSignIn().then(() => onDone?.())}
          disabled={!agreed}
          accessibilityRole="button"
          style={{ paddingVertical: 12, alignItems: "center" }}
        >
          <Sub tone="3" variant="caption">개발용: 로그인 없이 보기</Sub>
        </Pressable>
      ) : null}
    </View>
  );
}

/** 카카오·Apple은 브랜드 가이드가 면 색과 글자색을 정해 둔다. 임의로 칠하면 심사에서 걸린다. */
const BRAND: Record<AuthProvider, { bg: string; fg: string; border?: string }> = {
  kakao: { bg: "#FEE500", fg: "#191600" },
  apple: { bg: "#000000", fg: "#FFFFFF" },
  google: { bg: "#FFFFFF", fg: "#1F1F1F", border: "#DADCE0" },
};

function BrandButton({
  provider,
  busy,
  disabled,
  onPress,
}: {
  provider: AuthProvider;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { scheme } = useTheme();
  const b = BRAND[provider];
  // Apple 버튼은 다크 모드에서 검정 면이 배경에 묻는다. 가이드가 흰 면도 허용하므로 뒤집는다.
  const dark = scheme === "dark" && provider === "apple";
  const bg = dark ? "#FFFFFF" : b.bg;
  const fg = dark ? "#000000" : b.fg;
  const label = provider === "apple" ? "Apple로 로그인" : `${PROVIDER_LABEL[provider]}로 로그인`;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      style={({ pressed }) => ({
        height: 54,
        borderRadius: radius.md,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg,
        borderWidth: b.border ? 1 : 0,
        borderColor: b.border,
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
      })}
    >
      {busy ? <ActivityIndicator color={fg} /> : <T variant="bodyMedium" style={{ fontFamily: fonts.bold, color: fg }}>{label}</T>}
    </Pressable>
  );
}

/**
 * 로그인 시트. 계산을 열려다 막힌 자리에서 쓴다 —
 * 화면을 통째로 갈아치우면 사용자가 보던 공고를 잃는다.
 */
export function SignInSheet({ visible, onClose, reason }: { visible: boolean; onClose: () => void; reason?: string }) {
  const router = useRouter();
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ gap: 16 }}>
        <View style={{ gap: 6 }}>
          <T variant="title">로그인하고 이어서 보기</T>
          <Sub variant="body">{reason ?? "맞춤 공고는 내 조건으로 계산해서 보여드려요. 로그인하면 보던 화면으로 바로 돌아와요."}</Sub>
        </View>
        {/* 시트(모달) 위에서는 문서가 가려진다. 닫고 간다 */}
        <SignInButtons onDone={onClose} onOpenDoc={(doc) => { onClose(); router.push(`/legal/${doc}`); }} />
        <Sub tone="3" variant="caption" style={{ textAlign: "center" }}>
          소득·자산처럼 적어 두신 값은 로그인해도 서버로 보내지 않고 이 기기에만 둬요.
        </Sub>
      </View>
    </BottomSheet>
  );
}


/**
 * 필수 확인 둘 + 처리방침 알림 한 줄.
 *
 * 개인정보는 체크박스가 아니다 — 계약 이행에 필요한 것만 처리하므로 동의가 아니라 알림이다(lib/consent.ts).
 * "전체 동의"도 두지 않는다. 필수 둘을 한 번에 누르게 하면 무엇에 동의했는지 읽지 않게 된다.
 * 안 고른 칸에는 체크를 그리지 않는다 — 체크는 "됐다"는 뜻이다(온보딩 선택지와 같은 규칙).
 */
export function ConsentChecks({ value, onChange, onOpenDoc }: { value: ConsentValue; onChange: (v: ConsentValue) => void; onOpenDoc?: (doc: LegalKey) => void }) {
  const router = useRouter();
  const open = (doc: LegalKey) => (onOpenDoc ? onOpenDoc(doc) : router.push(`/legal/${doc}`));
  return (
    <View style={{ gap: 2, paddingBottom: 6 }}>
      <ConsentRow on={value.age} label="(필수) 만 14세 이상이에요" onPress={() => onChange({ ...value, age: !value.age })} />
      <ConsentRow on={value.terms} label="(필수) 이용약관에 동의해요" onPress={() => onChange({ ...value, terms: !value.terms })} onView={() => open("terms")} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingLeft: 34, gap: 8 }}>
        <Sub tone="3" variant="caption" style={{ flex: 1 }}>개인정보는 처리방침에 따라 처리돼요.</Sub>
        <DocLink label="처리방침 보기" onPress={() => open("privacy")} />
      </View>
    </View>
  );
}

function ConsentRow({ on, label, onPress, onView }: { on: boolean; label: string; onPress: () => void; onView?: () => void }) {
  const { colors } = useTheme();
  return (
    // 줄과 "보기"를 나란히 둔다. 줄 안에 넣으면 버튼 속의 버튼이 된다.
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        accessibilityLabel={label}
        style={({ pressed }) => ({ flex: 1, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 7,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: on ? colors.primary : "transparent",
            borderWidth: on ? 0 : 1.5,
            borderColor: colors.text4,
          }}
        >
          {on ? <Icon name="check" size={iconSize.md} color={colors.onPrimary} /> : null}
        </View>
        <T variant="body" style={{ flex: 1 }}>{label}</T>
      </Pressable>
      {onView ? <DocLink label="보기" onPress={onView} /> : null}
    </View>
  );
}

function DocLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
      <T variant="small" color={colors.text3} style={{ textDecorationLine: "underline" }}>{label}</T>
    </Pressable>
  );
}
