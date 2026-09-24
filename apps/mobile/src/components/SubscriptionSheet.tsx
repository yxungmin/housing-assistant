import { useState } from "react";
import { useRouter } from "expo-router";
import { Linking, Platform, Pressable, View } from "react-native";
import { CoffeeMark } from "./CoffeeMark";
import { Icon } from "./icon";
import { BottomSheet, Card, PrimaryButton, Row, Sub, T, Tag } from "./ui";
import { billing, billingHistoryUrl, canUseFirstMonthFree, daysLeft, manageSubscriptionUrl } from "@/lib/billing";
import { usePrice } from "@/data/price";
import Constants from "expo-constants";
import { longDate } from "@/lib/format";
import { useAppState } from "@/store/appState";
import { useTheme } from "@/theme/ThemeProvider";

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
  const price = usePrice().monthly;
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
      {/*
        **스크롤이 생기지 않게** 짠다. 구독 시트는 한 화면에 들어와야 한다 —
        스크롤이 생기면 구매 버튼이 접히고, 그 위에 있어야 할 고지도 같이 접힌다.

        그래서 값이 겹치는 것을 합쳤다. 전에는 가격 카드와 "결제 전에 확인해 주세요" 카드가
        따로 있으면서 둘 다 가격·자동갱신을 말했다. 한 블록이면 된다.

        뺄 수 없는 것: 구매 버튼 **바로 위**의 가격·주기·자동갱신·해지(App Store 3.1.2)와
        청약철회 제한 표시(전자상거래법 제17조 제6항 — 구매 화면에 없으면 제한이 아예 적용되지 않는다).
      */}
      <View style={{ alignItems: "center", gap: 6 }}>
        <CoffeeMark />
        <T variant="heading" style={{ textAlign: "center" }}>
          {/*
            제목은 무엇을 사는지를 말한다. 전에는 상태를 말했다("첫 달 무료는 다 쓰셨어요", "구독이 끝났어요") —
            사려는 순간에 "당신은 이미 혜택을 썼다"를 제일 크게 들려주는 셈이었다. 첫 달 0원 여부는 가격 칸이 말한다.
          */}
          커피 한 잔 값의 주거비 비서
        </T>
        <Sub variant="caption" tone="3" style={{ textAlign: "center" }}>
          {expired ? "다시 구독하면 모든 공고의 필요한 현금과 월 주거비를 계산해 드려요" : "필요한 현금과 월 주거비, 대출까지 계산해 드려요"}
        </Sub>
      </View>

      <View style={{ gap: 10 }}>
        {["모든 공고의 필요 현금·월 주거비", "내 예상 순위와 지난 회차 마감 순위 비교", "보증금·월세 조정과 대출 비교", "값이 바뀌면 알림 · 다시 계산"].map((b) => (
          <View key={b} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <Icon name="check" size={18} color={colors.primary} />
            <T variant="body">{b}</T>
          </View>
        ))}
      </View>

      {/*
        결제될 금액이 가장 크게 보여야 한다. 전에는 "첫 달 0원"이 제목이고 "월 1,900원"이 회색 각주였다 —
        무료 체험을 앞세우고 청구 금액을 흐리게 두는 구성은 App Store 3.1.2 심사에서 자주 반려된다.
        첫 달 0원은 옆 표시로 내린다. 거짓은 아니지만, 사람이 기억해야 하는 숫자는 매달 나갈 돈이다.
      */}
      <Card tone="white" style={{ gap: 6 }}>
        <Row center>
          <T variant="heading">{price}</T>
          {freeMonth ? <Tag tone="primary">첫 달 0원</Tag> : <Tag tone="gray">언제든 해지</Tag>}
        </Row>
        <Sub tone="3" variant="caption">
          {freeMonth ? "첫 달은 0원이고, 그 뒤 매월 자동으로 결제돼요. 무료 기간에 해지하면 결제되지 않아요." : "매월 자동으로 결제돼요."}
          {" 해지는 스토어에서 언제든 할 수 있어요."}
        </Sub>
        <Sub tone="3" variant="caption">
          결제일부터 7일 이내 청약철회할 수 있어요. 그 기간에 주거비 계산을 한 번이라도 쓰면 제한돼요.
        </Sub>
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
        {billing.isMock ? "개발 빌드: 결제 없이 기기 상태만 바뀌어요" : "스토어 결제로 진행돼요"}
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
  const { monthly: price, amount } = usePrice();
  const left = daysLeft(sub);
  const label = { none: "구독 전", trial: "첫 달 무료 이용 중", active: "구독 중", expired: "구독 종료" }[sub.status];

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
        {/* 체험 중인 사람에게 "첫 달 무료는 사용함"은 앞뒤가 안 맞았다. 구독 전일 때만 혜택을 말한다 */}
        <T variant="body" color={colors.text2}>{price} · {sub.status === "none" && canUseFirstMonthFree(sub) ? "첫 달 0원" : "매월 자동 결제"}</T>
      </View>
      <Card style={{ gap: 6 }}>
        <Row center>
          <T variant="heading">{label}</T>
          {sub.cancelled ? <Tag tone="gray">갱신 해지됨</Tag> : sub.status === "trial" || sub.status === "active" ? <Tag tone="primary" icon="check">이용 중</Tag> : null}
        </Row>
        {/* 체험·구독 중인 사람이 알아야 하는 것은 "언제, 얼마가 나가나"다. 날짜만 있고 금액이 없으면 반쪽이다 */}
        <Sub>{statusLine(sub, amount, left)}</Sub>
      </Card>
      {msg ? <Sub style={{ textAlign: "center" }}>{msg}</Sub> : null}
      <View style={{ gap: 10 }}>
        {(sub.status === "trial" || sub.status === "active") && !sub.cancelled ? (
          <PrimaryButton tone="soft" label={billing.isMock ? "갱신 해지" : "스토어에서 해지하기"} onPress={() => void openStore()} />
        ) : null}
        <PrimaryButton tone="soft" label="구매 복원" onPress={() => void restore()} />
      </View>
      {/* 결제를 스토어가 하니 영수증도 스토어에 있다. 앱이 그걸 알려 주지 않으면 "어디서 보죠?"로 문의가 온다 */}
      <Pressable onPress={() => void Linking.openURL(billingHistoryUrl(Platform.OS)).catch(() => setMsg(Platform.OS === "ios" ? "설정 → Apple 계정 → 미디어 및 구입 항목 → 구입 내역에서 볼 수 있어요." : "Play 스토어 → 결제 및 구독 → 예산 및 내역에서 볼 수 있어요."))} accessibilityRole="link" style={{ alignItems: "center", paddingVertical: 4 }}>
        <T variant="small" color={colors.text3}>결제 내역·영수증 보기 (스토어)</T>
      </Pressable>
      {/* 해지는 앱 안에서 못 한다. 그러니 그 경로만큼은 어느 상태에서나 1탭 거리에 둔다 */}
      {!billing.isMock ? (
        <Pressable onPress={() => void openStore()} accessibilityRole="button" style={{ alignItems: "center", paddingVertical: 4 }}>
          <T variant="small" color={colors.text3}>스토어 구독 관리 화면 열기</T>
        </Pressable>
      ) : null}
      <Sub tone="3" variant="caption" style={{ textAlign: "center" }}>
        {billing.isMock ? "개발 빌드: 결제 없이 기기 상태만 바뀌어요" : "해지는 스토어에서만 할 수 있어요. 결제·환불도 스토어 정책을 따라요."}
      </Sub>
    </BottomSheet>
  );
}

/** 구독 관리 시트의 상태 한 줄. 결제가 남아 있으면 날짜와 금액을 같이 적는다 */
function statusLine(sub: { status: string; expiresAt?: string; cancelled?: boolean }, amount: string, left: number): string {
  if (!sub.expiresAt) return "구독하면 필요한 현금과 월 주거비를 계산해 드려요.";
  const day = longDate(sub.expiresAt.slice(0, 10));
  const rest = left > 0 ? ` · ${left}일 남음` : "";
  if (sub.status === "expired") return `${day}에 끝났어요`;
  if (sub.cancelled) return `${day}까지 이용하고 더 결제되지 않아요${rest}`;
  if (sub.status === "trial") return `${day}에 ${amount}이 처음 결제돼요${rest}`;
  return `다음 결제 ${day} · ${amount}${rest}`;
}
