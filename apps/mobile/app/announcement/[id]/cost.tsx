import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import type { Pricing } from "@housing/schema";
import { computeRentalCost, conversionScenario, eligibleLoans, loanLimit, matchAnnouncement } from "@housing/engine";
import { Icon } from "@/components/icon";
import { SubscriptionSheet } from "@/components/SubscriptionSheet";
import { SourceCard } from "@/components/SourceCard";
import { animateLayout, BigNumber, BottomCTA, BottomSheet, Card, Chip, FadeIn, Header, IconButton, IconTile, KeyValue, Notice, PrimaryButton, Row, Screen, SectionTitle, Sub, T, Tag } from "@/components/ui";
import { ReportSheet } from "@/components/ReportSheet";
import { draftReport, findReport, REPORT_STATUS_LABEL, type ReportTarget } from "@/lib/reports";
import { getAnnouncement, useAnnouncements } from "@/data/announcements";
import { LOANS } from "@/data/loans";
import { manwon, maskDigits, pct, won, dateText } from "@/lib/format";
import { compareUnits, UNIT_SORT_LABEL, unitLabel, unitRent, unitsWithDistance, type UnitSort } from "@/lib/units";
import { nearbyLines, transitLines } from "@/lib/commute";
import type { IconName } from "@/components/icon";
import type { SupplyUnit } from "@housing/schema";
import type { UnitRent } from "@/lib/units";
import { fetchUnitCommute, transitConfigured, type UnitCommute } from "@/data/transit";

/**
 * 고를 수 있는 임대조건 한 줄.
 * 단지형은 주택형 하나, 흩어진 공고는 집 한 채다 — 뒤쪽만 unit이 붙는다 (lib/units.ts).
 */
interface RentalChoice {
  label: string;
  pricing: Pricing;
  trackName: string;
  unit?: SupplyUnit;
  /** 직장까지 직선거리 (km). 흩어진 공고에만 */
  km?: number | null;
  /** 이 사람에게 적용되는 임대조건 */
  rent?: UnitRent;
}
import { canOpenCost, useAppState } from "@/store/appState";
import { accessLevel } from "@/lib/access";
import { useTheme } from "@/theme/ThemeProvider";
import { fonts, radius, space } from "@/theme/tokens";

const STEP = 1_000_000; // 전환보증금은 100만 원 단위 (LH 공고 규정)

