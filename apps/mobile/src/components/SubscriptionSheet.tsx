import { useState } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "./Icon";
import { BottomSheet, Card, PrimaryButton, Row, Sub, T, Tag } from "./ui";
import { billing, daysLeft, PRICE_KRW, TRIAL_DAYS } from "@/lib/billing";
import { longDate } from "@/lib/format";
import { useAppState } from "@/store/appState";
import { useTheme } from "@/theme/ThemeProvider";

const price = `월 ${PRICE_KRW.toLocaleString("ko-KR")}원`;

/**
 * 구독 시트: 첫 무료 계산을 본 뒤 두 번째 공고에서 처음 뜬다.
 *  - 체험 전(none): 7일 무료 체험 시작
 *  - 체험·구독 만료(expired): 바로 구독 시작
 * 결제는 billing 어댑터가 한다 (지금은 로컬 목 — 시트 하단에 표시).
 */
export function SubscriptionSheet({ visible, onClose, onStarted }: { visible: boolean; onClose: () => void; onStarted?: () => void }) {
  const { colors } = useTheme();
  const { state, setSubscription } = useAppState();
  const [busy, setBusy] = useState(false);
  const expired = state.subscription.status === "expired";

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
      <View style={{ gap: 8 }}>
        <T variant="title">{expired ? "무료 체험이 끝났어요" : "다른 공고의 주거비도\n계산해 볼까요?"}</T>
        <T variant="body" color={colors.text2}>
          {expired ? `이어서 계산하려면 ${price} 구독이 필요해요. 조건 확인과 공고 목록은 계속 무료예요.` : "공고 목록과 조건 확인은 계속 무료예요. 필요한 현금과 대출까지 계산하려면 구독이 필요해요."}
        </T>
      </View>
      <View style={{ gap: 12 }}>
        {["모든 공고의 필요 현금·월 주거비 계산", "보증금·월세 시나리오와 대출 상품 비교", "수정 공고가 나오면 자동 재계산"].map((b) => (
          <View key={b} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <Icon name="check" size={18} color={colors.primary} strokeWidth={3} />
            <T variant="body">{b}</T>
          </View>
        ))}
      </View>
      <Card>
        <Row center>
          <View style={{ gap: 2 }}>
            <T variant="heading">{expired ? price : `${TRIAL_DAYS}일 무료 체험`}</T>
            <Sub>{expired ? "매달 자동 갱신 · 언제든 해지" : <>체험이 끝나면 <T variant="small" numeric style={{ fontSize: 15 }}>{price}</T></>}</Sub>
          </View>
          <Tag tone="gray">언제든 해지</Tag>
        </Row>
      </Card>
      <PrimaryButton label={busy ? "처리 중" : expired ? "구독 시작" : "무료 체험 시작"} disabled={busy} onPress={() => void run(() => (expired ? billing.purchase() : billing.startTrial()))} />
      <Pressable onPress={() => void run(() => billing.restore())} accessibilityRole="button" style={{ alignItems: "center", paddingVertical: 4 }}>
        <T variant="small" color={colors.text3}>이미 구독했다면 구매 복원</T>
      </Pressable>
      <Sub tone="3" variant="caption" style={{ textAlign: "center" }}>
        {billing.isMock ? "개발 빌드: 결제 없이 기기 상태만 바뀝니다" : "스토어 결제로 진행되며 스토어 계정 설정에서 해지할 수 있어요"}
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
  const label = { none: "미구독", trial: "무료 체험 중", active: "구독 중", expired: "만료됨" }[sub.status];

  const restore = async () => {
    const r = await billing.restore();
    if (r) {
      setSubscription(r);
      setMsg("구독을 복원했어요.");
    } else setMsg("복원할 구매 내역이 없어요.");
  };
  const cancel = async () => {
    setSubscription(await billing.cancel(sub));
    setMsg("갱신을 해지했어요. 만료일까지는 그대로 이용할 수 있어요.");
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ gap: 8 }}>
        <T variant="title">구독 관리</T>
        <T variant="body" color={colors.text2}>{price} · 첫 {TRIAL_DAYS}일 무료</T>
      </View>
      <Card style={{ gap: 6 }}>
        <Row center>
          <T variant="heading">{label}</T>
          {sub.cancelled ? <Tag tone="gray">갱신 해지됨</Tag> : sub.status === "trial" || sub.status === "active" ? <Tag tone="primary" icon="check">이용 중</Tag> : null}
        </Row>
        {sub.expiresAt ? <Sub>{sub.status === "expired" ? "만료일" : sub.cancelled ? "이용 종료" : sub.status === "trial" ? "체험 종료" : "다음 결제"} {longDate(sub.expiresAt.slice(0, 10))}{left > 0 ? ` · ${left}일 남음` : ""}</Sub> : <Sub>공고 목록과 조건 확인은 무료예요. 자금 계산만 구독이 필요해요.</Sub>}
      </Card>
      {msg ? <Sub style={{ textAlign: "center" }}>{msg}</Sub> : null}
      <View style={{ gap: 10 }}>
        {(sub.status === "trial" || sub.status === "active") && !sub.cancelled ? <PrimaryButton tone="soft" label="갱신 해지" onPress={() => void cancel()} /> : null}
        <PrimaryButton tone="soft" label="구매 복원" onPress={() => void restore()} />
      </View>
      <Sub tone="3" variant="caption" style={{ textAlign: "center" }}>
        {billing.isMock ? "개발 빌드: 결제 없이 기기 상태만 바뀝니다" : "결제·환불은 스토어 정책을 따르며 스토어 계정 설정에서도 관리할 수 있어요"}
      </Sub>
    </BottomSheet>
  );
}
