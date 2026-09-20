import { useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import type { Pricing } from "@housing/schema";
import { computeRentalCost, conversionScenario, eligibleLoans, loanLimit, matchAnnouncement } from "@housing/engine";
import { Icon } from "@/components/Icon";
import { SubscriptionSheet } from "@/components/SubscriptionSheet";
import { BigNumber, BottomCTA, BottomSheet, Card, Chip, Divider, Header, IconButton, Notice, PrimaryButton, Row, Screen, SectionTitle, Sub, T } from "@/components/ui";
import { getAnnouncement } from "@/data/announcements";
import { LOANS } from "@/data/loans";
import { manwon, pct, won } from "@/lib/format";
import { canOpenCost, useAppState } from "@/store/appState";
import { useTheme } from "@/theme/ThemeProvider";
import { fonts, radius, space } from "@/theme/tokens";

const STEP = 1_000_000; // 전환보증금은 100만 원 단위 (LH 공고 규정)

/** 비용 계산: 필요 현금·부족액·월 주거비를 분해해서 크게. 모든 숫자에 출처. */
export default function Cost() {
  const { id, auto } = useLocalSearchParams<{ id: string; auto?: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { state } = useAppState();
  const a = getAnnouncement(id ?? "");
  const profile = state.profile;

  const [allTracks, setAllTracks] = useState(false);
  const { rentals, bestTrackName, otherCount } = useMemo(() => {
    if (!a || !profile) return { rentals: [] as { label: string; pricing: Pricing; trackName: string }[], bestTrackName: "", otherCount: 0 };
    const match = matchAnnouncement(a.extraction, profile);
    const best = match.best_track ?? [...match.tracks].sort((x, y) => y.summary.matched - x.summary.matched)[0];
    const ordered = [...(best ? [best] : []), ...match.tracks.filter((t) => t !== best)];
    const rows = ordered.flatMap((t) => t.track.pricing.filter((p) => p.kind === "rental").map((p) => ({ label: `${p.unit_type}${p.tier ? ` · ${p.tier}` : ""}`, pricing: p, trackName: t.track.name })));
    const bestRows = rows.filter((r) => r.trackName === best?.track.name);
    return { rentals: allTracks || bestRows.length === 0 ? rows : bestRows, bestTrackName: best?.track.name ?? "", otherCount: rows.length - bestRows.length };
  }, [a, profile, allTracks]);

  const [sel, setSel] = useState(0);
  const [deposit, setDeposit] = useState<number | null>(null);
  const [loanId, setLoanId] = useState<string | undefined>(undefined);
  const [scenario, setScenario] = useState(false);
  const [subSheet, setSubSheet] = useState(!canOpenCost(state, id ?? ""));

  const chosen = rentals[sel];
  const scenarioPricing = useMemo(() => {
    if (!chosen) return null;
    if (deposit === null) return chosen.pricing;
    const s = conversionScenario(chosen.pricing, deposit);
    return { ...chosen.pricing, deposit: s.deposit, monthly_rent: s.monthly_rent };
  }, [chosen, deposit]);
  const cost = useMemo(() => (scenarioPricing && profile ? computeRentalCost(scenarioPricing, LOANS, profile, { preferredLoanId: loanId }) : null), [scenarioPricing, profile, loanId]);
  const loans = useMemo(() => (profile && scenarioPricing ? eligibleLoans(LOANS, profile).map((l) => loanLimit(l, scenarioPricing.deposit ?? 0, profile)) : []), [profile, scenarioPricing]);

  useEffect(() => {
    setDeposit(null);
  }, [sel]);

  if (!a || !profile || !chosen || !cost || !scenarioPricing) {
    return (
      <Screen>
        <T variant="heading" style={{ paddingTop: 20 }}>{!profile ? "먼저 내 조건을 입력해 주세요" : "이 공고는 계산할 임대 조건이 없어요"}</T>
      </Screen>
    );
  }

  const base = chosen.pricing;
  const conv = base.conversion;
  const minDep = conv?.min_deposit ?? base.deposit ?? 0;
  const maxDep = conv?.max_deposit ?? base.deposit ?? 0;
  const curDep = scenarioPricing.deposit ?? 0;
  const incomeRatio = cost.income_ratio;
  const cashLabel = manwon(cost.required_cash).replace(/ ?원$/, "");

  return (
    <Screen padded={false}>
      <Header onBack={() => (auto ? router.replace("/(tabs)") : router.back())} title="예상 주거비" right={<IconButton name="more" label="더보기" color={colors.text2} />} />
      <View style={{ paddingHorizontal: space.screen, gap: space.lg }}>
        {auto ? <Notice icon="check">조건이 가장 잘 맞는 공고의 주거비를 먼저 계산했어요. 이 공고는 계속 무료예요.</Notice> : null}
        <View style={{ gap: 4, paddingTop: 4 }}>
          <T variant="heading" style={{ fontSize: 18, lineHeight: 26 }}>{a.title}</T>
          {bestTrackName ? <Sub tone="3">{bestTrackName}</Sub> : null}
        </View>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {rentals.map((r, i) => <Chip key={`${r.trackName}-${r.label}`} on={i === sel} onPress={() => setSel(i)}>{allTracks ? `${r.trackName} · ${r.label}` : r.label}</Chip>)}
          {otherCount > 0 && !allTracks ? <Chip onPress={() => { setAllTracks(true); setSel(0); }}>다른 트랙 {otherCount}개</Chip> : null}
        </View>

        <Card style={{ gap: 16 }}>
          <BigNumber label="지금 필요한 현금 (예상)" value={cashLabel} unit="원" size={40} sub={cost.shortfall > 0 ? `보유 현금 ${manwon(profile.cash_on_hand)}으로는 ${manwon(cost.shortfall)} 부족해요` : `보유 현금 ${manwon(profile.cash_on_hand)}으로 감당돼요`} />
          <Divider />
          <View style={{ gap: 12 }}>
            <KV label="임대보증금" value={won(cost.deposit)} src={`공고문 ${base.source.page}쪽${deposit !== null ? " · 전환 적용" : ""}`} />
            {cost.loan ? (
              <KV label={`${cost.loan.product.name} (보증금의 ${Math.round(cost.loan.product.ltv * 100)}%)`} value={`− ${won(cost.loan.amount)}`} src={`${cost.loan.product.provider} · ${cost.loan.as_of_date} 기준 · 연 ${(cost.loan.annual_rate * 100).toFixed(1)}%`} />
            ) : (
              <KV label="적용 가능한 대출" value="없음" src="입력 조건에 맞는 전세자금대출 상품이 없어요" />
            )}
          </View>
        </Card>

        <Card style={{ gap: 16 }}>
          <View style={{ gap: 4 }}>
            <Sub>매달 나가는 돈 (예상)</Sub>
            <Row center>
              <T variant="title" numeric style={{ fontSize: 30, lineHeight: 38 }}>{won(cost.monthly_housing_cost)}</T>
              {incomeRatio !== null ? <T variant="bodyMedium" color={colors.text2}>소득의 <T variant="bodyMedium" numeric>{pct(incomeRatio)}</T></T> : null}
            </Row>
          </View>
          <Divider />
          <View style={{ gap: 12 }}>
            <KV label="월임대료" value={won(cost.monthly_rent)} />
            {cost.loan ? <KV label={cost.loan.interest_only ? "대출 이자" : "대출 원리금"} value={won(cost.loan.monthly_payment)} /> : null}
            <KV label="관리비 추정" value={won(cost.maintenance_estimate)} src={base.maintenance_estimate === undefined ? "공고문에 없어 추정값 사용" : `공고문 ${base.source.page}쪽`} />
            {cost.monthly_debt_payment > 0 ? <KV label="기존 부채 상환 (부담률에만 포함)" value={won(cost.monthly_debt_payment)} /> : null}
          </View>
        </Card>
        <Sub tone="3">숫자는 공고문과 {cost.loan?.as_of_date ?? LOANS[0]!.as_of_date} 기준 대출 조건으로 계산한 예상값이에요. 실제 계약 조건과 다를 수 있어요.</Sub>
        <View style={{ height: 40 }} />
      </View>

      <BottomCTA label={conv ? "보증금·월세 조정해 보기" : "대출 상품 바꿔 보기"} onPress={() => setScenario(true)} />

      <BottomSheet visible={scenario} onClose={() => setScenario(false)}>
        {conv ? (
          <>
            <View style={{ gap: 4 }}>
              <T variant="title" style={{ fontSize: 22, lineHeight: 30 }}>보증금을 올리면{"\n"}월세가 내려가요</T>
              <Sub tone="3">전환이율 {(conv.rate * 100).toFixed(1)}%{conv.rate_down ? ` · 감액 ${(conv.rate_down * 100).toFixed(1)}%` : ""} · 100만 원 단위</Sub>
            </View>
            <Row center>
              <BigNumber label="보증금" value={manwon(curDep).replace(/ ?원$/, "")} unit="원" size={26} />
              <BigNumber label="월임대료" value={won(scenarioPricing.monthly_rent ?? 0).replace("원", "")} unit="원" size={26} align="right" />
            </Row>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Stepper label="−100만" disabled={curDep - STEP < minDep} onPress={() => setDeposit(Math.max(minDep, curDep - STEP))} />
              <View style={{ flex: 1, height: 6, backgroundColor: colors.cardSoft, borderRadius: 3, overflow: "hidden" }}>
                <View style={{ width: `${maxDep > minDep ? ((curDep - minDep) / (maxDep - minDep)) * 100 : 100}%`, height: "100%", backgroundColor: colors.primary }} />
              </View>
              <Stepper label="+100만" disabled={curDep + STEP > maxDep} onPress={() => setDeposit(Math.min(maxDep, curDep + STEP))} />
            </View>
            <Row><Sub tone="3">최소 {manwon(minDep)}</Sub><Sub tone="3">최대 {manwon(maxDep)}</Sub></Row>
          </>
        ) : (
          <T variant="title" style={{ fontSize: 22, lineHeight: 30 }}>이 공고는 전환보증금 조건이 없어요</T>
        )}
        <SectionTitle>대출 상품</SectionTitle>
        {loans.length === 0 ? <Sub>입력 조건에 맞는 전세자금대출 상품이 없어요.</Sub> : null}
        <View style={{ gap: 8 }}>
          {loans.map((q) => {
            const on = (loanId ?? cost.loan?.product.id) === q.product.id;
            return (
              <Pressable key={q.product.id} onPress={() => setLoanId(q.product.id)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                style={{ flexDirection: "row", gap: 12, alignItems: "center", padding: 16, borderRadius: radius.md, backgroundColor: on ? colors.primarySoft : colors.cardSoft }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="bodyMedium" color={on ? colors.primary : colors.text}>{q.product.name}</T>
                  <Sub tone="3">연 {(q.annual_rate * 100).toFixed(1)}% · 한도 {Math.round(q.product.ltv * 100)}% · 최대 {manwon(q.amount)}</Sub>
                </View>
                {on ? <Icon name="check" size={20} color={colors.primary} strokeWidth={3} /> : null}
              </Pressable>
            );
          })}
        </View>
        <PrimaryButton label="이 조건으로 보기" onPress={() => setScenario(false)} tone="dark" />
        {deposit !== null ? (
          <Pressable onPress={() => setDeposit(null)} style={{ alignItems: "center", paddingVertical: 4 }} accessibilityRole="button"><Sub tone="3">기본 임대조건으로 되돌리기</Sub></Pressable>
        ) : null}
      </BottomSheet>

      <SubscriptionSheet visible={subSheet} onClose={() => { setSubSheet(false); if (!canOpenCost(state, a.id)) router.back(); }} onStarted={() => setSubSheet(false)} />
    </Screen>
  );
}

function KV({ label, value, src }: { label: string; value: string; src?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Row center>
        <T variant="body" color={colors.text2} style={{ flex: 1 }}>{label}</T>
        <T variant="bodyMedium" numeric style={{ fontFamily: fonts.semiBold }}>{value}</T>
      </Row>
      {src ? <Sub tone="3" style={{ fontSize: 12.5 }}>{src}</Sub> : null}
    </View>
  );
}

function Stepper({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.cardSoft, opacity: disabled ? 0.4 : 1 }}>
      <T variant="small" numeric style={{ fontFamily: fonts.semiBold }}>{label}</T>
    </Pressable>
  );
}
