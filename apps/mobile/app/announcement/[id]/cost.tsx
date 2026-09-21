import { useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import type { Pricing } from "@housing/schema";
import { computeRentalCost, conversionScenario, eligibleLoans, loanLimit, matchAnnouncement } from "@housing/engine";
import { Icon } from "@/components/Icon";
import { SubscriptionSheet } from "@/components/SubscriptionSheet";
import { SourceCard } from "@/components/SourceCard";
import { animateLayout, BigNumber, BottomCTA, BottomSheet, Card, FadeIn, Header, IconButton, KeyValue, Notice, PrimaryButton, Row, Screen, SectionTitle, Sub, T, Tag } from "@/components/ui";
import { ReportSheet } from "@/components/ReportSheet";
import { draftReport, findReport, REPORT_STATUS_LABEL, type ReportTarget } from "@/lib/reports";
import { getAnnouncement, useAnnouncements } from "@/data/announcements";
import { LOANS } from "@/data/loans";
import { manwon, pct, won, dateText } from "@/lib/format";
import { canOpenCost, useAppState } from "@/store/appState";
import { useTheme } from "@/theme/ThemeProvider";
import { fonts, radius, space } from "@/theme/tokens";

const STEP = 1_000_000; // 전환보증금은 100만 원 단위 (LH 공고 규정)

/** 비용 계산: 필요 현금·부족액·월 주거비를 분해해서 크게. 모든 숫자에 출처. */
export default function Cost() {
  const { id, auto } = useLocalSearchParams<{ id: string; auto?: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { state, addReport } = useAppState();
  const { list } = useAnnouncements();
  const a = getAnnouncement(id ?? "", list);
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
  const [picker, setPicker] = useState(false);
  const [subSheet, setSubSheet] = useState(!canOpenCost(state, id ?? ""));
  const [report, setReport] = useState(false);

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
  // 신고 대상: 지금 보고 있는 임대조건 한 행 (트랙 순번 + 그 트랙 안의 가격 순번)
  const priceTrackIndex = a.extraction.tracks.findIndex((t) => t.pricing.includes(base));
  const priceTarget: ReportTarget = {
    kind: "pricing",
    trackIndex: priceTrackIndex,
    itemIndex: priceTrackIndex >= 0 ? a.extraction.tracks[priceTrackIndex]!.pricing.indexOf(base) : -1,
    label: `${chosen.label} · 보증금 ${won(base.deposit ?? 0)} / 월 ${won(base.monthly_rent ?? 0)}`,
    page: base.source.page,
  };
  const priceReport = findReport(state.reports, a.id, priceTarget);
  const conv = base.conversion;
  const minDep = conv?.min_deposit ?? base.deposit ?? 0;
  const maxDep = conv?.max_deposit ?? base.deposit ?? 0;
  const curDep = scenarioPricing.deposit ?? 0;
  const incomeRatio = cost.income_ratio;
  const cashLabel = manwon(cost.required_cash).replace(/ ?원$/, "");

  return (
    <Screen
      padded={false}
      header={<Header onBack={() => (auto ? router.replace("/(tabs)") : router.back())} title="예상 주거비" right={<IconButton name="more" label="더보기" color={colors.text2} />} />}
      footer={<BottomCTA label={conv ? "보증금·월세 조정해 보기" : "대출 상품 바꿔 보기"} onPress={() => setScenario(true)} />}
    >
      <View style={{ paddingHorizontal: space.screen, gap: space.section }}>
        <View style={{ gap: 16 }}>
          {auto ? <Notice icon="check">조건이 가장 잘 맞는 공고의 주거비를 먼저 계산했어요. 이 공고는 계속 무료예요.</Notice> : null}
          <View style={{ gap: 4 }}>
            <T variant="heading" style={{ fontSize: 20, lineHeight: 28 }}>{a.title}</T>
            {bestTrackName ? <Sub tone="3">{bestTrackName}</Sub> : null}
          </View>
          <Pressable onPress={() => setPicker(true)} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: pressed ? colors.cardSoft : colors.card, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14 })}>
            <View style={{ gap: 2 }}>
              <Sub tone="3" variant="caption">주택형</Sub>
              <T variant="bodyMedium">{chosen.label}</T>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Sub tone="3">{rentals.length + otherCount}개 중</Sub>
              <Icon name="right" size={18} color={colors.text4} />
            </View>
          </Pressable>
        </View>

        <FadeIn key={`${sel}-${deposit ?? "base"}-${loanId ?? "auto"}`} style={{ gap: space.section }}>
        <View style={{ gap: 12 }}>
          <SectionTitle>지금 필요한 현금</SectionTitle>
          <Card style={{ gap: 20 }}>
            <BigNumber value={cashLabel} unit="원" size={40} sub={cost.shortfall > 0 ? `보유 현금 ${manwon(profile.cash_on_hand)}으로는 ${manwon(cost.shortfall)} 부족해요` : `보유 현금 ${manwon(profile.cash_on_hand)}으로 감당돼요`} />
            <View style={{ gap: 14 }}>
              <KeyValue label="임대보증금" value={won(cost.deposit)} src={`공고문 ${base.source.page}쪽${deposit !== null ? " · 전환 적용" : ""}`} />
              {cost.loan ? (
                <KeyValue label={`${cost.loan.product.name} (${Math.round(cost.loan.product.ltv * 100)}%)`} value={`− ${won(cost.loan.amount)}`} src={`${cost.loan.product.provider} · ${dateText(cost.loan.as_of_date)} 기준 · 연 ${(cost.loan.annual_rate * 100).toFixed(1)}%`} />
              ) : (
                <KeyValue label="적용 가능한 대출" value="없음" src="입력 조건에 맞는 전세자금대출 상품이 없어요" />
              )}
            </View>
          </Card>
        </View>

        <View style={{ gap: 12 }}>
          <SectionTitle>매달 나가는 돈</SectionTitle>
          <Card style={{ gap: 20 }}>
            <Row center>
              <BigNumber value={won(cost.monthly_housing_cost).replace("원", "")} unit="원" size={34} />
              {incomeRatio !== null ? (
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <Sub tone="3" variant="caption">월 소득 대비</Sub>
                  <T variant="heading" numeric color={incomeRatio > 0.3 ? colors.warning : colors.text}>{pct(incomeRatio)}</T>
                </View>
              ) : null}
            </Row>
            <View style={{ gap: 14 }}>
              <KeyValue label="월임대료" value={won(cost.monthly_rent)} />
              {cost.loan ? <KeyValue label={cost.loan.interest_only ? "대출 이자" : "대출 원리금"} value={won(cost.loan.monthly_payment)} /> : null}
              <KeyValue label="관리비" value={won(cost.maintenance_estimate)} src={base.maintenance_estimate === undefined ? "공고문에 없어 추정값을 썼어요" : `공고문 ${base.source.page}쪽`} />
              {cost.monthly_debt_payment > 0 ? <KeyValue label="기존 부채 상환" value={won(cost.monthly_debt_payment)} src="부담률 계산에만 포함" /> : null}
            </View>
          </Card>
        </View>
        </FadeIn>
        {/* 가장 큰 숫자를 보여 준 화면인데 여기서 원문으로 갈 길이 없었다 */}
        <SourceCard pdfUrl={a.pdf_url} what="보증금·월임대료는" />
        <Pressable onPress={() => setReport(true)} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", paddingHorizontal: 4, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
          <Sub tone="3" variant="caption">보증금·월임대료가 공고문과 다른가요?</Sub>
          {priceReport ? <Tag tone="info" icon="info">{REPORT_STATUS_LABEL[priceReport.status]}</Tag> : null}
        </Pressable>
        <Sub tone="3" variant="caption" style={{ paddingHorizontal: 4 }}>공고문과 {dateText(cost.loan?.as_of_date ?? LOANS[0]!.as_of_date)} 기준 대출 조건으로 계산한 예상값이에요. 실제 계약 조건과 다를 수 있어요.</Sub>
      </View>

      <BottomSheet visible={scenario} onClose={() => setScenario(false)}>
        {conv ? (
          <>
            <View style={{ gap: 6 }}>
              <T variant="heading">보증금을 올리면{"\n"}월세가 내려가요</T>
              <Sub tone="3">전환이율 {(conv.rate * 100).toFixed(1)}%{conv.rate_down ? ` · 감액 시 ${(conv.rate_down * 100).toFixed(1)}%` : ""} · 100만 원 단위</Sub>
            </View>
            <Card style={{ gap: 18 }}>
              <Row center>
                <BigNumber label="보증금" value={manwon(curDep).replace(/ ?원$/, "")} unit="원" size={26} />
                <BigNumber label="월임대료" value={won(scenarioPricing.monthly_rent ?? 0).replace("원", "")} unit="원" size={26} align="right" />
              </Row>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Stepper label="−100만" disabled={curDep - STEP < minDep} onPress={() => setDeposit(Math.max(minDep, curDep - STEP))} />
                <View style={{ flex: 1, height: 6, backgroundColor: colors.cardStrong, borderRadius: 3, overflow: "hidden" }}>
                  <View style={{ width: `${maxDep > minDep ? ((curDep - minDep) / (maxDep - minDep)) * 100 : 100}%`, height: "100%", backgroundColor: colors.primary }} />
                </View>
                <Stepper label="+100만" disabled={curDep + STEP > maxDep} onPress={() => setDeposit(Math.min(maxDep, curDep + STEP))} />
              </View>
              <Row><Sub tone="3" variant="caption">최소 {manwon(minDep)}</Sub><Sub tone="3" variant="caption">최대 {manwon(maxDep)}</Sub></Row>
            </Card>
          </>
        ) : (
          <T variant="heading">이 공고는 전환보증금 조건이 없어요</T>
        )}
        <View style={{ gap: 10 }}>
          <T variant="subheading">대출 상품</T>
          {loans.length === 0 ? <Sub>입력 조건에 맞는 전세자금대출 상품이 없어요.</Sub> : null}
          {loans.map((q) => {
            const on = (loanId ?? cost.loan?.product.id) === q.product.id;
            return (
              <Pressable key={q.product.id} onPress={() => setLoanId(q.product.id)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                style={{ flexDirection: "row", gap: 12, alignItems: "center", padding: 16, borderRadius: radius.md, backgroundColor: on ? colors.primarySoft : colors.card }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="bodyMedium" color={on ? colors.primary : colors.text}>{q.product.name}</T>
                  <Sub tone="3" variant="caption">연 {(q.annual_rate * 100).toFixed(1)}% · 한도 {Math.round(q.product.ltv * 100)}% · 최대 {manwon(q.amount)}</Sub>
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

      <BottomSheet visible={picker} onClose={() => setPicker(false)}>
        <View style={{ gap: 4 }}>
          <T variant="heading">어떤 주택형으로 볼까요?</T>
          <Sub tone="3">{bestTrackName ? `조건이 가장 잘 맞는 ${bestTrackName} 기준` : ""}</Sub>
        </View>
        <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {rentals.map((r, i) => {
            const on = i === sel;
            return (
              <Pressable key={`${r.trackName}-${r.label}-${i}`} onPress={() => { animateLayout(); setSel(i); setPicker(false); }} accessibilityRole="radio" accessibilityState={{ checked: on }}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderRadius: radius.md, backgroundColor: on ? colors.primarySoft : colors.card }}>
                <View style={{ gap: 2 }}>
                  <T variant="bodyMedium" color={on ? colors.primary : colors.text}>{r.label}</T>
                  <Sub tone="3" variant="caption">{allTracks ? r.trackName + " · " : ""}보증금 {manwon(r.pricing.deposit)} · 월 {won(r.pricing.monthly_rent)}</Sub>
                </View>
                {on ? <Icon name="check" size={20} color={colors.primary} strokeWidth={3} /> : null}
              </Pressable>
            );
          })}
          {otherCount > 0 && !allTracks ? (
            <Pressable onPress={() => { setAllTracks(true); }} accessibilityRole="button" style={{ padding: 14, alignItems: "center" }}>
              <T variant="bodyMedium" color={colors.text2}>다른 공급 유형 주택형 {otherCount}개 더 보기</T>
            </Pressable>
          ) : null}
        </ScrollView>
      </BottomSheet>

      <SubscriptionSheet visible={subSheet} onClose={() => { setSubSheet(false); if (!canOpenCost(state, a.id)) router.back(); }} onStarted={() => setSubSheet(false)} />
      <ReportSheet
        visible={report}
        onClose={() => setReport(false)}
        title={priceTarget.label}
        page={priceTarget.page}
        sourceText={base.source.text}
        pdfUrl={a.pdf_url}
        existing={priceReport}
        onSubmit={(message, suggested) => addReport(draftReport({ announcementId: a.id, announcementTitle: a.title, target: priceTarget, message, suggested }))}
      />
    </Screen>
  );
}

function Stepper({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: pressed ? colors.cardStrong : colors.cardSoft, opacity: disabled ? 0.4 : 1 })}>
      <T variant="small" numeric style={{ fontFamily: fonts.semiBold }}>{label}</T>
    </Pressable>
  );
}
