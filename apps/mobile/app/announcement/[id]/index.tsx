import { useEffect, useMemo, useRef, useState } from "react";
import { goBackOrHome } from "@/lib/nav";
import { useLocalSearchParams, useRouter } from "expo-router";
import Constants from "expo-constants";
import { Pressable, View } from "react-native";
import { expectedRank, haversineKm, matchAnnouncement, RANK_VS_PAST_LABEL, rankVsPast, type RuleResult, pastResultText, toughest } from "@housing/engine";
import { Icon, type IconName } from "@/components/icon";
import { ReportSheet } from "@/components/ReportSheet";
import { NoticeImages } from "@/components/NoticeImages";
import { SignInButtons } from "@/components/SignIn";
import { canSeeAnnouncement } from "@/lib/access";
import { SourceCard } from "@/components/SourceCard";
import { MissingAnnouncement } from "@/components/MissingAnnouncement";
import { animateLayout, InfoTip, LockNote, BottomCTA, BottomSheet, Card, ConditionRow, Header, IconButton, IconTile, KeyValue, Notice, PrimaryButton, Screen, SectionTitle, Sub, T, Tag, Toast } from "@/components/ui";
import { getAnnouncement, isReadable, ruleCounts, useAnnouncements, type Nearby } from "@/data/announcements";
import { inputSummary, missingStepFor, ruleTitle } from "@/lib/conditions";
import { userFacingNotes } from "@/lib/notes";
import { isScattered, unitLabel, unitSpec, unitsWithDistance, priceRange, rangeText } from "@/lib/units";
import { dateRange, dateText, daysUntil, housingLabel, longDate, looseDate, manwon } from "@/lib/format";
import { applyPhase, phaseLabel, phaseTone } from "@/lib/phase";
import { applyLink, openApply } from "@/lib/apply";
import { unseenChange } from "@/lib/changes";
import { draftReport, findReport, REPORT_STATUS_LABEL, type ReportTarget } from "@/lib/reports";
import { commuteDetail, commuteFor, commuteLines, mapPlace, nearbyLines, openMapTarget, transitLines } from "@/lib/commute";
import { mapTargets } from "@/lib/maps";
import { canOpenCost, useAppState } from "@/store/appState";
import { SubscriptionSheet } from "@/components/SubscriptionSheet";
import { useTheme } from "@/theme/ThemeProvider";
import { iconSize, radius, space } from "@/theme/tokens";

