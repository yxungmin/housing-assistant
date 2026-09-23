import { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/icon";
import { animateLayout, BigNumber, Card, Chip, FadeIn, IconTile, Logo, Notice, PrimaryButton, Screen, SectionTitle, Sub, T, Tag } from "@/components/ui";
import { commuteKm, getAnnouncement, isReadable, listDistanceKm, matchAll, matching, type Matched, useAnnouncements } from "@/data/announcements";
import { housingLabel } from "@/lib/format";
import { applyPhase, closesWithin, phaseLabel, phaseRank, phaseTone } from "@/lib/phase";
import { sizeText } from "@/lib/units";
import { isServiceRegion, SERVICE_REGION_LABEL } from "@housing/schema";
import { REGIONS, stepById, stepLabel } from "@/lib/onboarding";
import { topGap } from "@/lib/gaps";
import { commuteFor, commuteShort, nearestHouseShort, splitStation } from "@/lib/commute";
import { isUnseen, unseenCount } from "@/lib/unseen";
import { fundsFor, fundsNote } from "@/lib/funds";
import { syncAnnouncementsOnce } from "@/data/sync";
import { LOANS } from "@/data/loans";
import { useAppState } from "@/store/appState";
import { useTheme } from "@/theme/ThemeProvider";
import { fonts, radius } from "@/theme/tokens";

/** 직장 근처 필터의 직선거리 상한 (km). 통근 시간 API 연결 전 대체 기준 */
const NEAR_WORK_KM = 20;

/** "곧 마감" 칩이 잡는 날수. 서류를 준비할 수 있는 마지막 주 정도다 */
const CLOSING_SOON_DAYS = 7;

/** 홈: "조건에 맞는 공고 N개" 한 문장과 큰 숫자로 시작한다. */
export default function Home() {
  const { state, noteSeen, addChanges } = useAppState();
  const { colors } = useTheme();
  const router = useRouter();
  const [myRegionOnly, setMyRegionOnly] = useState(false);
  const [rentalOnly, setRentalOnly] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  const [showFar, setShowFar] = useState(false);
  const [showTarget, setShowTarget] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [nearWork, setNearWork] = useState(false);
  const [closingSoon, setClosingSoon] = useState(false);
  const feed = useAnnouncements();
  const [refreshing, setRefreshing] = useState(false);
  /**
   * 당겨서 새로고침. 앱을 열 때 한 번 받는 것과 같은 일을 사용자가 직접 부른다 —
   * 마감이 걸린 정보라 "지금 최신인가"를 확인할 길이 있어야 한다.
   * 바뀐 값이 있으면 앱을 열 때와 똑같이 알린다.
   */
  const refresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    void syncAnnouncementsOnce(state.saved, addChanges).finally(() => setRefreshing(false));
  };
  const hasWorkplace = !!state.profile?.workplace;
  // 분양이 하나도 없으면 "임대" 칩은 아무것도 걸러 내지 못한다
  const hasSale = feed.list.some((x) => x.housing_type === "public_sale");

  const all = useMemo(() => matchAll(state.profile, feed.list), [state.profile, feed.list]);

  // 목록에 뜬 공고를 기록한다. 하이드레이션 전에 부르면 빈 목록이 기준선이 되어 전부 새 것이 된다.
  const feedIds = useMemo(() => feed.list.map((a) => a.id), [feed.list]);
  useEffect(() => {
    if (state.loaded && feedIds.length > 0) noteSeen(feedIds);
  }, [state.loaded, feedIds]);

  const filters = { myRegionOnly, rentalOnly, nearWork, closingSoon };
  /** 칩 조합 하나로 걸러 낸 결과. 칩마다 "켜면 몇 개 남나"를 세는 데도 같은 함수를 쓴다. */
  const apply = (f: typeof filters) =>
    all
      .filter((m) => {
        if (f.myRegionOnly && state.profile?.region_code && m.announcement.region_code !== state.profile.region_code) return false;
        if (f.rentalOnly && m.announcement.housing_type === "public_sale") return false;
        // 부부는 더 먼 쪽이 그 집의 통근 부담이다 (commuteKm). 한 사람만 가까운 집은 후보가 아니다.
        if (f.nearWork && hasWorkplace) { const km = commuteKm(m); if (km === null || km > NEAR_WORK_KM) return false; }
        // "곧 마감"은 지금 접수 중인 것만. 끝난 공고나 아직 시작도 안 한 공고가 급한 척하면 안 된다 (lib/phase.ts)
        if (f.closingSoon && !closesWithin(applyPhase(m.announcement), CLOSING_SOON_DAYS)) return false;
        return true;
      })
      .sort((x, y) => {
        if (f.nearWork && hasWorkplace) return (commuteKm(x) ?? 1e9) - (commuteKm(y) ?? 1e9);
        // 접수 중 → 접수 전 → 마감. 지금 넣을 수 있는 공고가 위에 있어야 한다.
        const c = phaseRank(applyPhase(x.announcement)) - phaseRank(applyPhase(y.announcement));
        if (c !== 0) return c;
        // 그다음은 가까운 곳이 먼저다. 마감만 보고 세우면 서울 사람 맨 위에 제주 공고가 온다.
        const region = state.profile?.region_code;
        const d = listDistanceKm(x, region) - listDistanceKm(y, region);
        return d !== 0 ? d : (x.announcement.apply_end ?? "").localeCompare(y.announcement.apply_end ?? "");
      });

  const filtered = useMemo(() => apply(filters), [all, myRegionOnly, rentalOnly, nearWork, closingSoon, hasWorkplace, state.profile?.region_code]);
  /**
   * 접수가 끝난 공고는 목록에서 내려가기 전 일주일 동안 남아 있다(서버 뷰 기준). 그동안
   * "내 조건에 맞는 공고" 수에 세면 지금 넣을 수 없는 공고를 추천하는 셈이 된다.
   * 큰 숫자·칩 숫자·섹션 모두 접수 중이거나 접수 전인 것만 세고, 끝난 것은 맨 아래에 따로 둔다.
   */
  const live = (list: Matched[]) => list.filter((m) => applyPhase(m.announcement).kind !== "closed");
  const active = live(filtered);
  const closedList = filtered.filter((m) => applyPhase(m.announcement).kind === "closed");
  const matched = matching(active);
  const newCount = unseenCount(state.seen, feedIds);

  /**
   * 칩에 붙일 수: "이 칩을 켜면 조건에 맞는 공고가 몇 개 남나". 다른 칩은 지금 상태 그대로 둔다.
   * 누르기 전에 결과 크기를 알 수 있어야 칩이 고르는 도구가 된다 — 눌러 보고 0개면 그냥 헛걸음이다.
   * 큰 숫자와 같은 것(조건에 맞는 공고)을 세야 두 숫자가 따로 놀지 않는다.
   */
  const chipCount = useMemo(
    () => ({
      myRegionOnly: matching(live(apply({ ...filters, myRegionOnly: true }))).length,
      rentalOnly: matching(live(apply({ ...filters, rentalOnly: true }))).length,
      nearWork: matching(live(apply({ ...filters, nearWork: true }))).length,
      closingSoon: matching(live(apply({ ...filters, closingSoon: true }))).length,
    }),
    [all, myRegionOnly, rentalOnly, nearWork, closingSoon, hasWorkplace, state.profile?.region_code],
  );
  const pending = active.filter((m) => !isReadable(m.announcement));
  // 거주 요건을 못 읽었고 공고 지역도 다른 것들. "맞지 않는다"와는 다른 말이라 따로 세운다 —
  // 우리는 맞는지 아닌지를 모르는 것이고, 모르는 것을 아는 척하면 그 자리에서 신뢰가 깎인다.
  const farAway = active.filter((m) => isReadable(m.announcement) && m.match?.region_uncertain);
  // 대상 계층(수급자·국가유공자 등)만 신청할 수 있는 공고인데 해당 계층을 모르는 것들.
  // "맞지 않는다"로 세면 실제 대상인 사람이 못 보고, "맞는다"로 세면 대상이 아닌 사람에게 추천이 된다.
  const needsTarget = active.filter((m) => isReadable(m.announcement) && m.match?.status_uncertain);
  const others = active.filter((m) => isReadable(m.announcement) && !m.match?.is_match && !m.match?.region_uncertain && !m.match?.status_uncertain);
  // "접수 임박"은 지금 접수 중인 것만. 아직 시작 안 한 공고는 "곧 접수 시작"으로 따로 세운다.
  const soon = matched.filter((m) => closesWithin(applyPhase(m.announcement), 14));
  const upcoming = matched
    .filter((m) => applyPhase(m.announcement).kind === "upcoming")
    .sort((x, y) => (x.announcement.apply_start ?? "").localeCompare(y.announcement.apply_start ?? ""));
  const rest = matched.filter((m) => !soon.includes(m) && !upcoming.includes(m));
  const today = new Date();
  const regionLabel = REGIONS.find((r) => r.value === state.profile?.region_code)?.label ?? "내 지역";
  // 수집 범위 밖에 사는 사람에게는 목록이 거의 비어 보인다. 왜 비었는지 말하지 않으면
  // "나한테 맞는 게 없구나"로 읽힌다 — 사실은 우리가 아직 그 지역을 안 모으는 것이다.
  const outsideService = !isServiceRegion(state.profile?.region_code);

  /**
   * 빈칸 하나를 권한다 (lib/gaps.ts). 전부가 아니라 가장 많이 푸는 하나만, 푸는 공고 수와 함께.
   * 무엇을 얻는지 말하지 않는 "정보를 더 넣어 주세요"는 잘 안 먹힌다.
   * 마감된 공고는 세지 않는다 — 판별돼도 할 수 있는 일이 없다.
   * 닫으면 이번에 켠 동안만 숨긴다. 다음에 열 때 다시 한 번 권하는 정도가 잔소리와 무시 사이다.
   */
  const gap = useMemo(
    () => topGap(all.filter((m) => isReadable(m.announcement) && applyPhase(m.announcement).kind !== "closed"), state.profile),
    [all, state.profile],
  );
  const gapStep = gap && state.profile ? stepById(state.profile, gap.stepId) : undefined;
  const [gapHidden, setGapHidden] = useState<string | null>(null);
  const showGap = !!gap && !!gapStep && gapHidden !== gap.stepId;
  const open = (id: string) => router.push(`/announcement/${id}`);
  const toggle = (setter: (f: (v: boolean) => boolean) => void) => () => {
    animateLayout();
    setter((v) => !v);
  };

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <FadeIn style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingTop: 28 }}>
        <View style={{ gap: 6 }}>
          <T variant="body" color={colors.text2}>내 조건에 맞는 공고</T>
          <BigNumber value={String(matched.length)} unit="개" size={44} />
          <Sub tone="3">
            {today.getMonth() + 1}월 {today.getDate()}일 기준 · 전체 공고 {feed.list.length}개
            {newCount > 0 ? ` · 새 공고 ${newCount}개` : ""}
          </Sub>
        </View>
        <Logo size={56} />
      </FadeIn>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {/*
          "~만"은 빼는 말이다. 필터는 좁히는 동작이지만 사람에게 당기는 건 **찾는 말**이라
          "서울만" 대신 "서울"로 둔다 — 켜진 상태는 색으로 이미 보인다.
          "직장 직선 20km 이내"는 우리 구현 사정이지 사용자의 말이 아니다.
          장소("직장")가 아니라 사람이 하는 일("출퇴근")로 부른다 — 후자가 훨씬 가깝게 들린다.
          그리고 **고를 수 없는 칩은 띄우지 않는다.** 분양이 한 건도 없으면 "임대"를 눌러도
          결과가 그대로다 — 아무 일도 일어나지 않는 버튼은 신뢰를 깎는다.
        */}
        {/* 곧 마감이 한 건도 없으면 누를 이유가 없다. 켜 둔 채로 0이 된 경우만 끌 수 있게 남긴다 */}
        {closingSoon || chipCount.closingSoon > 0 ? <Chip on={closingSoon} count={chipCount.closingSoon} onPress={toggle(setClosingSoon)}>곧 마감</Chip> : null}
        <Chip on={myRegionOnly} count={chipCount.myRegionOnly} onPress={toggle(setMyRegionOnly)}>{regionLabel}</Chip>
        {hasSale ? <Chip on={rentalOnly} count={chipCount.rentalOnly} onPress={toggle(setRentalOnly)}>임대</Chip> : null}
        {hasWorkplace ? <Chip on={nearWork} count={chipCount.nearWork} onPress={toggle(setNearWork)}>출퇴근 가까운 곳</Chip> : null}
      </View>


      {outsideService ? (
        <Notice tone="info" icon="info">
          지금은 {SERVICE_REGION_LABEL} 공고만 모으고 있어요. {regionLabel} 공고는 아직 없어요.
        </Notice>
      ) : null}

      {showGap ? (
        // 카드 전체를 누를 수 있게 하면 닫기 버튼이 그 안에 들어가 버튼 속의 버튼이 된다. 둘을 나란히 둔다.
        <View style={{ flexDirection: "row", alignItems: "center", borderRadius: radius.md, backgroundColor: colors.primarySoft }}>
          <Pressable
            onPress={() => router.push(`/onboarding?step=${gap!.stepId}`)}
            accessibilityRole="button"
            accessibilityLabel={`${stepLabel(gapStep!)} 입력하기`}
            style={({ pressed }) => ({ flex: 1, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingLeft: 16, opacity: pressed ? 0.7 : 1 })}
          >
            <IconTile name="check-circle" tone="primary" size={36} />
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="bodyMedium" color={colors.text} style={{ fontSize: 15 }}>
                {stepLabel(gapStep!)}만 넣으면
              </T>
              <Sub tone="2">공고 {gap!.announcements}개의 조건을 더 판별할 수 있어요</Sub>
            </View>
            <Icon name="right" size={18} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={() => { animateLayout(); setGapHidden(gap!.stepId); }}
            accessibilityRole="button"
            accessibilityLabel="이 권유 닫기"
            hitSlop={8}
            style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 16, opacity: pressed ? 0.5 : 1 })}
          >
            <Icon name="x" size={16} color={colors.text3} />
          </Pressable>
        </View>
      ) : null}

      <FadeIn delay={120} style={{ gap: 20 }}>
        {soon.length > 0 ? <Section title="접수 임박" items={soon} onOpen={open} /> : null}
        {upcoming.length > 0 ? <Section title="곧 접수 시작" items={upcoming} onOpen={open} /> : null}
        {rest.length > 0 ? <Section title={soon.length || upcoming.length ? "그 밖의 공고" : "조건에 맞는 공고"} items={rest} onOpen={open} /> : null}
        {/*
          맞는 공고가 없을 때가 중요하다. 억지로 채우면 추천이 아니라 목록이 된다.
          없다고 말하고, 생기면 알려 주겠다고 하고, 그동안 볼 것을 준다 — 이 셋이 다 있어야
          빈 화면이 막다른 길이 되지 않는다.
          알림이 꺼져 있으면 "알려드릴게요"라고 하지 않는다. 실제로 안 가기 때문이다.
        */}
        {matched.length === 0 ? (
          <Card style={{ alignItems: "center", paddingVertical: 28, gap: 10 }}>
            <IconTile name="bookmark" size={48} />
            <T variant="heading" style={{ fontSize: 18, textAlign: "center" }}>
              {outsideService ? `아직 ${regionLabel} 공고는 모으지 않아요` : "지금은 딱 맞는 공고가 없어요"}
            </T>
            <Sub style={{ textAlign: "center" }}>
              {outsideService
                ? `지금은 ${SERVICE_REGION_LABEL} 공고만 모으고 있어요.`
                : state.notifications
                  ? "조건에 맞는 공고가 새로 올라오면 알려드릴게요."
                  : "새 공고 알림을 켜 두면 조건에 맞는 공고가 올라올 때 알려드려요."}
            </Sub>
            {!outsideService && !state.notifications ? (
              <PrimaryButton tone="soft" label="알림 켜기" onPress={() => router.push("/profile")} />
            ) : null}
            {others.length + farAway.length + needsTarget.length + pending.length > 0 ? (
              <Pressable
                onPress={() => {
                  animateLayout();
                  setShowOthers(true);
                  setShowFar(true);
                  setShowTarget(true);
                }}
                accessibilityRole="button"
                style={({ pressed }) => ({ paddingVertical: 10, paddingHorizontal: 8, opacity: pressed ? 0.6 : 1 })}
              >
                <T variant="small" color={colors.text3}>
                  그동안 다른 공고 {others.length + farAway.length + needsTarget.length + pending.length}개 보기
                </T>
              </Pressable>
            ) : null}
          </Card>
        ) : null}
        {pending.length > 0 ? <Section title="조건을 아직 못 읽음" items={pending} onOpen={open} /> : null}

        {farAway.length > 0 ? (
          <View style={{ gap: 12 }}>
            <Pressable onPress={toggle(setShowFar)} accessibilityRole="button" style={({ pressed }) => ({ paddingVertical: 14, paddingHorizontal: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between", opacity: pressed ? 0.6 : 1 })}>
              <T variant="bodyMedium" color={colors.text2}>다른 지역 공고 {farAway.length}개</T>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                <T variant="small" color={colors.text3}>{showFar ? "숨기기" : "보기"}</T>
                <Icon name="right" size={16} color={colors.text4} />
              </View>
            </Pressable>
            {showFar ? (
              <>
                <Sub tone="3" variant="caption" style={{ paddingHorizontal: 4 }}>
                  다른 조건은 어긋나지 않지만, 공고문에서 거주 요건을 읽지 못했어요. 사는 지역이 달라 신청할 수 있는지는 공고문을 확인해 주세요.
                </Sub>
                <Section items={farAway} onOpen={open} />
              </>
            ) : null}
          </View>
        ) : null}

        {needsTarget.length > 0 ? (
          <View style={{ gap: 12 }}>
            <Pressable onPress={toggle(setShowTarget)} accessibilityRole="button" style={({ pressed }) => ({ paddingVertical: 14, paddingHorizontal: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between", opacity: pressed ? 0.6 : 1 })}>
              <T variant="bodyMedium" color={colors.text2}>신청 대상을 확인할 공고 {needsTarget.length}개</T>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                <T variant="small" color={colors.text3}>{showTarget ? "숨기기" : "보기"}</T>
                <Icon name="right" size={16} color={colors.text4} />
              </View>
            </Pressable>
            {showTarget ? (
              <>
                <Sub tone="3" variant="caption" style={{ paddingHorizontal: 4 }}>
                  대학생·수급자·장애인처럼 정해진 대상만 신청할 수 있는 공고예요.
                  {state.profile?.statuses === undefined ? " 해당하는 게 있는지 알려 주시면 맞는지 바로 가려 드릴게요." : " 입력하신 계층으로는 대상인지 알 수 없어서, 공고문의 자격을 확인해 주세요."}
                </Sub>
                {/* 계층은 첫 온보딩에서 묻지 않는다. 그래서 이 묶음이 가장 흔하게 생기는 이유는 "안 넣어서"다 — 그 자리에서 넣게 한다 */}
                {state.profile?.statuses === undefined ? (
                  <PrimaryButton tone="soft" label="해당하는 계층 알려 주기" onPress={() => router.push("/onboarding?step=statuses")} />
                ) : null}
                <Section items={needsTarget} onOpen={open} />
              </>
            ) : null}
          </View>
        ) : null}

        {others.length > 0 ? (
          <Pressable onPress={toggle(setShowOthers)} accessibilityRole="button" style={({ pressed }) => ({ paddingVertical: 14, paddingHorizontal: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between", opacity: pressed ? 0.6 : 1 })}>
            <T variant="bodyMedium" color={colors.text2}>조건이 맞지 않는 공고 {others.length}개</T>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
              <T variant="small" color={colors.text3}>{showOthers ? "숨기기" : "보기"}</T>
              <Icon name="right" size={16} color={colors.text4} />
            </View>
          </Pressable>
        ) : null}
        {showOthers && others.length > 0 ? <Section items={others} onOpen={open} /> : null}

        {closedList.length > 0 ? (
          <View style={{ gap: 12 }}>
            <Pressable onPress={toggle(setShowClosed)} accessibilityRole="button" style={({ pressed }) => ({ paddingVertical: 14, paddingHorizontal: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between", opacity: pressed ? 0.6 : 1 })}>
              <T variant="bodyMedium" color={colors.text2}>접수가 끝난 공고 {closedList.length}개</T>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                <T variant="small" color={colors.text3}>{showClosed ? "숨기기" : "보기"}</T>
                <Icon name="right" size={16} color={colors.text4} />
              </View>
            </Pressable>
            {showClosed ? (
              <>
                <Sub tone="3" variant="caption" style={{ paddingHorizontal: 4 }}>
                  접수가 끝나고 일주일 동안 보여드려요. 신청했다면 당첨자 발표 일정을 확인해 보세요.
                </Sub>
                <Section items={closedList} onOpen={open} />
              </>
            ) : null}
          </View>
        ) : null}
      </FadeIn>

      <View style={{ flexDirection: "row", gap: 8, paddingTop: 8, paddingHorizontal: 4 }}>
        <Icon name="info" size={16} color={colors.text4} />
        <Sub tone="3" variant="caption" style={{ flex: 1 }}>
          지금은 {SERVICE_REGION_LABEL}의 LH·SH 공고만 모으고 있어요. "조건 일치"는 공고문 조건과 입력한 값을 맞춰 본 결과예요. 신청 자격을 보장하지는 않아요.
        </Sub>
      </View>
    </Screen>
  );
}

function Section({ title, items, onOpen }: { title?: string; items: Matched[]; onOpen: (id: string) => void }) {
  return (
    <View style={{ gap: 12 }}>
      {title ? <SectionTitle>{title}</SectionTitle> : null}
      {items.map((m) => <AnnouncementCard key={m.announcement.id} m={m} onPress={() => onOpen(m.announcement.id)} />)}
    </View>
  );
}

export function AnnouncementCard({ m, onPress }: { m: Matched; onPress: () => void }) {
  const { colors } = useTheme();
  const { state } = useAppState();
  const a = m.announcement;
  const fresh = isUnseen(state.seen, a.id);
  const phase = applyPhase(a);
  const phaseText = phaseLabel(phase);
  const phaseColor = { danger: colors.danger, info: colors.info, gray: colors.text3 }[phaseTone(phase)];
  const unitLabel = sizeText(a);
  const status =
    !isReadable(a)
      ? { tone: "warn" as const, icon: "alert" as const, text: "조건을 아직 못 읽음" }
      /*
       * 확인 필요가 남았으면 초록 체크를 붙이지 않는다.
       * 체크는 "다 됐다"는 신호인데, 8개 중 4개만 확인된 자리에 붙으면 색이 내용보다
       * 낙관적이다. 사용자는 글보다 색을 먼저 읽는다.
       */
      : m.match?.is_match && m.matched > 0 && !m.needsCheck
        ? { tone: "primary" as const, icon: "check" as const, text: `조건 ${m.total}개 중 ${m.matched}개 일치` }
      : m.match?.is_match && m.matched > 0
        ? { tone: "gray" as const, icon: "info" as const, text: `조건 ${m.total}개 중 ${m.matched}개 일치 · 확인 필요 ${m.needsCheck}개` }
        : m.match?.is_match
          ? { tone: "warn" as const, icon: "alert" as const, text: `조건 ${m.needsCheck}개 확인 필요` }
          : m.match?.region_uncertain
            ? { tone: "warn" as const, icon: "alert" as const, text: "다른 지역 · 거주 요건 확인 필요" }
          : m.match?.status_uncertain
            ? { tone: "warn" as const, icon: "alert" as const, text: "신청 대상 확인 필요" }
            : { tone: "danger" as const, icon: "x" as const, text: `조건 ${m.total}개 중 ${m.matched}개 일치` };
  // 직장을 넣었으면 통근이 먼저, 아니면 가장 가까운 역, 그것도 없으면 지역명
  // 조건이 맞아도 보증금을 못 대면 못 간다. 그 사실만 무료로 알리고 금액은 비용 화면(유료)에서 본다.
  const funds = useMemo(() => fundsFor(a, state.profile, LOANS), [a, state.profile]);
  const note = m.match?.is_match ? fundsNote(funds) : null;

  const place = m.nearestHouse
    ? nearestHouseShort(m.distanceKm, m.distancePartnerKm) ?? a.region_name
    : commuteShort(
      m.distanceKm,
      m.distancePartnerKm,
      commuteFor(a.commute, state.profile?.workplace?.label),
      commuteFor(a.commute, state.profile?.workplace_partner?.label),
    ) ??
    (a.transit?.nearest_station ? `${splitStation(a.transit.nearest_station).station} 도보 약 ${a.transit.station_walk_min}분` : a.region_name);

  return (
    <Card onPress={onPress} style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
          {/* 기관을 먼저 보여 준다 — 같은 조건이라도 신청처와 절차가 다르다 */}
          {a.provider ? <Tag tone="gray">{a.provider}</Tag> : null}
          <Sub tone="3" variant="caption" lines={1} style={{ flex: 1 }}>{housingLabel(a)}{unitLabel ? ` · ${unitLabel}` : ""}</Sub>
        </View>
        {phaseText ? <T variant="label" color={phaseColor} style={{ fontFamily: fonts.bold, flexShrink: 0 }}>{phaseText}</T> : null}
      </View>
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 7 }}>
          {/* 안 본 공고에 점 하나. 배지를 쓰면 제목을 밀어내고 줄바꿈을 흐트러뜨린다 */}
          {fresh ? <View accessibilityLabel="아직 안 본 공고" style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary, marginTop: 9 }} /> : null}
          <T variant="subheading" style={{ flex: 1, fontSize: 18, lineHeight: 26 }}>{a.title}</T>
        </View>
        {place ? <Sub tone="3">{place}</Sub> : null}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Tag tone={status.tone} icon={status.icon}>{status.text}</Tag>
        {/* 조건이 맞는 공고에만 붙인다 — 애초에 자격이 안 되는 공고에서 돈 이야기를 하면 소음이다 */}
        {note ? <Tag tone="warn" icon="alert">{note}</Tag> : null}
      </View>
    </Card>
  );
}