/** 비용 계산: 필요 현금·부족액·월 주거비를 분해해서 크게. 모든 숫자에 출처. */
export default function Cost() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { state, addReport, signIn } = useAppState();
  const { list } = useAnnouncements();
  const a = getAnnouncement(id ?? "", list);
  const profile = state.profile;

  const [allTracks, setAllTracks] = useState(false);
  // 흩어진 집을 세우는 기준. 기본은 가까운 순 — 거리가 제일 먼저 걸러지는 조건이다.
  const [houseSort, setHouseSort] = useState<UnitSort>("near");
  const { rentals, bestTrackName, otherCount } = useMemo((): { rentals: RentalChoice[]; bestTrackName: string; otherCount: number } => {
    if (!a || !profile) return { rentals: [], bestTrackName: "", otherCount: 0 };

    /**
     * 흩어진 공고(매입임대·전세임대)는 임대조건이 주택형이 아니라 집마다 다르다.
     * 공고문 본문에는 조건표가 없고 별도 엑셀에 집 목록으로 있다 (lib/units.ts).
     * 그래서 고르는 대상 자체가 "36형"이 아니라 "강동구 구천면로 317 403호"다.
     * 여기서 집을 가격 행으로 바꿔 두면 아래 계산(대출·필요 현금·월 합계)은 그대로 돈다 —
     * 고르는 목록만 바뀌고 셈은 같다.
     *
     * 직장에서 가까운 순으로 세운다. 집이 수백 채라 순서가 곧 화면의 쓸모다.
     */
    if (a.units?.length) {
      const rows = unitsWithDistance(a.units, profile)
        .sort((x, y) => compareUnits(houseSort, x, y))
        .flatMap(({ unit, km }) => {
          // 소득 구간마다 월세가 다르다. 이 사람에게 맞는 줄로 계산한다 (lib/units.ts).
          const rent = unitRent(unit, profile);
          if (!rent) return [];
          return [
            {
              unit,
              km,
              rent,
              label: `${unitLabel(unit)}${unit.ho ? ` ${unit.ho}호` : ""}`,
              // 목록 한 줄에 들어갈 만큼만: 거리·크기·보증금. 나머지는 눌러서 본다.
              trackName: [
                km !== null ? `직장 직선 ${km < 10 ? km.toFixed(1) : km.toFixed(0)}km` : null,
                unit.exclusive_area_m2 !== undefined ? `전용 ${unit.exclusive_area_m2.toFixed(1)}㎡` : null,
              ]
                .filter(Boolean)
                .join(" · "),
              pricing: {
                unit_type: unitLabel(unit),
                kind: "rental" as const,
                deposit: rent.deposit,
                monthly_rent: rent.monthly_rent,
                source: { page: 0, text: "공급주택목록 첨부" },
              } as Pricing,
            },
          ];
        });
      return { rentals: rows, bestTrackName: "", otherCount: 0 };
    }

    const match = matchAnnouncement(a.extraction, profile, { announcement_region: a.region_code });
    const best = match.best_track ?? [...match.tracks].sort((x, y) => y.summary.matched - x.summary.matched)[0];
    const ordered = [...(best ? [best] : []), ...match.tracks.filter((t) => t !== best)];
    const rows = ordered.flatMap((t) => t.track.pricing.filter((p) => p.kind === "rental").map((p) => ({ label: `${p.unit_type}${p.tier ? ` · ${p.tier}` : ""}`, pricing: p, trackName: t.track.name })));
    const bestRows = rows.filter((r) => r.trackName === best?.track.name);
    return { rentals: allTracks || bestRows.length === 0 ? rows : bestRows, bestTrackName: best?.track.name ?? "", otherCount: rows.length - bestRows.length };
  }, [a, profile, allTracks, houseSort]);

  const [sel, setSel] = useState(0);
  const [deposit, setDeposit] = useState<number | null>(null);
  const [loanId, setLoanId] = useState<string | undefined>(undefined);
  const [scenario, setScenario] = useState(false);
  const [picker, setPicker] = useState(false);
  const [subSheet, setSubSheet] = useState(false);
  const [report, setReport] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  // 확정된 선: 조건 매칭은 무료, 자금 계산은 유료.
  // 잠겼어도 화면은 그대로 보여 준다 — 보증금·월임대료는 공고문에 적힌 공개 사실이라 가리지 않고,
  // 우리가 계산한 값(필요 현금·부족액·대출·월 합계)만 가린다.
  //
  // 잠긴 이유가 둘이라 안내가 달라야 한다. 구독을 했는데도 로그인이 없어 막히면
  // 사용자는 왜 막혔는지 알 수 없다 (결제 복원 뒤에 생길 수 있는 상태다).
  const level = accessLevel({ account: state.account, subscription: state.subscription });
  const locked = !canOpenCost(state);
  const needsSignIn = level === "gate";
  const hide = (text: string) => (locked ? maskDigits(text) : text);

  const unlock = () => {
    if (!needsSignIn) return setSubSheet(true);
    setSigningIn(true);
    void signIn("kakao").finally(() => setSigningIn(false));
  };

  // 흩어진 공고에서 고르는 것은 주택형이 아니라 집 한 채다. 말이 다르면 화면의 말도 달라야 한다.
  const picksHouse = !!a?.units?.length;
  const chosen = rentals[sel];
  /**
   * 정렬을 바꾸면 같은 번째가 다른 집이 된다. 고른 집의 id를 들고 있다가 새 목록에서 자리를 다시 찾는다.
   *
   * id는 사람이 고를 때만 적는다(pickHouse). 렌더 결과에서 적으면 정렬이 바뀐 직후
   * 그 값이 "새 첫 번째 집"으로 덮여 되찾을 대상이 사라진다 — 효과 순서에 기대는 코드가 된다.
   */
  const chosenId = useRef<string | undefined>(undefined);
  const pickHouse = (at: number) => {
    chosenId.current = rentals[at]?.unit?.id;
    setSel(at);
  };
  useEffect(() => {
    if (!picksHouse || !chosenId.current) return;
    const at = rentals.findIndex((r) => r.unit?.id === chosenId.current);
    if (at >= 0 && at !== sel) setSel(at);
  }, [rentals]);
  /**
   * 고른 집의 역·정류장·주변 시설.
   *
   * 따로 부르지 않는다 — 좌표를 찍는 호출이 이미 같이 받아 온 값이고, 수집할 때 집에 붙여 뒀다.
   * 공고 하나의 좌표로 그리던 위치 섹션은 이 유형에서 꺼 두었다(시청 좌표였다). 여기가 그 자리를 대신한다.
   */
  const spot = picksHouse ? chosen?.unit : undefined;
  /**
   * 고른 집까지의 대중교통 소요.
   *
   * 미리 계산할 수 없어서(집 × 시군구 조합이 하루 한도를 넘는다) 고른 집 하나만 그때 부른다.
   * 서버가 캐시하므로 같은 시군구에서 같은 집을 보는 두 번째 사람부터는 호출이 없다.
   * 못 구하면 null로 두고 화면은 직선거리로 되돌아간다 — 없는 값을 지어내지 않는다.
   */
  const [commute, setCommute] = useState<UnitCommute | null>(null);
  const [commuteLoading, setCommuteLoading] = useState(false);
  useEffect(() => {
    if (!a || !spot || !transitConfigured) {
      setCommute(null);
      return;
    }
    let cancelled = false;
    setCommute(null);
    setCommuteLoading(true);
    void fetchUnitCommute(a.id, spot, state.profile)
      .then((r) => {
        if (!cancelled) setCommute(r);
      })
      .finally(() => {
        if (!cancelled) setCommuteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [a?.id, spot?.id, state.profile?.workplace?.label]);
  /** 목록에서 (i)를 눌러 펼친 집. 고르는 것과는 별개다 — 보기만 하고 닫을 수 있어야 한다 */
  const [detail, setDetail] = useState<RentalChoice | null>(null);
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
        <T variant="heading" style={{ paddingTop: 20 }}>{!profile ? "먼저 내 조건을 입력해 주세요" : "이 공고는 계산할 임대조건이 없어요"}</T>
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
      header={<Header onBack={() => router.back()} title="예상 주거비" right={<IconButton name="more" label="더보기" color={colors.text2} />} />}
      footer={
        <BottomCTA
          label={
            signingIn ? "로그인 중" : needsSignIn ? "로그인하고 주거비 보기" : locked ? "구독하고 주거비 보기" : conv ? "보증금·월세 조정해 보기" : "대출 상품 바꿔 보기"
          }
          disabled={signingIn}
          onPress={() => (locked ? unlock() : setScenario(true))}
        />
      }
    >
      <View style={{ paddingHorizontal: space.screen, gap: space.section }}>
        <View style={{ gap: 16 }}>
          <View style={{ gap: 4 }}>
            <T variant="heading" style={{ fontSize: 20, lineHeight: 28 }}>{a.title}</T>
            {bestTrackName ? <Sub tone="3">{bestTrackName}</Sub> : null}
          </View>
          <Pressable onPress={() => setPicker(true)} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: pressed ? colors.cardSoft : colors.card, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14 })}>
            <View style={{ flex: 1, gap: 2 }}>
              <Sub tone="3" variant="caption">{picksHouse ? "집" : "주택형"}</Sub>
              {/* 주소는 잘리면 어느 집인지 알 수 없다. 줄바꿈해서 다 보여 준다. */}
              <T variant="bodyMedium">{chosen.label}</T>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <Sub tone="3">{rentals.length + otherCount}개 중</Sub>
              <Icon name="right" size={18} color={colors.text4} />
            </View>
          </Pressable>
        </View>

        {locked ? (
          <Notice icon="info">
            {needsSignIn
              ? "보증금과 월임대료는 공고문에 적힌 그대로예요. 가려진 계산 결과는 로그인하면 볼 수 있어요."
              : "보증금과 월임대료는 공고문에 적힌 그대로예요. 가려진 것은 이 조건으로 우리가 계산한 값이에요."}
          </Notice>
        ) : null}

        <FadeIn key={`${sel}-${deposit ?? "base"}-${loanId ?? "auto"}`} style={{ gap: space.section }}>
        <View style={{ gap: 12 }}>
          <SectionTitle>지금 필요한 현금</SectionTitle>
          <Card style={{ gap: 20 }}>
            <BigNumber
              value={hide(cashLabel)}
              unit="원"
              size={40}
              sub={
                locked
                  ? needsSignIn
                    ? "로그인하면 보증금에서 받을 수 있는 대출을 빼고 계산해 드려요"
                    : "보증금에서 받을 수 있는 대출을 빼고 계산해요"
                  : cost.shortfall > 0
                    ? `보유 현금 ${manwon(profile.cash_on_hand)}으로는 ${manwon(cost.shortfall)} 부족해요`
                    : `보유 현금 ${manwon(profile.cash_on_hand)}으로 낼 수 있어요`
              }
            />
            <View style={{ gap: 14 }}>
              <KeyValue label="임대보증금" value={won(cost.deposit)} amount={cost.deposit} src={`공고문 ${base.source.page}쪽${deposit !== null ? " · 전환 적용" : ""}`} />
              {cost.loan ? (
                <KeyValue label={`${cost.loan.product.name} (${Math.round(cost.loan.product.ltv * 100)}%)`} value={`− ${hide(won(cost.loan.amount))}`} amount={locked ? undefined : -cost.loan.amount} note={locked ? `${cost.loan.product.provider} · ${needsSignIn ? "로그인하면" : "구독하면"} 한도와 금리를 볼 수 있어요` : undefined} src={locked ? undefined : `${cost.loan.product.provider} · ${dateText(cost.loan.as_of_date)} 기준 · 연 ${(cost.loan.annual_rate * 100).toFixed(1)}%`} />
              ) : (
                <KeyValue label="적용 가능한 대출" value="없음" note="입력 조건에 맞는 전세자금대출 상품이 없어요" />
              )}
            </View>
          </Card>
        </View>

        {spot && (spot.transit || spot.nearby?.length) ? (
          <View style={{ gap: 12 }}>
            <SectionTitle>이 집 주변</SectionTitle>
            <Card style={{ gap: 16 }}>
              {transitLines(spot.transit).map((t) => (
                <NearRow key={t.title} icon={t.icon} title={t.title} detail={t.detail} />
              ))}
              {commute ? (
                <NearRow
                  icon="walk"
                  title={`직장까지 대중교통 약 ${commute.minutes}분${commute.transfers ? ` · 환승 ${commute.transfers}회` : ""}`}
                  detail={`${state.profile?.workplace?.label ?? "직장"} 기준${commute.fare ? ` · 편도 ${won(commute.fare)}` : ""}`}
                />
              ) : commuteLoading ? (
                <NearRow icon="walk" title="직장까지 걸리는 시간을 알아보고 있어요" detail="몇 초쯤 걸려요" />
              ) : null}
              {nearbyLines(spot.nearby).map((n) => (
                <NearRow key={n.kind} icon={n.icon as IconName} title={n.title} detail={n.detail} />
              ))}
              <Sub tone="3" variant="caption">
                {chosen?.label} 기준이에요. 종류마다 가장 가까운 한 곳만 보여드리고, 역·시설까지는 직선거리예요.
                {commute ? " 통근 시간은 입력한 직장 위치에서 출발한 대중교통 경로예요." : ""}
              </Sub>
            </Card>
          </View>
        ) : null}

        {/* 보증금이 싼지 비싼지는 비교 대상이 있어야 안다. 잠그지 않는다 — 보증금 자체가 무료인데
            싼지 비싼지만 가리면 판단의 절반을 뺏는 셈이다. */}
        {a.market && a.market.jeonse_median ? (
          <View style={{ gap: 12 }}>
            <SectionTitle>주변 시세와 비교</SectionTitle>
            <Card style={{ gap: 14 }}>
              <KeyValue label="이 공고 보증금" value={won(cost.deposit)} amount={cost.deposit} strong />
              <KeyValue
                label="주변 전세 중앙값"
                value={won(a.market.jeonse_median)}
                amount={a.market.jeonse_median}
                src={`전용 ${a.market.area_from}~${a.market.area_to}㎡ · ${a.market.deals}건`}
              />
              {a.market.monthly_rent_median ? (
                <KeyValue label="주변 월세 중앙값" value={`보증금 ${manwon(a.market.monthly_deposit_median)} / 월 ${won(a.market.monthly_rent_median)}`} />
              ) : null}
              <Sub tone="3" variant="caption">
                {a.market.from.replace("-", ".")}~{a.market.to.replace("-", ".")} {a.market.source}. 공공임대와 민간 전월세는 조건이 달라 그대로 견주기 어려워요.
              </Sub>
            </Card>
          </View>
        ) : null}

        <View style={{ gap: 12 }}>
          <SectionTitle>매달 나가는 돈</SectionTitle>
          <Card style={{ gap: 20 }}>
            <Row center>
              <BigNumber value={hide(won(cost.monthly_housing_cost).replace("원", ""))} unit="원" size={34} />
              {incomeRatio !== null ? (
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <Sub tone="3" variant="caption">월 소득 대비</Sub>
                  <T variant="heading" numeric color={locked ? colors.text3 : incomeRatio > 0.3 ? colors.warning : colors.text}>{hide(pct(incomeRatio))}</T>
                </View>
              ) : null}
            </Row>
            <View style={{ gap: 14 }}>
              <KeyValue label="월임대료" value={won(cost.monthly_rent)} amount={cost.monthly_rent} />
              {cost.loan ? <KeyValue label={cost.loan.interest_only ? "대출 이자" : "대출 원리금"} value={hide(won(cost.loan.monthly_payment))} /> : null}
              <KeyValue
                label="관리비"
                value={won(cost.maintenance_estimate)}
                amount={cost.maintenance_estimate}
                note={base.maintenance_estimate === undefined ? "공고문에 없어 추정값을 썼어요" : undefined}
                src={base.maintenance_estimate === undefined ? undefined : `공고문 ${base.source.page}쪽`}
              />
              {cost.monthly_debt_payment > 0 ? <KeyValue label="기존 부채 상환" value={hide(won(cost.monthly_debt_payment))} note="부담률 계산에만 포함" /> : null}
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
                <Stepper label="−100만 원" disabled={curDep - STEP < minDep} onPress={() => setDeposit(Math.max(minDep, curDep - STEP))} />
                <View style={{ flex: 1, height: 6, backgroundColor: colors.cardStrong, borderRadius: 3, overflow: "hidden" }}>
                  <View style={{ width: `${maxDep > minDep ? ((curDep - minDep) / (maxDep - minDep)) * 100 : 100}%`, height: "100%", backgroundColor: colors.primary }} />
                </View>
                <Stepper label="+100만 원" disabled={curDep + STEP > maxDep} onPress={() => setDeposit(Math.min(maxDep, curDep + STEP))} />
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
                {on ? <Icon name="check" size={20} color={colors.primary} /> : null}
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
          <T variant="heading">{picksHouse ? "어떤 집으로 볼까요?" : "어떤 주택형으로 볼까요?"}</T>
          <Sub tone="3">
            {picksHouse
              ? houseSort !== "near"
                ? `${UNIT_SORT_LABEL[houseSort]}으로 보고 있어요`
                : state.profile?.workplace
                  ? "직장에서 가까운 순이에요"
                  : "내 조건에 직장을 넣으면 가까운 순으로 보여드려요"
              : bestTrackName
                ? `조건이 가장 잘 맞는 ${bestTrackName} 기준`
                : ""}
          </Sub>
        </View>
        {picksHouse ? (
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {(Object.keys(UNIT_SORT_LABEL) as UnitSort[]).map((k) => (
              <Chip key={k} on={houseSort === k} onPress={() => { animateLayout(); setHouseSort(k); }}>
                {UNIT_SORT_LABEL[k]}
              </Chip>
            ))}
          </View>
        ) : null}
        <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {rentals.map((r, i) => {
            const on = i === sel;
            return (
              <View key={`${r.trackName}-${r.label}-${i}`} style={{ flexDirection: "row", alignItems: "center", borderRadius: radius.md, backgroundColor: on ? colors.primarySoft : colors.card }}>
              <Pressable onPress={() => { animateLayout(); pickHouse(i); setPicker(false); }} accessibilityRole="radio" accessibilityState={{ checked: on }}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 }}>
                <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                  {/* 주소는 이 줄의 정체다. 말줄임하면 같은 길 다른 번지를 구분할 수 없다. */}
                  <T variant="bodyMedium" color={on ? colors.primary : colors.text}>{r.label}</T>
                  <Sub tone="3" variant="caption">
                    {picksHouse
                      ? `${r.trackName ? `${r.trackName} · ` : ""}보증금 ${manwon(r.pricing.deposit)}`
                      : `${allTracks ? `${r.trackName} · ` : ""}보증금 ${manwon(r.pricing.deposit)} · 월 ${won(r.pricing.monthly_rent)}`}
                  </Sub>
                </View>
                {on ? <Icon name="check" size={20} color={colors.primary} /> : null}
              </Pressable>
              {/* 집은 한 줄에 다 못 적는다. 층·방·승강기·주변·전체 주소는 여기서 펼쳐 본다. */}
              {picksHouse ? (
                <Pressable
                  onPress={() => setDetail(r)}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.label} 자세히`}
                  hitSlop={8}
                  style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 16, opacity: pressed ? 0.5 : 1 })}
                >
                  <Icon name="info" size={18} color={colors.text4} />
                </Pressable>
              ) : null}
              </View>
            );
          })}
          {otherCount > 0 && !allTracks ? (
            <Pressable onPress={() => { setAllTracks(true); }} accessibilityRole="button" style={{ padding: 14, alignItems: "center" }}>
              <T variant="bodyMedium" color={colors.text2}>다른 공급 유형 주택형 {otherCount}개 더 보기</T>
            </Pressable>
          ) : null}
        </ScrollView>
      </BottomSheet>

      {/* 닫아도 내보내지 않는다 — 잠긴 화면 그대로 두는 편이 무엇을 사는지 더 잘 보여 준다 */}
      {/*
        집 하나를 자세히. 목록은 거리·크기·보증금까지만 적고 나머지를 여기 모은다 —
        한 줄에 다 넣으면 줄바꿈으로 목록이 두 배가 되고, 그러면 훑어보기가 안 된다.
      */}
      <BottomSheet visible={detail !== null} onClose={() => setDetail(null)}>
        {detail?.unit ? (
          <UnitDetail
            choice={detail}
            onPick={() => {
              const i = rentals.indexOf(detail);
              if (i >= 0) pickHouse(i);
              setDetail(null);
              setPicker(false);
            }}
          />
        ) : null}
      </BottomSheet>

      <SubscriptionSheet visible={subSheet} onClose={() => setSubSheet(false)} onStarted={() => setSubSheet(false)} />
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

/** 역·정류장·주변 시설 한 줄. 상세 화면의 Row와 같은 모양이지만 누를 일이 없어 단순하다. */
function NearRow({ icon, title, detail }: { icon: IconName; title: string; detail: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
      <IconTile name={icon} tone="gray" size={36} />
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="bodyMedium" style={{ fontSize: 15 }}>{title}</T>
        <Sub tone="3" variant="caption">{detail}</Sub>
      </View>
    </View>
  );
}

/**
 * 집 한 채를 자세히.
 *
 * 목록은 훑어보는 곳이라 거리·크기·보증금까지만 적는다. 그 이상을 넣으면 줄바꿈으로 목록이
 * 두 배가 되고, 그러면 수백 채에서 고른다는 이 화면의 목적이 사라진다.
 * 대신 실제로 집을 고를 때 묻는 것들을 여기 모은다 — 몇 층인지, 승강기가 있는지,
 * 전체 주소가 어디인지, 미리 볼 수 있는지, 그리고 역과 생활 시설이 얼마나 가까운지.
 *
 * 소득 구간을 밝혀 적는다. 같은 집이라도 수급자·한부모·차상위는 시세 30%, 그 외는 40%라
 * 월세가 37% 차이 난다. 어느 기준으로 계산한 금액인지 모르면 그 숫자를 믿을 수 없다.
 */
function UnitDetail({ choice, onPick }: { choice: RentalChoice; onPick: () => void }) {
  const { colors } = useTheme();
  const unit = choice.unit!;
  const rent = choice.rent;
  const facts: { label: string; value: string }[] = [
    ...(unit.dong || unit.ho ? [{ label: "동·호", value: [unit.dong ? `${unit.dong}동` : null, unit.ho ? `${unit.ho}호` : null].filter(Boolean).join(" ") }] : []),
    ...(unit.complex ? [{ label: "주택군", value: unit.complex }] : []),
    ...(unit.housing_form ? [{ label: "주택유형", value: unit.housing_form }] : []),
    ...(unit.exclusive_area_m2 !== undefined
      ? [{ label: "전용면적", value: `${unit.exclusive_area_m2.toFixed(2)}㎡${unit.total_area_m2 !== undefined ? ` (공용 포함 ${unit.total_area_m2.toFixed(2)}㎡)` : ""}` }]
      : []),
    ...(unit.rooms !== undefined ? [{ label: "방", value: `${unit.rooms}개` }] : []),
    ...(unit.floor !== undefined ? [{ label: "층", value: `${unit.floor < 0 ? `지하 ${Math.abs(unit.floor)}` : unit.floor}층${unit.elevator === false ? " · 승강기 없음" : unit.elevator ? " · 승강기 있음" : ""}` }] : []),
    ...(choice.km !== null && choice.km !== undefined ? [{ label: "직장까지", value: `직선거리 ${choice.km < 10 ? choice.km.toFixed(1) : choice.km.toFixed(0)}km` }] : []),
    ...(unit.viewing ? [{ label: "주택 열람", value: unit.viewing }] : []),
  ];

  return (
    <>
      <View style={{ gap: 4 }}>
        <T variant="heading">{choice.label}</T>
        {rent?.tier ? <Sub tone="3">{rent.tier} 기준</Sub> : null}
      </View>

      <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 18, paddingBottom: 8 }}>
        <Card style={{ gap: 14 }}>
          {/* 주소는 길다. 오른쪽 정렬 칸에 넣으면 폭이 모자라 잘리므로 한 줄 아래로 내려 다 보여 준다. */}
          <View style={{ gap: 3 }}>
            <Sub tone="3" variant="caption">주소</Sub>
            <T variant="bodyMedium" style={{ fontSize: 15 }}>{unit.address}</T>
          </View>
          {facts.map((f) => (
            <KeyValue key={f.label} label={f.label} value={f.value} />
          ))}
        </Card>

        {rent ? (
          <View style={{ gap: 10 }}>
            <SectionTitle>임대조건</SectionTitle>
            <Card style={{ gap: 14 }}>
              <KeyValue label="보증금" value={won(rent.deposit)} amount={rent.deposit} strong />
              <KeyValue label="월임대료" value={won(rent.monthly_rent)} amount={rent.monthly_rent} />
              {rent.maxConversion ? (
                <>
                  <KeyValue
                    label="보증금을 최대로 올리면"
                    value={won(rent.maxConversion.deposit)}
                    amount={rent.maxConversion.deposit}
                    note={`월임대료가 ${won(rent.maxConversion.monthly_rent)}으로 내려가요`}
                  />
                </>
              ) : null}
            </Card>
          </View>
        ) : null}

        {unit.transit || unit.nearby?.length ? (
          <View style={{ gap: 10 }}>
            <SectionTitle>이 집 주변</SectionTitle>
            <Card style={{ gap: 16 }}>
              {transitLines(unit.transit).map((t) => (
                <NearRow key={t.title} icon={t.icon} title={t.title} detail={t.detail} />
              ))}
              {nearbyLines(unit.nearby).map((n) => (
                <NearRow key={n.kind} icon={n.icon as IconName} title={n.title} detail={n.detail} />
              ))}
              <Sub tone="3" variant="caption">종류마다 가장 가까운 한 곳만 보여드리고, 모두 직선거리예요.</Sub>
            </Card>
          </View>
        ) : null}

        <Sub tone="3" variant="caption">
          공고문에 함께 붙은 공급주택목록에서 옮긴 값이에요. 평면도와 사진은 공고문 첨부에서 확인해 주세요.
        </Sub>
      </ScrollView>

      <PrimaryButton label="이 집으로 계산하기" onPress={onPick} />
    </>
  );
}