/** 공고 상세: 조건 체크리스트(근거 쪽), 위치, 일정, 비용 계산 CTA */
export default function AnnouncementDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { state, toggleSaved, toggleApplied, addReport, seeChange, openAnnouncement } = useAppState();
  const { list } = useAnnouncements();
  const a = getAnnouncement(id ?? "", list);
  // 동기화가 화면을 연 뒤에 끝날 수도 있으니 계속 지켜보다가, 오면 그때 집어서 들고 있는다.
  // (본 것으로 표시하면 목록에서 사라지므로 이 화면에서는 따로 붙들어 둔다.)
  const incoming = unseenChange(state.changes, id ?? "");
  const [change, setChange] = useState(incoming);
  const [notesOpen, setNotesOpen] = useState(false);
  const [report, setReport] = useState<{ target: ReportTarget; sourceText?: string } | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  /** 북마크를 **방금** 눌렀을 때만 뜬다. 늘 띄우면 소음이 된다 */
  const [justSaved, setJustSaved] = useState(false);
  // 네이버 지도는 호출한 앱의 식별자를 요구한다 (없으면 앱만 열리고 아무 일도 안 한다)
  const APP_ID = Constants.expoConfig?.ios?.bundleIdentifier ?? "com.yxungmin.housingassistant";
  const place = a ? mapPlace(a) : null;
  // 닫히는 동안에도 내용이 보여야 시트가 빈 채로 내려가지 않는다
  const lastReport = useRef<{ target: ReportTarget; sourceText?: string } | null>(null);
  if (report) lastReport.current = report;
  const to = (w: { lat: number; lng: number } | undefined) =>
    a && w && a.lat !== undefined && a.lng !== undefined ? haversineKm(w, { lat: a.lat, lng: a.lng }) : null;
  // 미리 계산해 둔 통근 시간이 이 사람 시군구에 있는가. 있으면 문구가 달라진다.
  const hasCommuteTime = !!commuteFor(a?.commute, state.profile?.workplace?.label) || !!commuteFor(a?.commute, state.profile?.workplace_partner?.label);
  const distanceKm = to(state.profile?.workplace);
  const distancePartnerKm = to(state.profile?.workplace_partner);

  const match = useMemo(() => (a && isReadable(a) && state.profile ? matchAnnouncement(a.extraction, state.profile, { announcement_region: a.region_code, announcement_title: a.title }) : null), [a, state.profile]);
  const track = match?.best_track ?? (match ? [...match.tracks].sort((x, y) => y.summary.matched - x.summary.matched)[0] ?? null : null);
  // 흩어진 공고는 임대조건이 공고문 본문이 아니라 주택 목록에 집마다 붙어 있다.
  // 목록을 읽었으면 계산할 수 있다 — 고르는 단위가 주택형이 아니라 집일 뿐이다.
  const hasUnitPricing = !!a?.units?.some((u) => u.deposit !== undefined);
  const hasRental = hasUnitPricing || !!a?.extraction.tracks.some((t) => t.pricing.some((p) => p.kind === "rental"));
  // 가격이 아예 없는 공고를 "분양"이라고 하면 사실이 아니다. 두 경우를 나눠 말한다.
  const hasAnyPricing = !!a?.extraction.tracks.some((t) => t.pricing.length > 0);
  const saved = !!a && state.saved.includes(a.id);

  /**
   * 북마크가 알림과 이어져 있다는 걸 **누르는 자리에서** 알린다.
   *
   * 전에는 아이콘만 채워지고 아무 말이 없었다. "마감 3일 전에 알려드려요"는 관심 탭에
   * 가야 나오는데, 그 탭을 열기 전에는 북마크가 무엇을 하는지 알 수가 없다.
   * 바로 아래 "신청함" 표시에는 설명이 붙어 있어 일관성도 없었다.
   *
   * 알림이 꺼져 있으면 "알려드려요"라고 하지 않는다 — 실제로 안 가기 때문이다.
   * 대신 켜는 길을 준다.
   */
  const save = () => {
    if (!a) return;
    const adding = !saved;
    toggleSaved(a.id);
    setJustSaved(adding);
  };
  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 4000);
    return () => clearTimeout(t);
  }, [justSaved]);
  const applied = !!a && state.applied.includes(a.id);
  // 발표일이 날짜로 적힌 공고만 알림을 걸 수 있다 ("2027년 2월"처럼 월까지만 있는 경우가 있다)
  const announceDate = /^\d{4}-\d{2}-\d{2}$/.test(a?.extraction.schedule.winner_announce?.trim() ?? "");
  // 날짜로 적힌 발표일이 이미 지났는가. "4월 예정"처럼 날짜가 아니면 모르므로 지나지 않은 것으로 둔다
  const announced = announceDate && (daysUntil(a?.extraction.schedule.winner_announce?.trim()) ?? 0) < 0;

  // seeChange는 상태가 바뀔 때마다 새로 만들어진다. 막지 않으면
  // 표시 → 상태 변경 → 새 함수 → 다시 표시로 무한히 돈다. 한 번만 부른다.
  const marked = useRef(false);
  useEffect(() => {
    if (!incoming || marked.current) return;
    marked.current = true;
    setChange(incoming);
    seeChange(incoming.announcementId);
  }, [incoming, seeChange]);

  // 열었으면 "새 공고" 점을 지운다. 위와 같은 이유로 한 번만 부른다.
  const opened = useRef(false);
  useEffect(() => {
    if (!id || opened.current) return;
    opened.current = true;
    openAnnouncement(id);
  }, [id, openAnnouncement]);

  // 구독 시트 상태. 아래 두 조기 return(공고 없음·로그인 전)보다 **위**에 있어야 한다 —
  // 로그인 전 화면에서 로그인하면 같은 컴포넌트가 본 화면으로 바뀌는데, 그때 훅이 하나 늘면
  // "Rendered more hooks than during the previous render"로 죽는다 (2026-09-24 감사에서 발견).
  const [subSheet, setSubSheet] = useState(false);

  if (!a) return <MissingAnnouncement />;

  /*
   * 로그인은 **여기서** 받는다. 목록은 그대로 보여 주고, 공고를 열려는 순간에 묻는다.
   *
   * 화면을 바꾸지 않고 이 자리에서 처리하는 이유는 히스토리 때문이다.
   * 로그인 뒤 `router.push`로 되돌려 보내면 뒤로 가기에 그 공고가 두 번 쌓이거나,
   * 잘못하면 로그인 화면으로 돌아간다. 같은 화면이 내용으로 바뀌면 뒤로 가기는 그냥 목록이다.
   * 딥링크로 바로 들어온 경우도 이 한 갈래가 같이 처리한다.
   *
   * 제목과 마감은 가리지 않는다. 무엇을 보려고 로그인하는지 모르면 로그인할 이유도 없다.
   */
  if (!canSeeAnnouncement(state)) {
    return (
      <Screen header={<Header onBack={() => goBackOrHome(router)} />}>
        <View style={{ gap: 10, paddingTop: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {a.provider ? <Tag tone="gray">{a.provider}</Tag> : null}
            <Tag tone="gray">{housingLabel(a)}</Tag>
            {phaseLabel(applyPhase(a)) ? <Tag tone={phaseTone(applyPhase(a))}>{phaseLabel(applyPhase(a))}</Tag> : null}
          </View>
          <T variant="heading">{a.title}</T>
          <Sub variant="body">{a.address ?? a.region_name}</Sub>
        </View>
        <LockNote
          title="로그인하면 내 조건과 맞는지 알려 드려요"
          body="입력하신 조건과 공고문을 한 줄씩 비교해서 보여드려요. 소득·자산처럼 적어 두신 값은 이 기기에만 저장돼요."
        />
        <SignInButtons />
      </Screen>
    );
  }
  const counts = track ? ruleCounts(track) : { matched: 0, needsCheck: 0, total: 0 };
  // 자격과 순위는 다른 질문이다. 순위 기준을 읽은 공고에서만 (engine/rank.ts)
  const rank = track && state.profile ? expectedRank(track.track, state.profile) : null;
  /*
   * 예상 순위는 유료다 (2026-09-24 결정). 조건 매칭(되느냐)은 무료, 순위·비용처럼 우리가 계산해 주는 값은 구독.
   * 잠겼어도 공고 자체의 사실은 가리지 않는다 — 순위별 접수일은 잘못 내면 부적격이라 누구에게나 보여 준다.
   */
  const rankLocked = !canOpenCost(state);
  const rankDates = (() => {
    const byDate = new Map<string, number[]>();
    for (const r of track?.track.priority_ranks ?? []) if (r.apply_date) byDate.set(r.apply_date, [...(byDate.get(r.apply_date) ?? []), r.rank]);
    return [...byDate.entries()].map(([d, rs]) => `${rs.sort((x, y) => x - y).join("·")}순위 ${longDate(d)}`).join(" · ");
  })();
  // "되면 얼마나 살 수 있나". 전에는 notes 글("최장 30년 거주")에 묻혀 있었다
  const res = track?.track.residence;
  const residenceText = res && (res.max_years || res.contract_years)
    ? {
        value: res.max_years ? `최장 ${res.max_years}년` : `${res.contract_years}년 계약`,
        note: [res.max_years && res.contract_years ? `${res.contract_years}년마다 재계약` : null, res.note ?? null].filter(Boolean).join(" · ") || undefined,
      }
    : null;
  const selection = track?.track.selection_order?.map((x) => ({ rank: "순위", score: "배점", lottery: "추첨" })[x]).join(" → ");
  const notes = userFacingNotes(a.extraction.notes);
  /**
   * 집이 흩어져 있는 공고는 좌표가 하나일 수 없다.
   * 그런데 주소가 "서울특별시"뿐이라 지오코딩이 시청 좌표를 돌려줬고, 통근 시간과 주변 시설이
   * 전부 시청 기준으로 계산돼 화면에 올라가 있었다 (2026-09-22 확인). 없느니만 못한 정보다.
   * 그래서 위치 섹션을 통째로 끄고, 대신 고를 수 있는 집 목록을 보여 준다.
   */
  const scattered = isScattered(a);
  // 흩어진 집을 한 채씩 주는 유형인가 (매입임대·전세임대). 아니면 여러 단지를 한 번에 모집하는 공고다
  const houses = a.housing_type === "purchased_rental" || /전세임대/.test(a.title);
  const nearby3 = a.units?.length ? unitsWithDistance(a.units, state.profile).slice(0, 3) : [];
  const trackIndex = track ? a.extraction.tracks.indexOf(track.track) : -1;
  /**
   * 값이 없어 판별을 못 한 줄에 "지금 입력하기"를 단다.
   * 그 줄이 할 수 있는 말은 "입력하면 판별할 수 있어요"뿐인데, 그러려면 내 정보로 나가서 항목을 찾아야 했다.
   * 여기서 바로 넣고 돌아오면 그 자리에서 판정이 끝난다.
   */
  const fillProps = (r: RuleResult) => {
    if (r.status !== "NEEDS_CHECK" || r.skipped) return {};
    const step = missingStepFor(r.rule, state.profile);
    return step ? { onFill: () => router.push(`/onboarding?step=${step}`) } : {};
  };

  /** 조건 한 줄을 눌렀을 때 쓸 신고 대상 + 이미 신고했으면 그 상태 */
  const rowReport = (r: RuleResult) => {
    const target: ReportTarget = {
      kind: "rule",
      trackIndex,
      itemIndex: track ? track.track.rules.indexOf(r.rule) : -1,
      label: ruleTitle(r.rule),
      page: r.rule.source.page,
    };
    const existing = findReport(state.reports, a.id, target);
    return { onPress: () => setReport({ target, sourceText: r.rule.source.text }), flag: existing ? REPORT_STATUS_LABEL[existing.status] : undefined };
  };
  const shown = lastReport.current;
  const households = a.extraction.tracks.reduce((s, t) => s + (t.households ?? 0), 0);
  const range = priceRange(a.units, state.profile);
  const phase = applyPhase(a);
  /*
   * 구독 여부와 상관없이 예상 주거비 화면으로 간다. 구독 전이면 그 화면이 미리보기다 —
   * 공고문의 보증금·월세는 그대로, 우리가 계산한 숫자만 가려 둔다.
   * 전에는 여기서 곧장 구독 시트를 띄웠다. 그러면 무엇을 사는지 보지도 못한 채 결제를 판단하게 되고,
   * 비용 화면에 만들어 둔 미리보기는 아무도 닿을 수 없는 화면이었다(2026-09-23).
   */
  const openCost = () => router.push(`/announcement/${a.id}/cost`);
  // 신청하러 가는 길 (lib/apply.ts). 조건을 못 읽은 공고에는 판단할 거리가 없으니 이게 주 버튼이 된다.
  const apply = applyLink(a);
  const goApply = () => apply && void openApply(apply);

  return (
    <Screen
      padded={false}
      // 토스트는 스크롤 밖(overlay)에 둔다. 스크롤 안에서는 absolute의 기준이 긴 페이지 전체라 화면 밖에 떴다 (2026-09-24 감사)
      overlay={
        <Toast visible={justSaved} tone={state.notifications ? "info" : "warn"}>
          {state.notifications
            ? "관심 공고에 담았어요. 접수 마감 3일 전에 알려드릴게요."
            : "관심 공고에 담았어요. 알림이 꺼져 있어 마감 알림은 못 보내요 — 내 정보에서 켜 주세요."}
        </Toast>
      }
      header={<Header onBack={() => goBackOrHome(router)} right={<IconButton pop name={saved ? "bookmark-filled" : "bookmark"} label={saved ? "관심 해제" : "관심 등록"} onPress={() => save()} color={saved ? colors.primary : colors.text} />} />}
      footer={
        isReadable(a) ? (
          <BottomCTA
            label={hasRental ? "예상 주거비 보기" : hasAnyPricing ? "분양 공고는 계산을 아직 지원하지 않아요" : "임대조건을 아직 못 읽어 계산할 수 없어요"}
            onPress={openCost}
            disabled={!hasRental}
            secondary={!!apply}
            secondaryLabel={apply?.label}
            secondaryIcon="right"
            onSecondary={goApply}
          />
        ) : apply ? (
          <BottomCTA label={apply.label} onPress={goApply} />
        ) : undefined
      }
    >
      <View style={{ paddingHorizontal: space.screen, gap: space.section }}>
        <View style={{ gap: 12, paddingTop: 4 }}>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {/* 기관이 먼저다 — 신청처와 절차가 기관마다 다르다 */}
            {/* 홈 카드와 같은 회색. 파랑은 접수 단계가 쓴다 — 둘 다 파랑이면 어느 쪽이 상태인지 안 보였다 */}
            {a.provider ? <Tag tone="gray">{a.provider}</Tag> : null}
            <Tag tone="gray">{housingLabel(a)}</Tag>
            {phaseLabel(phase) ? <Tag tone={phaseTone(phase)}>{phaseLabel(phase)}</Tag> : null}
          </View>
          <T variant="heading">{a.title}</T>
          <Sub variant="body">{a.address ?? a.region_name}{households ? ` · 총 ${households.toLocaleString("ko-KR")}세대` : ""}</Sub>
        </View>

        {change ? (
          <Notice tone="info" icon="bell">
            {longDate(change.at.slice(0, 10))}에 바뀌었어요 — {change.changes.map((c) => c.text).join(" · ")}
          </Notice>
        ) : null}

        {a.extraction.application?.online === false ? (
          <Notice tone="warn" icon="alert">
            인터넷 접수를 받지 않는 공고예요. {a.extraction.application.place ? `${a.extraction.application.place}에서 ` : ""}현장 접수만 받아요.
          </Notice>
        ) : null}
        {!isReadable(a) ? (
          <Notice tone="warn" icon="alert">공고문에서 조건을 읽지 못했어요. 이 공고는 조건 일치와 비용 계산을 하지 않아요 — 공고문을 직접 봐 주세요.</Notice>
        ) : a.checks?.length ? (
          // 자동 검증에서 걸린 것은 숨기지 않는다. "가격 정보 없음" 같은 것이 여기 뜬다.
          <Notice tone="warn" icon="alert">자동 검증에서 확인할 점 — {a.checks.join(" · ")}. 공고문을 함께 봐 주세요.</Notice>
        ) : null}
        {/*
          자동으로 옮긴 공고(AUTO)는 위 배너로 알리지 않는다. 지금은 거의 모든 공고가 AUTO라 파란 배너가 늘 떠 있었고,
          늘 뜨는 배너는 곧 안 읽힌다 — 그러면 정말 봐야 하는 주황 배너까지 같이 넘긴다.
          배너 자리는 문제가 있을 때(못 읽음·자동 검증 지적)만 쓰고, 옮긴 방법은 조건 카드 안에서 한 줄로 말한다.
        */}

        {track ? (
          <View style={{ gap: 12 }}>
            <SectionTitle>{track.track.name}</SectionTitle>
            <Card style={{ gap: 4, paddingVertical: 12, paddingHorizontal: 16 }}>
              <View style={{ paddingHorizontal: 4, paddingVertical: 8 }}>
                <T variant="heading">
                  조건 {counts.total}개 중 <T variant="heading" color={colors.primary}>{counts.matched}개 일치</T>
                  {counts.needsCheck ? <T variant="heading" color={colors.text3}> · 확인 {counts.needsCheck}</T> : null}
                </T>
                {/*
                  무엇을 안 했는지가 아니라 무엇을 했고 어떻게 확인하는지를 말한다.
                  전에는 "사람이 아직 확인하지 않았어요"였다 — 사실이지만 "그럼 믿지 말라는 건가"로 읽혔다.
                  사실은 줄이지 않는다: AI가 옮겼다는 것은 줄에 바로 쓰고(무엇이 옮겼는지 숨기지 않는다), 틀릴 수 있다는 것은 (i) 안에 있다.
                */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 }}>
                  <Sub tone="3" variant="caption" style={{ flexShrink: 1 }}>
                    {a.status === "VERIFIED" ? "공고문과 한 줄씩 대조했어요" : "AI가 공고문에서 옮긴 조건이에요"}
                  </Sub>
                  {a.status === "VERIFIED" ? null : (
                    <InfoTip
                      label="조건을 옮긴 방법"
                      text="AI가 공고문을 읽고 조건을 옮겼어요. AI는 틀릴 수 있어서 줄마다 공고문 쪽수를 달아 두었어요. 다르면 그 줄을 눌러 알려 주세요. 사람이 공고문과 대조를 마친 공고에는 '한 줄씩 대조했어요'가 붙어요."
                    />
                  )}
                </View>
              </View>
              {track.groups.map((g) => {
                const rules = g.rules.filter((r) => !r.skipped);
                if (g.group.mode === "any_of" && rules.length > 1) {
                  return (
                    <View key={g.group.id} style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, marginVertical: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4, paddingTop: 8, paddingBottom: 2 }}>
                        <Sub tone="3" variant="caption">{g.group.label} · 하나만 맞으면 됩니다</Sub>
                        {g.status === "MATCH" ? <Icon name="check" size={iconSize.sm} color={colors.ok} /> : null}
                      </View>
                      {rules.map((r, i) => (
                        <ConditionRow key={i} status={r.status} title={ruleTitle(r.rule)} why={inputSummary(r.rule, state.profile, r)} page={r.rule.source.page} {...rowReport(r)} {...fillProps(r)} />
                      ))}
                    </View>
                  );
                }
                return rules.map((r, i) => (
                  <ConditionRow key={`${g.group.id}-${i}`} status={r.status} title={ruleTitle(r.rule)} why={inputSummary(r.rule, state.profile, r)} page={r.rule.source.page} {...rowReport(r)} {...fillProps(r)} />
                ));
              })}
              {/*
                자격 아래에 순위를 둔다. "조건 6개 일치"만 보고 되는 줄 알았다가, 2순위라 차례가 안 오는 공고가 흔하다.
                앞 순위를 판별하지 못했으면 단정하지 않는다 — "더 앞 순위일 수 있어요"라고 말한다.
              */}
              {rank || selection || residenceText ? (
                <View style={{ borderTopWidth: 1, borderTopColor: colors.line, marginTop: 8, paddingTop: 14, paddingHorizontal: 4, gap: 10 }}>
                  {rank && rankLocked ? (
                    <Pressable onPress={() => setSubSheet(true)} accessibilityRole="button" accessibilityLabel="예상 순위 보기 — 구독" style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                      <KeyValue label="예상 순위" value="" redacted redactedText="?순위" strong note="내 순위와 지난 회차 마감 순위 비교는 구독하면 볼 수 있어요" />
                    </Pressable>
                  ) : rank ? (
                    <KeyValue
                      label="예상 순위"
                      value={rank.rank ? `${rank.rank}순위` : "해당 순위 없음"}
                      strong
                      note={[rank.label, rank.certain ? null : "입력하지 않은 조건이 있어 더 앞 순위일 수 있어요"].filter(Boolean).join(" · ") || undefined}
                    />
                  ) : null}
                  {rank && !rankLocked && rank.apply_date ? (
                    <Notice tone="warn" icon="clock">
                      {rank.rank}순위 접수일은 {longDate(rank.apply_date)}이에요. 순위마다 접수일이 달라서 다른 날 접수하면 부적격이 돼요.
                    </Notice>
                  ) : rankDates ? (
                    <Notice tone="warn" icon="clock">순위마다 접수일이 달라요 — {rankDates}. 다른 날 접수하면 부적격이 돼요.</Notice>
                  ) : null}
                  {selection ? <Sub tone="3" variant="caption">경쟁이 붙으면 {selection} 순서로 뽑아요.</Sub> : null}
                  {residenceText ? <KeyValue label="살 수 있는 기간" value={residenceText.value} note={residenceText.note} /> : null}
                </View>
              ) : null}
            </Card>
            {match && match.tracks.length > 1 ? (
              <Sub tone="3" variant="caption">다른 공급 유형 · {match.tracks.filter((t) => t !== track).map((t) => { const c = ruleCounts(t); return `${t.track.name} ${c.matched}/${c.total}`; }).join(" · ")}</Sub>
            ) : null}
          </View>
        ) : null}

        <SourceCard pdfUrl={a.pdf_url} detailUrl={a.detail_url} what="위 조건과 임대조건은" />
        <SubscriptionSheet visible={subSheet} onClose={() => setSubSheet(false)} />

        <NoticeImages images={a.images} />

        {/*
          집이 흩어져 있는 공고. 공고 하나의 좌표로 통근을 말할 수 없으니 대신 고를 수 있는 집을 보여 준다.
          이 유형에서 사람이 실제로 묻는 것은 "이 공고가 나에게 맞나"보다 "어느 집을 고를 수 있나"다.
        */}
        {scattered ? (
          <View style={{ gap: 12 }}>
            {/* 집 목록이 없을 때 두 경우가 있다. 매입임대는 정말 흩어진 집이고, 영구임대·국민임대처럼
                주소가 "서울특별시"뿐인 공고는 여러 단지를 한 번에 모집하는 것이다. 매입임대용 설명을
                영구임대에 붙이면("공급주택목록에서 확인") 없는 첨부를 찾게 만든다. */}
            <SectionTitle>{a.units?.length ? `고를 수 있는 집 ${a.units.length}곳` : houses ? "집이 여러 곳에 흩어져 있어요" : "여러 단지에서 모집해요"}</SectionTitle>
            {nearby3.length > 0 ? (
              <Card style={{ gap: 14 }}>
                {nearby3.map(({ unit, km }) => (
                  <Row
                    key={unit.id}
                    icon="house"
                    tone="primary"
                    title={`${unitLabel(unit)}${unit.ho ? ` ${unit.ho}호` : ""}`}
                    detail={[km !== null ? `직장까지 직선거리 ${km < 10 ? km.toFixed(1) : km.toFixed(0)}km` : null, unitSpec(unit)].filter(Boolean).join(" · ")}
                  />
                ))}
                {/* 집이 수백 채면 세 곳만 봐서는 "대충 얼마인가"를 알 수 없다.
                    범위는 공고문에 적힌 사실이라 가리지 않는다 — 우리가 계산한 값만 유료다. */}
                {range?.deposit ? (
                  <KeyValue
                    label={`보증금 (${range.count}채)`}
                    value={rangeText(range.deposit, manwon) ?? "-"}
                    note={range.monthly_rent ? `월세 ${rangeText(range.monthly_rent, (n) => (n === 0 ? "0원" : manwon(n)))}` : undefined}
                  />
                ) : null}
                <Sub tone="3" variant="caption">
                  {state.profile?.workplace
                    ? "직장에서 가까운 순으로 세 곳만 보여드려요. 예상 주거비에서 집마다 보증금·월세를 볼 수 있어요."
                    : "내 조건에 직장을 넣으면 가까운 집부터 보여드려요. 예상 주거비에서 집마다 보증금·월세를 볼 수 있어요."}
                </Sub>
              </Card>
            ) : (
              <Card>
                {/* 제목은 바로 위 섹션 제목이 이미 말했다. 카드에서 같은 말을 또 하지 않는다 */}
                <Sub>
                  {houses
                    ? "한 단지가 아니라 흩어져 있는 집을 한 채씩 공급해요. 집마다 주소와 임대조건은 공고문에 함께 붙은 공급주택목록에서 확인해 주세요."
                    : "한 공고로 여러 단지의 입주자를 함께 모집해요. 단지별 위치와 임대조건은 공고문에서 확인해 주세요."}
                </Sub>
              </Card>
            )}
          </View>
        ) : null}

        {!scattered && (a.lat !== undefined || a.transit || a.nearby?.length) ? (
          <View style={{ gap: 12 }}>
            <SectionTitle>위치와 교통</SectionTitle>
            <Card style={{ gap: 16 }}>
              {place ? (
                <Row icon="map-pin" tone="info" title={a.address ?? a.region_name} detail="지도에서 보기" onPress={() => setMapOpen(true)} chevron />
              ) : null}

              {transitLines(a.transit).map((t) => (
                <Row key={t.title} icon={t.icon} tone="gray" title={t.title} detail={t.detail} />
              ))}

              {/* 통근은 두 사람 몫이 따로다. 부부는 한 쪽만 가까운 집을 고를 수 없다. */}
              {commuteLines(state.profile, distanceKm, distancePartnerKm, a.commute).map((c) => (
                <Row
                  key={c.who}
                  icon="walk"
                  tone="primary"
                  title={`${c.who}까지 ${commuteDetail(c)}`}
                  detail={c.where ? `${c.where} 기준` : "직장 위치"}
                />
              ))}

              {/* 있는 것만 말한다. 통근 시간이 있으면 그렇게 말하고, 없으면 직선거리까지만 말한다 */}
              <Sub tone="3" variant="caption">
                {hasCommuteTime
                  ? "통근 시간은 입력한 직장 위치에서 출발한 대중교통 경로 기준이고, 역·정류장까지 걷는 시간은 4km/h로 환산한 값이에요."
                  : "모두 직선거리예요. 걷는 시간은 4km/h로 환산한 값이고, 실제 통근 시간(환승·배차)은 아직 계산하지 않아요."}
                {state.profile?.workplace ? "" : " 직장 위치를 넣으면 거리가 보여요."}
              </Sub>
            </Card>

            {a.nearby?.length ? (
              <View style={{ gap: 12, paddingTop: 12 }}>
              <SectionTitle>가까운 생활 시설</SectionTitle>
              <Card style={{ gap: 16 }}>
                {nearbyLines(a.nearby).map((n) => (
                  <Row key={n.kind} icon={n.icon as IconName} tone="gray" title={n.title} detail={n.detail} />
                ))}
                <Sub tone="3" variant="caption">종류마다 가장 가까운 한 곳만 보여드려요.</Sub>
              </Card>
              </View>
            ) : null}
          </View>
        ) : null}


        {/* 지난 회차 결과. "붙을까"에 제일 직접 답하는 값이다.
            **순위를 앞세우고 경쟁률은 괄호에 둔다** — 공공임대는 순위제라
            "7.2대 1"보다 "1순위에서 마감"이 내 순위와 바로 견줘진다.
            커트라인의 점수("9점")는 담지 않는다. 공고마다 배점이 달라 비교할 수 없다.

            단지명으로 이은 값이라 틀릴 수 있다. 그래서 어느 단지의 언제 결과인지 그대로 적는다 —
            사용자가 틀린 것을 알아볼 수 있어야 한다. */}
        {/*
          없을 때도 말은 하되, **한 줄로** 말한다.
          커트라인이 있는 공고는 9%뿐이다(2026-09-23 실측: 국민임대 20% · 행복주택 3% · 매입임대 0%).
          없는 게 기본값인데 섹션 제목과 카드로 "없어요"를 띄우면, 대부분의 화면에서
          이 기능이 주인공처럼 자리를 차지한다. 이건 점수제 공급에서만 쓰이는 보조 정보다.

          그래도 자리를 아예 비우지는 않는다 — 빈 자리는 "이 앱은 이걸 안 한다"로 읽히고,
          그러면 있는 공고에서도 찾아보지 않는다. 왜 없는지까지 적는 것은 그대로 둔다:
          "아직 못 찾았다"로 뭉뚱그리면 추첨 유형 사용자는 영영 오지 않을 것을 기다린다.
        */}
        {!a.past_results?.length ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Icon name="info" size={iconSize.md} color={colors.text4} />
            <Sub tone="3" variant="caption" style={{ flex: 1 }}>
              {a.provider === "SH"
                ? "지난 회차 당첨 커트라인은 SH가 공개하지 않아요. 경쟁률은 공고문에서 확인해 주세요."
                : a.housing_type === "happy" || a.housing_type === "purchased_rental"
                  ? "이 유형은 대부분 추첨으로 뽑아서 지난 회차 커트라인이 없어요."
                  : "같은 단지의 지난 회차 결과를 찾지 못했어요."}
            </Sub>
          </View>
        ) : null}

        {a.past_results?.length ? (
          <View style={{ gap: 12 }}>
            <SectionTitle>지난 회차 결과</SectionTitle>
            <Card style={{ gap: 14 }}>
              {(() => {
                const t = toughest(a.past_results!);
                const text = t ? pastResultText(t, { several: a.past_results!.length > 1 }) : null;
                return text ? <T variant="bodyMedium">{text}</T> : null;
              })()}
              {/* 공급·신청 수는 여기서 본문이다. src로 주면 (i) 뒤에 접혀 눌러야 보인다 */}
              {a.past_results.slice(0, 4).map((r, i) => (
                <KeyValue
                  key={`${r.draw_type ?? ""}-${i}`}
                  label={r.draw_type ? `${r.draw_type}형` : "주택형을 못 읽음"}
                  value={r.closed_rank ? `${r.closed_rank}순위 마감` : "마감 순위 모름"}
                  note={
                    [
                      r.households !== undefined && r.applicants !== undefined
                        ? `${r.households}호 공급 · ${r.applicants.toLocaleString("ko-KR")}명 신청${r.competition ? ` · ${r.competition}대 1` : ""}`
                        : null,
                      // 내 순위를 확실히 알 때만 견준다. 모르는데 "차례 안 옴"이라 하면 거짓 절망이다
                      !rankLocked && rank?.certain && rank.rank && r.closed_rank ? `내 예상 순위(${rank.rank}순위) · ${RANK_VS_PAST_LABEL[rankVsPast(rank.rank, r.closed_rank)]}` : null,
                    ].filter(Boolean).join("\n") || undefined
                  }
                />
              ))}
              {/* 숫자를 어떻게 읽는지 바꾸는 말이라 (i)에 접지 않는다 */}
              <Sub tone="2" variant="caption">
                "N순위 마감"은 그 순위까지의 신청자만으로 모집이 다 찼다는 뜻이에요. 내 순위가 그보다 뒤면 지난 회차에는 차례가 오지 않았어요.
              </Sub>
              <Sub tone="3" variant="caption">
                {a.past_results[0]!.complex}
                {a.past_results[0]!.announced_at ? ` · ${dateText(a.past_results[0]!.announced_at)} 발표` : ""}
                . LH 당첨자 발표의 커트라인이에요. 이번 회차 결과는 아니고, 기준이 달라질 수 있어요.
              </Sub>
            </Card>
          </View>
        ) : null}

        {/* 조건이 맞고 돈이 되면 마지막 질문이 "그래서 순번이 오나"다.
            단정하지 않는다 — 지금 몇 명이 기다리는지라는 사실만 적고 기준일과 출처를 단다. */}
        {a.waiting && a.waiting.total_waiting > 0 ? (
          <View style={{ gap: 12 }}>
            <SectionTitle>대기 현황</SectionTitle>
            <Card style={{ gap: 14 }}>
              <KeyValue
                label={a.waiting.complex}
                value={`대기 ${a.waiting.total_waiting.toLocaleString("ko-KR")}명`}
                src={a.waiting.households ? `총 ${a.waiting.households.toLocaleString("ko-KR")}세대` : undefined}
                strong
              />
              {a.waiting.rows.slice(0, 4).map((r, i) => (
                <KeyValue
                  key={`${r.unit_type ?? ""}-${i}`}
                  label={r.unit_type ? `${r.unit_type}형` : "주택형을 못 읽음"}
                  value={`${r.waiting.toLocaleString("ko-KR")}명`}
                  src={r.terminated ? `최근 해지 ${r.terminated}건` : undefined}
                />
              ))}
              <Sub tone="3" variant="caption">
                {a.waiting.as_of ? `${dateText(a.waiting.as_of)} 기준 · ` : ""}
                {a.waiting.source}. 이 공고의 경쟁률이 아니라 같은 단지에서 지금 기다리는 사람 수예요.
              </Sub>
            </Card>
          </View>
        ) : null}

        <View style={{ gap: 12 }}>
          <SectionTitle>일정</SectionTitle>
          <Card style={{ gap: 14 }}>
            {/* 표 안에서는 자릿수를 맞춘다. 문장 안(알림·고지)에서만 "2026년 9월 17일" 꼴을 쓴다 */}
            <KeyValue label="공고일" value={dateText(a.notice_date)} />
            <KeyValue label="접수" value={dateRange(a.apply_start, a.apply_end)} />
            {a.extraction.application?.online !== false && a.extraction.application?.onsite_for ? (
              <Sub tone="3" variant="caption">현장 접수는 {a.extraction.application.onsite_for}만 할 수 있어요.</Sub>
            ) : null}
            {/* 접수 뒤에 서류 단계가 따로 있다. 놓치면 당첨 전에 탈락한다 — 그래서 신청함으로 표시하면 알림도 건다 */}
            {a.extraction.schedule.documents_announce ? <KeyValue label="서류제출 대상자 발표" value={dateText(a.extraction.schedule.documents_announce)} /> : null}
            {a.extraction.schedule.documents_start || a.extraction.schedule.documents_end ? (
              <KeyValue label="서류 제출" value={dateRange(a.extraction.schedule.documents_start, a.extraction.schedule.documents_end)} />
            ) : null}
            {/* 누르기 **전에도** 북마크가 무엇을 하는지 알 수 있어야 한다.
                누른 뒤에만 알려 주면, 그 기능이 있는 줄 모르는 사람은 영영 안 누른다.
                이미 담았으면 같은 말을 또 하지 않는다. */}
            {!saved && a.apply_end && phase.kind !== "closed" ? (
              <Sub tone="3" variant="caption">
                오른쪽 위 관심 버튼을 누르면 접수 마감 3일 전에 알려드려요.
              </Sub>
            ) : null}
            {a.extraction.schedule.winner_announce ? (
              <>
                <KeyValue label="당첨자 발표" value={looseDate(a.extraction.schedule.winner_announce)} />
                {/* 날짜를 본 그 자리에 둔다. 카드 밖 아래쪽에 두었더니 있는 줄도 몰랐다.
                    구독과 무관하게 무료다 — 알림을 잠그면 일정을 놓치게 된다.
                    발표일이 지났으면 걸 알림이 없다. 누를 수 있게 두면 없는 알림을 약속하는 버튼이 된다. */}
                {announced ? (
                  <Sub tone="3" variant="caption">발표가 끝났어요. 결과는 기관 사이트에서 확인해 주세요.</Sub>
                ) : (
                <Pressable
                  onPress={() => toggleApplied(a.id)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: applied }}
                  style={({ pressed }) => ({
                    flexDirection: "row", alignItems: "center", gap: 10,
                    marginTop: 2, paddingVertical: 10, paddingHorizontal: 12,
                    borderRadius: radius.md,
                    backgroundColor: applied ? colors.primarySoft : pressed ? colors.cardStrong : colors.cardSoft,
                  })}
                >
                  <Icon name={applied ? "check-circle" : "bell"} size={iconSize.xl} color={applied ? colors.primary : colors.text2} />
                  <View style={{ flex: 1, gap: 1 }}>
                    <T variant="bodyMedium">
                      {applied ? "발표일에 알려드릴게요" : "신청했다면 발표일에 알려드려요"}
                    </T>
                    <Sub tone="3" variant="caption">
                      {applied
                        ? announceDate
                          ? "3일 전 · 1일 전 · 당일 오전 9시"
                          : "발표일이 날짜로 적혀 있지 않아 알림을 걸지 못했어요"
                        : "눌러서 표시해 두세요. 알림을 켜 두면 발표일에 알려드려요"}
                    </Sub>
                  </View>
                </Pressable>
                )}
              </>
            ) : null}
            {a.extraction.schedule.contract_start || a.extraction.schedule.contract_end ? (
              <KeyValue label="계약" value={dateRange(a.extraction.schedule.contract_start, a.extraction.schedule.contract_end)} />
            ) : null}
            {a.extraction.schedule.move_in ? <KeyValue label="입주 예정" value={looseDate(a.extraction.schedule.move_in)} /> : null}
          </Card>

        </View>

        {/* 추출이 남긴 작업 메모는 거르고 공고문 내용만 낸다 (lib/notes.ts) */}
        {notes.length > 0 ? (
          <View style={{ gap: 12 }}>
            <SectionTitle>그 밖의 조건</SectionTitle>
            <Card style={{ gap: 12 }}>
              {/* 공고문 원문 문단이라 길다. 전부 펼쳐 두면 화면 한 장 반이 이 글이었다 — 두 개만 먼저 보이고 나머지는 펼친다 */}
              {notes.slice(0, notesOpen ? 4 : 2).map((n, i) => <Sub key={i}>{n}</Sub>)}
              {Math.min(notes.length, 4) > 2 ? (
                <Pressable
                  onPress={() => { animateLayout(); setNotesOpen((v) => !v); }}
                  accessibilityRole="button"
                  hitSlop={8}
                  style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingVertical: 8, paddingRight: 8, opacity: pressed ? 0.6 : 1 })}
                >
                  <T variant="small" color={colors.text2}>{notesOpen ? "접기" : `${Math.min(notes.length, 4) - 2}개 더 보기`}</T>
                  <View style={{ transform: [{ rotate: notesOpen ? "-90deg" : "90deg" }] }}>
                    <Icon name="right" size={iconSize.sm} color={colors.text3} />
                  </View>
                </Pressable>
              ) : null}
            </Card>
          </View>
        ) : null}
        <Sub tone="3" variant="caption">
          조건 일치는 공고문과 적어 두신 값을 맞춰 본 결과예요. 실제 자격은 서류 심사로 확정돼요.
          {a.status === "VERIFIED" ? " 이 공고의 조건은 사람이 공고문과 대조했어요." : ""} 숫자가 이상하면 그 줄을 눌러 알려 주세요.
        </Sub>
      </View>

      {/* 한국 사용자는 시세·학군까지 그쪽 앱에서 본다. 좌표만 정확히 넘겨 주고 나머지는 맡긴다. */}
      <BottomSheet visible={mapOpen} onClose={() => setMapOpen(false)}>
        <View style={{ gap: 6 }}>
          <T variant="heading">지도에서 보기</T>
          <Sub tone="3" variant="caption">{a.address ?? a.region_name}</Sub>
        </View>
        <View style={{ gap: 8 }}>
          {(place ? mapTargets(place, APP_ID) : []).map((t) => (
            <PrimaryButton
              key={t.id}
              tone="soft"
              label={t.label}
              onPress={() => {
                setMapOpen(false);
                void openMapTarget(t);
              }}
            />
          ))}
        </View>
        <Sub tone="3" variant="caption">앱이 없으면 웹 지도로 열려요.</Sub>
      </BottomSheet>

      <ReportSheet
        visible={!!report}
        onClose={() => setReport(null)}
        title={shown?.target.label ?? ""}
        page={shown?.target.page}
        sourceText={shown?.sourceText}
        pdfUrl={a.pdf_url}
        existing={shown ? findReport(state.reports, a.id, shown.target) : undefined}
        onSubmit={(message, suggested) =>
          shown && addReport(draftReport({ announcementId: a.id, announcementTitle: a.title, target: shown.target, message, suggested }))
        }
      />
    </Screen>
  );
}

/** 위치·교통·인프라 한 줄. 아이콘 타일 + 제목 + 보조 설명, 누를 수 있으면 화살표. */
function Row({
  icon,
  tone,
  title,
  detail,
  onPress,
  chevron,
}: {
  icon: IconName;
  tone: "gray" | "primary" | "info";
  title: string;
  detail: string;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const { colors } = useTheme();
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <IconTile name={icon} tone={tone} />
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="bodyMedium">{title}</T>
        <Sub tone="3" variant="caption">{detail}</Sub>
      </View>
      {chevron ? <Icon name="right" size={iconSize.lg} color={colors.text4} /> : null}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title} ${detail}`}>
      {body}
    </Pressable>
  ) : (
    body
  );
}
