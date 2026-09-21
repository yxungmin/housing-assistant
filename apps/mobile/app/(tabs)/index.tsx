import { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/icon";
import { animateLayout, BigNumber, Card, Chip, FadeIn, IconTile, Logo, Notice, Screen, SectionTitle, Sub, T, Tag } from "@/components/ui";
import { commuteKm, getAnnouncement, isReadable, listDistanceKm, matchAll, matching, type Matched, useAnnouncements } from "@/data/announcements";
import { daysUntil, dday, HOUSING_LABEL } from "@/lib/format";
import { isServiceRegion, SERVICE_REGION_LABEL } from "@housing/schema";
import { REGIONS } from "@/lib/onboarding";
import { commuteFor, commuteShort, splitStation } from "@/lib/commute";
import { isUnseen, unseenCount } from "@/lib/unseen";
import { useAppState } from "@/store/appState";
import { useTheme } from "@/theme/ThemeProvider";
import { fonts, radius } from "@/theme/tokens";

/** 직장 근처 필터의 직선거리 상한 (km). 통근 시간 API 연결 전 대체 기준 */
const NEAR_WORK_KM = 20;

/** 홈: "조건에 맞는 공고 N개" 한 문장과 큰 숫자로 시작한다. */
export default function Home() {
  const { state, noteSeen } = useAppState();
  const { colors } = useTheme();
  const router = useRouter();
  const [myRegionOnly, setMyRegionOnly] = useState(false);
  const [rentalOnly, setRentalOnly] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  const [showFar, setShowFar] = useState(false);
  const [nearWork, setNearWork] = useState(false);
  const feed = useAnnouncements();
  const hasWorkplace = !!state.profile?.workplace;

  const all = useMemo(() => matchAll(state.profile, feed.list), [state.profile, feed.list]);

  // 목록에 뜬 공고를 기록한다. 하이드레이션 전에 부르면 빈 목록이 기준선이 되어 전부 새 것이 된다.
  const feedIds = useMemo(() => feed.list.map((a) => a.id), [feed.list]);
  useEffect(() => {
    if (state.loaded && feedIds.length > 0) noteSeen(feedIds);
  }, [state.loaded, feedIds]);

  const filters = { myRegionOnly, rentalOnly, nearWork };
  /** 칩 조합 하나로 걸러 낸 결과. 칩마다 "켜면 몇 개 남나"를 세는 데도 같은 함수를 쓴다. */
  const apply = (f: typeof filters) =>
    all
      .filter((m) => {
        if (f.myRegionOnly && state.profile?.region_code && m.announcement.region_code !== state.profile.region_code) return false;
        if (f.rentalOnly && m.announcement.housing_type === "public_sale") return false;
        // 부부는 더 먼 쪽이 그 집의 통근 부담이다 (commuteKm). 한 사람만 가까운 집은 후보가 아니다.
        if (f.nearWork && hasWorkplace) { const km = commuteKm(m); if (km === null || km > NEAR_WORK_KM) return false; }
        return true;
      })
      .sort((x, y) => {
        if (f.nearWork && hasWorkplace) return (commuteKm(x) ?? 1e9) - (commuteKm(y) ?? 1e9);
        // 접수가 끝난 것은 무조건 뒤로. 아직 넣을 수 있는 공고가 위에 있어야 한다.
        const closed = (m: Matched) => ((daysUntil(m.announcement.apply_end) ?? 99) < 0 ? 1 : 0);
        const c = closed(x) - closed(y);
        if (c !== 0) return c;
        // 그다음은 가까운 곳이 먼저다. 마감만 보고 세우면 서울 사람 맨 위에 제주 공고가 온다.
        const region = state.profile?.region_code;
        const d = listDistanceKm(x, region) - listDistanceKm(y, region);
        return d !== 0 ? d : (x.announcement.apply_end ?? "").localeCompare(y.announcement.apply_end ?? "");
      });

  const filtered = useMemo(() => apply(filters), [all, myRegionOnly, rentalOnly, nearWork, hasWorkplace, state.profile?.region_code]);
  const matched = matching(filtered);
  const newCount = unseenCount(state.seen, feedIds);

  /**
   * 칩에 붙일 수: "이 칩을 켜면 조건에 맞는 공고가 몇 개 남나". 다른 칩은 지금 상태 그대로 둔다.
   * 누르기 전에 결과 크기를 알 수 있어야 칩이 고르는 도구가 된다 — 눌러 보고 0개면 그냥 헛걸음이다.
   * 큰 숫자와 같은 것(조건에 맞는 공고)을 세야 두 숫자가 따로 놀지 않는다.
   */
  const chipCount = useMemo(
    () => ({
      myRegionOnly: matching(apply({ ...filters, myRegionOnly: true })).length,
      rentalOnly: matching(apply({ ...filters, rentalOnly: true })).length,
      nearWork: matching(apply({ ...filters, nearWork: true })).length,
    }),
    [all, myRegionOnly, rentalOnly, nearWork, hasWorkplace, state.profile?.region_code],
  );
  const pending = filtered.filter((m) => !isReadable(m.announcement));
  // 거주 요건을 못 읽었고 공고 지역도 다른 것들. "맞지 않는다"와는 다른 말이라 따로 세운다 —
  // 우리는 맞는지 아닌지를 모르는 것이고, 모르는 것을 아는 척하면 그 자리에서 신뢰가 깎인다.
  const farAway = filtered.filter((m) => isReadable(m.announcement) && m.match?.region_uncertain);
  const others = filtered.filter((m) => isReadable(m.announcement) && !m.match?.is_match && !m.match?.region_uncertain);
  // 접수가 끝난 공고는 임박이 아니다. d가 음수인 것까지 넣으면 "마감"이 접수 임박 맨 위에 온다.
  const soon = matched.filter((m) => {
    const d = daysUntil(m.announcement.apply_end);
    return d !== null && d >= 0 && d <= 14;
  });
  const rest = matched.filter((m) => !soon.includes(m));
  const today = new Date();
  const regionLabel = REGIONS.find((r) => r.value === state.profile?.region_code)?.label ?? "내 지역";
  // 수집 범위 밖에 사는 사람에게는 목록이 거의 비어 보인다. 왜 비었는지 말하지 않으면
  // "나한테 맞는 게 없구나"로 읽힌다 — 사실은 우리가 아직 그 지역을 안 모으는 것이다.
  const outsideService = !isServiceRegion(state.profile?.region_code);
  const open = (id: string) => router.push(`/announcement/${id}`);
  const toggle = (setter: (f: (v: boolean) => boolean) => void) => () => {
    animateLayout();
    setter((v) => !v);
  };

  return (
    <Screen>
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
        <Chip on={myRegionOnly} count={chipCount.myRegionOnly} onPress={toggle(setMyRegionOnly)}>{regionLabel}만</Chip>
        <Chip on={rentalOnly} count={chipCount.rentalOnly} onPress={toggle(setRentalOnly)}>임대만</Chip>
        {hasWorkplace ? <Chip on={nearWork} count={chipCount.nearWork} onPress={toggle(setNearWork)}>직장 {NEAR_WORK_KM}km 이내</Chip> : null}
      </View>


      {outsideService ? (
        <Notice tone="info" icon="info">
          지금은 {SERVICE_REGION_LABEL} 공고만 모으고 있어요. {regionLabel} 공고는 아직 없어요.
        </Notice>
      ) : null}

      <FadeIn delay={120} style={{ gap: 20 }}>
        {soon.length > 0 ? <Section title="접수 임박" items={soon} onOpen={open} /> : null}
        {rest.length > 0 ? <Section title={soon.length ? "그 밖의 공고" : "조건에 맞는 공고"} items={rest} onOpen={open} /> : null}
        {matched.length === 0 ? (
          <Card style={{ alignItems: "center", paddingVertical: 32, gap: 8 }}>
            <IconTile name="bookmark" size={48} />
            <T variant="heading" style={{ fontSize: 18, textAlign: "center" }}>아직 조건에 맞는 공고가 없어요</T>
            <Sub style={{ textAlign: "center" }}>
              {outsideService
                ? `지금은 ${SERVICE_REGION_LABEL} 공고만 모으고 있어요. ${regionLabel}까지 넓히면 알려드릴게요.`
                : "새 공고가 올라오면 알려드릴게요. 내 정보에서 비어 있는 조건을 채우면 판별되는 공고가 늘어날 수 있어요."}
            </Sub>
          </Card>
        ) : null}
        {pending.length > 0 ? <Section title="조건 분석 중" items={pending} onOpen={open} /> : null}

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
                  다른 조건은 어긋나지 않지만, 공고문에서 거주 요건을 읽지 못했어요. 사는 지역이 달라 신청 가능한지는 공고문을 확인해 주세요.
                </Sub>
                <Section items={farAway} onOpen={open} />
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
      </FadeIn>

      <View style={{ flexDirection: "row", gap: 8, paddingTop: 8, paddingHorizontal: 4 }}>
        <Icon name="info" size={16} color={colors.text4} />
        <Sub tone="3" variant="caption" style={{ flex: 1 }}>
          지금은 {SERVICE_REGION_LABEL}의 LH·SH 공고만 모으고 있어요. "조건 일치"는 공고문 조건과 입력값을 비교한 결과이며 신청 자격을 보장하지 않아요.
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
  const days = daysUntil(a.apply_end);
  const units = [...new Set(a.extraction.tracks.flatMap((t) => t.unit_types.map((u) => u.name)))];
  const unitLabel = units.length ? units.slice(0, 3).join(" · ") + (units.length > 3 ? ` 외 ${units.length - 3}` : "") : "";
  const status =
    !isReadable(a)
      ? { tone: "warn" as const, icon: "alert" as const, text: "조건 분석 중" }
      : m.match?.is_match && m.matched > 0
        ? { tone: "primary" as const, icon: "check" as const, text: `조건 ${m.total}개 중 ${m.matched}개 일치${m.needsCheck ? ` · 확인 ${m.needsCheck}` : ""}` }
        : m.match?.is_match
          ? { tone: "warn" as const, icon: "alert" as const, text: `조건 ${m.needsCheck}개 확인 필요` }
          : m.match?.region_uncertain
            ? { tone: "warn" as const, icon: "alert" as const, text: "다른 지역 · 거주 요건 확인 필요" }
            : { tone: "danger" as const, icon: "x" as const, text: `조건 ${m.total}개 중 ${m.matched}개 일치` };
  // 직장을 넣었으면 통근이 먼저, 아니면 가장 가까운 역, 그것도 없으면 지역명
  const place =
    commuteShort(
      m.distanceKm,
      m.distancePartnerKm,
      commuteFor(a.commute, state.profile?.workplace?.label),
      commuteFor(a.commute, state.profile?.workplace_partner?.label),
    ) ??
    (a.transit?.nearest_station ? `${splitStation(a.transit.nearest_station).station} 도보 약 ${a.transit.station_walk_min}분` : a.region_name);

  return (
    <Card onPress={onPress} style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <Sub tone="3" variant="caption" lines={1} style={{ flex: 1 }}>{HOUSING_LABEL[a.housing_type]}{unitLabel ? ` · ${unitLabel}` : ""}</Sub>
        {days !== null ? <T variant="label" color={days <= 14 ? colors.danger : colors.text3} style={{ fontFamily: fonts.bold, flexShrink: 0 }}>{dday(a.apply_end)}</T> : null}
      </View>
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 7 }}>
          {/* 안 본 공고에 점 하나. 배지를 쓰면 제목을 밀어내고 줄바꿈을 흐트러뜨린다 */}
          {fresh ? <View accessibilityLabel="아직 안 본 공고" style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary, marginTop: 9 }} /> : null}
          <T variant="subheading" style={{ flex: 1, fontSize: 18, lineHeight: 26 }}>{a.title}</T>
        </View>
        {place ? <Sub tone="3">{place}</Sub> : null}
      </View>
      <View style={{ flexDirection: "row" }}>
        <Tag tone={status.tone} icon={status.icon}>{status.text}</Tag>
      </View>
    </Card>
  );
}
