import { useState } from "react";
import { useRouter } from "expo-router";
import { Linking, Platform, Pressable, View } from "react-native";
import { CoffeeMark } from "./CoffeeMark";
import { Icon } from "./icon";
import { BottomSheet, Card, PrimaryButton, Row, Sub, T, Tag } from "./ui";
import { billing, canUseFirstMonthFree, daysLeft, manageSubscriptionUrl, PRICE_KRW, TRIAL_DAYS } from "@/lib/billing";
import Constants from "expo-constants";
import { longDate } from "@/lib/format";
import { useAppState } from "@/store/appState";
import { useTheme } from "@/theme/ThemeProvider";

const price = `월 ${PRICE_KRW.toLocaleString("ko-KR")}원`;

/**
 * 구독 시트: 첫 무료 계산을 본 뒤 두 번째 공고에서 처음 뜬다.
 *  - 첫 달 무료를 아직 안 썼으면: 첫 달 0원으로 시작
 *  - 이미 썼으면(해지·만료 포함): 바로 월 결제. 첫 달만 무료다.
 * 결제는 billing 어댑터가 한다 (지금은 로컬 목 — 시트 하단에 표시).
 */
export function SubscriptionSheet({ visible, onClose, onStarted }: { visible: boolean; onClose: () => void; onStarted?: () => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  const { state, setSubscription } = useAppState();
  const [busy, setBusy] = useState(false);
  const expired = state.subscription.status === "expired";
  // 첫 달만 무료다. 해지했다 돌아와도 다시 주지 않는다.
  const freeMonth = canUseFirstMonthFree(state.subscription);

  const run = async (fn: () => Promise<typeof state.subscription | null>) => {
    setBusy(true);
    try {
      const next = await fn();
      if (next) {
        setSubscription(next);
        onStarted?.();
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {/* 값을 말로 설명하기 전에 한 번 보여 준다. 1,900원은 실제로 카페 아메리카노보다 싸다. */}
      <View style={{ alignItems: "center", gap: 6 }}>
        <CoffeeMark />
        <T variant="heading" style={{ textAlign: "center" }}>커피 한 잔이면 한 달이에요</T>
        <Sub variant="caption" tone="3" style={{ textAlign: "center" }}>
          {freeMonth ? `첫 달 0원 · 그 뒤로 ${price}` : `${price} · 언제든 해지`}
        </Sub>
      </View>
      <View style={{ gap: 8 }}>
        <T variant="title">{expired ? (freeMonth ? "구독이 끝났어요" : "첫 달 무료는 다 쓰셨어요") : "다른 공고의 주거비도\n계산해 볼까요?"}</T>
        <T variant="body" color={colors.text2}>
          {expired ? `이어서 계산하려면 ${price} 구독이 필요해요. 조건 확인과 공고 목록은 계속 무료예요.` : "공고 목록과 조건 확인은 계속 무료예요. 필요한 현금과 대출까지 계산하려면 구독이 필요해요."}
        </T>
      </View>
      <View style={{ gap: 12 }}>
        {["모든 공고의 필요 현금·월 주거비 계산", "보증금·월세 시나리오와 대출 상품 비교", "공고 값이 바뀌면 알림 · 바뀐 값으로 다시 계산"].map((b) => (
          <View key={b} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <Icon name="check" size={18} color={colors.primary} />
            <T variant="body">{b}</T>
          </View>
        ))}
      </View>
      <Card>
        <Row center>
          <View style={{ gap: 2 }}>
            <T variant="heading">{freeMonth ? `첫 ${TRIAL_DAYS}일 0원` : price}</T>
            <Sub>{freeMonth ? <>그 뒤로 <T variant="small" numeric style={{ fontSize: 15 }}>{price}</T> 자동 갱신</> : "매달 자동 갱신 · 언제든 해지"}</Sub>
          </View>
          <Tag tone="gray">언제든 해지</Tag>
        </Row>
      </Card>
      {/* 전자상거래법 제17조 제6항: 청약철회 제한 사유는 **구매 화면에** 표시해야 효력이 있다.
          아래에 작게 깔거나 약관 안에만 두면 제한이 아예 적용되지 않는다.
          동시에 App Store 3.1.2는 구매 버튼 바로 위에 가격·주기·갱신을 요구한다 — 같은 자리다. */}
      <Card tone="white" style={{ gap: 6 }}>
        <T variant="bodyMedium" style={{ fontSize: 14 }}>결제 전에 확인해 주세요</T>
        <Sub tone="3" variant="caption">
          {freeMonth
            ? `첫 ${TRIAL_DAYS}일은 0원이고, 그 뒤 ${price}이 매월 자동으로 결제돼요. 무료 기간에 해지하면 결제되지 않아요.`
            : `${price}이 매월 자동으로 결제돼요.`}
        </Sub>
        <Sub tone="3" variant="caption">
          결제일부터 7일 이내에 청약철회할 수 있어요. 다만 결제한 기간에 주거비 계산을 한 번이라도 사용하면 그 기간에 대해서는 청약철회가 제한돼요.
        </Sub>
        <Sub tone="3" variant="caption">해지는 스토어의 구독 관리 화면에서 할 수 있어요.</Sub>
      </Card>
      <PrimaryButton label={busy ? "처리 중" : freeMonth ? "첫 달 0원으로 시작" : "구독 시작"} disabled={busy} onPress={() => void run(() => (freeMonth ? billing.startTrial() : billing.purchase()))} />
      <Pressable onPress={() => void run(() => billing.restore())} accessibilityRole="button" style={{ alignItems: "center", paddingVertical: 4 }}>
        <T variant="small" color={colors.text3}>이미 구독했다면 구매 복원</T>
      </Pressable>
      {/* App Store 3.1.2는 구매 화면에 이용약관과 개인정보처리방침 링크를 함께 요구한다 */}
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 16 }}>
        <Pressable onPress={() => { onClose(); router.push("/legal/terms"); }} accessibilityRole="button" hitSlop={8}>
          <T variant="small" color={colors.text3} style={{ textDecorationLine: "underline" }}>이용약관</T>
        </Pressable>
        <Pressable onPress={() => { onClose(); router.push("/legal/privacy"); }} accessibilityRole="button" hitSlop={8}>
          <T variant="small" color={colors.text3} style={{ textDecorationLine: "underline" }}>개인정보처리방침</T>
        </Pressable>
      </View>
      <Sub tone="3" variant="caption" style={{ textAlign: "center" }}>
        {billing.isMock ? "개발 빌드: 결제 없이 기기 상태만 바뀝니다" : "스토어 결제로 진행돼요"}
      </Sub>
    </BottomSheet>
  );
}

/** 내 정보 → 구독 관리: 상태·만료일, 복원, 갱신 해지 */
export function SubscriptionManageSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const { state, setSubscription } = useAppState();
  const sub = state.subscription;
  const [msg, setMsg] = useState<string | null>(null);
  const left = daysLeft(sub);
  const label = { none: "미구독", trial: "첫 달 무료 이용 중", active: "구독 중", expired: "만료됨" }[sub.status];

  const restore = async () => {
    const r = await billing.restore();
    if (r) {
      setSubscription(r);
      setMsg("구독을 복원했어요.");
    } else setMsg("복원할 구매 내역이 없어요.");
  };
  /**
   * 해지는 스토어에서만 된다 (애플·구글 정책). 앱 상태만 바꾸고 "해지했어요"라고 하면
   * 사용자는 껐다고 믿고 다음 달에 또 결제된다 — 그때 우리가 할 해명이 없다.
   * 개발 빌드에서는 스토어가 없으니 목 어댑터로 흐름만 확인한다.
   */
  const openStore = async () => {
    if (billing.isMock) {
      setSubscription(await billing.cancel(sub));
      setMsg("개발 빌드라 기기 상태만 바꿨어요. 실제로는 스토어 화면이 열려요.");
      return;
    }
    const pkg = Constants.expoConfig?.android?.package;
    const ok = await Linking.openURL(manageSubscriptionUrl(Platform.OS, pkg)).then(
      () => true,
      () => false,
    );
    if (!ok) setMsg(Platform.OS === "ios" ? "설정 → Apple 계정 → 구독에서 해지할 수 있어요." : "Play 스토어 → 결제 및 구독 → 구독에서 해지할 수 있어요.");
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ gap: 8 }}>
        <T variant="title">구독 관리</T>
        <T variant="body" color={colors.text2}>{price} · {canUseFirstMonthFree(sub) ? `첫 ${TRIAL_DAYS}일 0원` : "첫 달 무료는 사용함"}</T>
      </View>
      <Card style={{ gap: 6 }}>
        <Row center>
          <T variant="heading">{label}</T>
          {sub.cancelled ? <Tag tone="gray">갱신 해지됨</Tag> : sub.status === "trial" || sub.status === "active" ? <Tag tone="primary" icon="check">이용 중</Tag> : null}
        </Row>
        {sub.expiresAt ? <Sub>{sub.status === "expired" ? "만료일" : sub.cancelled ? "이용 종료" : sub.status === "trial" ? "첫 달 종료" : "다음 결제"} {longDate(sub.expiresAt.slice(0, 10))}{left > 0 ? ` · ${left}일 남음` : ""}</Sub> : <Sub>공고 목록과 조건 확인은 무료예요. 자금 계산만 구독이 필요해요.</Sub>}
      </Card>
      {msg ? <Sub style={{ textAlign: "center" }}>{msg}</Sub> : null}
      <View style={{ gap: 10 }}>
        {(sub.status === "trial" || sub.status === "active") && !sub.cancelled ? (
          <PrimaryButton tone="soft" label={billing.isMock ? "갱신 해지" : "스토어에서 해지하기"} onPress={() => void openStore()} />
        ) : null}
        <PrimaryButton tone="soft" label="구매 복원" onPress={() => void restore()} />
      </View>
      {/* 해지는 앱 안에서 못 한다. 그러니 그 경로만큼은 어느 상태에서나 1탭 거리에 둔다 */}
      {!billing.isMock ? (
        <Pressable onPress={() => void openStore()} accessibilityRole="button" style={{ alignItems: "center", paddingVertical: 4 }}>
          <T variant="small" color={colors.text3}>스토어 구독 관리 화면 열기</T>
        </Pressable>
      ) : null}
      <Sub tone="3" variant="caption" style={{ textAlign: "center" }}>
        {billing.isMock ? "개발 빌드: 결제 없이 기기 상태만 바뀝니다" : "해지는 스토어에서만 할 수 있어요. 결제·환불도 스토어 정책을 따라요."}
      </Sub>
    </BottomSheet>
  );
}
