import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import Constants from "expo-constants";
import { Pressable, View } from "react-native";
import { haversineKm, matchAnnouncement, type RuleResult } from "@housing/engine";
import { Icon, type IconName } from "@/components/icon";
import { ReportSheet } from "@/components/ReportSheet";
import { NoticeImages } from "@/components/NoticeImages";
import { SourceCard } from "@/components/SourceCard";
import { SubscriptionSheet } from "@/components/SubscriptionSheet";
import { BottomCTA, BottomSheet, Card, ConditionRow, Header, IconButton, IconTile, KeyValue, Notice, PrimaryButton, Screen, SectionTitle, Sub, T, Tag } from "@/components/ui";
import { getAnnouncement, isReadable, ruleCounts, useAnnouncements, type Nearby } from "@/data/announcements";
import { inputSummary, missingStepFor, ruleTitle } from "@/lib/conditions";
import { userFacingNotes } from "@/lib/notes";
import { isScattered, unitLabel, unitSpec, unitsWithDistance } from "@/lib/units";
import { dateRange, dateText, daysUntil, dday, HOUSING_LABEL, longDate, looseDate } from "@/lib/format";
import { unseenChange } from "@/lib/changes";
import { draftReport, findReport, REPORT_STATUS_LABEL, type ReportTarget } from "@/lib/reports";
import { commuteDetail, commuteFor, commuteLines, mapPlace, nearbyLines, openMapTarget, transitLines } from "@/lib/commute";
import { mapTargets } from "@/lib/maps";
import { canOpenCost, useAppState } from "@/store/appState";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";

/** 공고 상세: 조건 체크리스트(근거 쪽), 위치, 일정, 비용 계산 CTA */
export default function AnnouncementDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { state, toggleSaved, toggleApplied, addReport, seeChange, openAnnouncement } = useAppState();
  const { list } = useAnnouncements();
  const a = getAnnouncement(id ?? "", list);
  const [sheet, setSheet] = useState(false);
  // 동기화가 화면을 연 뒤에 끝날 수도 있으니 계속 지켜보다가, 오면 그때 집어서 들고 있는다.
  // (본 것으로 표시하면 목록에서 사라지므로 이 화면에서는 따로 붙들어 둔다.)
  const incoming = unseenChange(state.changes, id ?? "");
  const [change, setChange] = useState(incoming);
  const [report, setReport] = useState<{ target: ReportTarget; sourceText?: string } | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
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

  const match = useMemo(() => (a && isReadable(a) && state.profile ? matchAnnouncement(a.extraction, state.profile, { announcement_region: a.region_code }) : null), [a, state.profile]);
  const track = match?.best_track ?? (match ? [...match.tracks].sort((x, y) => y.summary.matched - x.summary.matched)[0] ?? null : null);
  // 흩어진 공고는 임대조건이 공고문 본문이 아니라 주택 목록에 집마다 붙어 있다.
  // 목록을 읽었으면 계산할 수 있다 — 고르는 단위가 주택형이 아니라 집일 뿐이다.
  const hasUnitPricing = !!a?.units?.some((u) => u.deposit !== undefined);
  const hasRental = hasUnitPricing || !!a?.extraction.tracks.some((t) => t.pricing.some((p) => p.kind === "rental"));
  // 가격이 아예 없는 공고를 "분양"이라고 하면 사실이 아니다. 두 경우를 나눠 말한다.
  const hasAnyPricing = !!a?.extraction.tracks.some((t) => t.pricing.length > 0);
  const saved = !!a && state.saved.includes(a.id);
  const applied = !!a && state.applied.includes(a.id);
  // 발표일이 날짜로 적힌 공고만 알림을 걸 수 있다 ("2027년 2월"처럼 월까지만 있는 경우가 있다)
  const announceDate = /^\d{4}-\d{2}-\d{2}$/.test(a?.extraction.schedule.winner_announce?.trim() ?? "");

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

  if (!a) {
    return (
      <Screen>
        <T variant="heading" style={{ paddingTop: 20 }}>공고를 찾을 수 없어요</T>
      </Screen>
    );
  }
  const counts = track ? ruleCounts(track) : { matched: 0, needsCheck: 0, total: 0 };
  const notes = userFacingNotes(a.extraction.notes);
  /**
   * 집이 흩어져 있는 공고는 좌표가 하나일 수 없다.
   * 그런데 주소가 "서울특별시"뿐이라 지오코딩이 시청 좌표를 돌려줬고, 통근 시간과 주변 시설이
   * 전부 시청 기준으로 계산돼 화면에 올라가 있었다 (2026-09-22 확인). 없느니만 못한 정보다.
   * 그래서 위치 섹션을 통째로 끄고, 대신 고를 수 있는 집 목록을 보여 준다.
   */
  const scattered = isScattered(a);
  const nearby3 = a.units?.length ? unitsWithDistance(a.units, state.profile).slice(0, 3) : [];
  const trackIndex = track ? a.extraction.tracks.indexOf(track.track) : -1;
  /**
   * 값이 없어 판별을 못 한 줄에 "지금 입력하기"를 단다.
   * 그 줄이 할 수 있는 말은 "입력하면 판별 가능"뿐인데, 그러려면 내 정보로 나가서 항목을 찾아야 했다.
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
  const days = daysUntil(a.apply_end);
  const openCost = () => {
    if (canOpenCost(state)) router.push(`/announcement/${a.id}/cost`);
    else setSheet(true);
  };

  return (
    <Screen
      padded={false}
      header={<Header onBack={() => router.back()} right={<IconButton pop name={saved ? "heart-filled" : "heart"} label={saved ? "관심 해제" : "관심 등록"} onPress={() => toggleSaved(a.id)} color={saved ? colors.danger : colors.text} />} />}
      footer={isReadable(a) ? <BottomCTA label={hasRental ? "예상 주거비 보기" : hasAnyPricing ? "분양 공고는 계산을 아직 지원하지 않아요" : "임대조건을 아직 못 읽어 계산할 수 없어요"} onPress={openCost} disabled={!hasRental} /> : undefined}
    >
      <View style={{ paddingHorizontal: space.screen, gap: space.section }}>
        <View style={{ gap: 12, paddingTop: 4 }}>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {/* 기관이 먼저다 — 신청처와 절차가 기관마다 다르다 */}
            {a.provider ? <Tag tone="info">{a.provider}</Tag> : null}
            <Tag tone="gray">{HOUSING_LABEL[a.housing_type]}</Tag>
            {days !== null ? <Tag tone={days <= 14 ? "danger" : "gray"}>{dday(a.apply_end)}</Tag> : null}
          </View>
          <T variant="title" style={{ fontSize: 26, lineHeight: 34 }}>{a.title}</T>
          <Sub variant="body">{a.address ?? a.region_name}{households ? ` · 총 ${households.toLocaleString("ko-KR")}세대` : ""}</Sub>
        </View>

        {change ? (
          <Notice tone="info" icon="bell">
            {longDate(change.at.slice(0, 10))}에 바뀌었어요 — {change.changes.map((c) => c.text).join(" · ")}
          </Notice>
        ) : null}

        {!isReadable(a) ? (
          <Notice tone="warn" icon="alert">공고 조건을 분석하고 있어요. 다 읽으면 조건 일치와 비용 계산이 열립니다.</Notice>
        ) : a.checks?.length ? (
          // 자동 검증에서 걸린 것은 숨기지 않는다. "가격 정보 없음" 같은 것이 여기 뜬다.
          <Notice tone="warn" icon="alert">자동 검증에서 확인할 점 — {a.checks.join(" · ")}. 원문 공고문을 함께 봐 주세요.</Notice>
        ) : a.status === "AUTO" ? (
          <Notice tone="info" icon="info">공고문에서 자동으로 옮긴 조건이에요. 사람이 아직 확인하지 않았어요.</Notice>
        ) : null}

        {track ? (
          <View style={{ gap: 12 }}>
            <SectionTitle right="근거는 공고문 쪽수">{track.track.name}</SectionTitle>
            <Card style={{ gap: 4, paddingVertical: 12, paddingHorizontal: 16 }}>
              <View style={{ paddingHorizontal: 4, paddingVertical: 8 }}>
                <T variant="heading">
                  조건 {counts.total}개 중 <T variant="heading" color={colors.primary}>{counts.matched}개 일치</T>
                  {counts.needsCheck ? <T variant="heading" color={colors.text3}> · 확인 {counts.needsCheck}</T> : null}
                </T>
              </View>
              {track.groups.map((g) => {
                const rules = g.rules.filter((r) => !r.skipped);
                if (g.group.mode === "any_of" && rules.length > 1) {
                  return (
                    <View key={g.group.id} style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, marginVertical: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4, paddingTop: 8, paddingBottom: 2 }}>
                        <Sub tone="3" variant="caption">{g.group.label} · 하나만 맞으면 됩니다</Sub>
                        {g.status === "MATCH" ? <Icon name="check" size={13} color={colors.ok} /> : null}
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
            </Card>
            {match && match.tracks.length > 1 ? (
              <Sub tone="3" variant="caption" style={{ paddingHorizontal: 4 }}>다른 공급 유형 · {match.tracks.filter((t) => t !== track).map((t) => { const c = ruleCounts(t); return `${t.track.name} ${c.matched}/${c.total}`; }).join(" · ")}</Sub>
            ) : null}
          </View>
        ) : null}

        <SourceCard pdfUrl={a.pdf_url} detailUrl={a.detail_url} what="위 조건과 임대조건은" />

        <NoticeImages images={a.images} />

        {/*
          집이 흩어져 있는 공고. 공고 하나의 좌표로 통근을 말할 수 없으니 대신 고를 수 있는 집을 보여 준다.
          이 유형에서 사람이 실제로 묻는 것은 "이 공고가 나에게 맞나"보다 "어느 집을 고를 수 있나"다.
        */}
        {scattered ? (
          <View style={{ gap: 12 }}>
            <SectionTitle>{a.units?.length ? `고를 수 있는 집 ${a.units.length}곳` : "집이 흩어져 있어요"}</SectionTitle>
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
                <Sub tone="3" variant="caption">
                  {state.profile?.workplace
                    ? "직장에서 가까운 순으로 세 곳만 보여드려요. 예상 주거비에서 집마다 보증금·월세를 볼 수 있어요."
                    : "내 정보에 직장을 넣으면 가까운 집부터 보여드려요. 예상 주거비에서 집마다 보증금·월세를 볼 수 있어요."}
                </Sub>
              </Card>
            ) : (
              <Card style={{ gap: 8 }}>
                <T variant="bodyMedium">주택이 여러 곳에 흩어져 있어요</T>
                <Sub tone="3">
                  이 공고는 단지가 아니라 개별 주택을 모집해요. 주택별 소재지와 임대조건은 공고문에 함께 붙은
                  공급주택목록에서 확인해 주세요.
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
                  ? "통근 시간은 시군구 중심에서 출발한 대중교통 경로 기준이고, 역·정류장까지 걷는 시간은 4km/h로 환산한 값이에요."
                  : "모두 직선거리예요. 걷는 시간은 4km/h로 환산한 값이고, 실제 통근 시간(환승·배차)은 아직 계산하지 않아요."}
                {state.profile?.workplace ? "" : " 직장 위치를 넣으면 거리가 보여요."}
              </Sub>
            </Card>

            {a.nearby?.length ? (
              <Card style={{ gap: 16 }}>
                {nearbyLines(a.nearby).map((n) => (
                  <Row key={n.kind} icon={n.icon as IconName} tone="gray" title={n.title} detail={n.detail} />
                ))}
                <Sub tone="3" variant="caption">종류마다 가장 가까운 한 곳만 보여드려요.</Sub>
              </Card>
            ) : null}
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
                  key={`${r.unit_type ?? i}`}
                  label={r.unit_type ? `${r.unit_type}형` : "주택형 미상"}
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
            {a.extraction.schedule.winner_announce ? (
              <>
                <KeyValue label="당첨자 발표" value={looseDate(a.extraction.schedule.winner_announce)} />
                {/* 날짜를 본 그 자리에 둔다. 카드 밖 아래쪽에 두었더니 있는 줄도 몰랐다.
                    구독과 무관하게 무료다 — 알림을 잠그면 일정을 놓치게 된다. */}
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
                  <Icon name={applied ? "check-circle" : "bell"} size={20} color={applied ? colors.primary : colors.text2} />
                  <View style={{ flex: 1, gap: 1 }}>
                    <T variant="bodyMedium" style={{ fontSize: 15 }}>
                      {applied ? "발표일에 알려드릴게요" : "신청했다면 발표일에 알려드릴게요"}
                    </T>
                    <Sub tone="3" variant="caption">
                      {applied
                        ? announceDate
                          ? "3일 전 · 1일 전 · 당일 오전 9시"
                          : "발표일이 날짜로 적혀 있지 않아 알림을 걸지 못했어요"
                        : "눌러서 신청한 공고로 표시하세요"}
                    </Sub>
                  </View>
                </Pressable>
              </>
            ) : null}
            {a.extraction.schedule.move_in ? <KeyValue label="입주 예정" value={looseDate(a.extraction.schedule.move_in)} /> : null}
          </Card>

        </View>

        {/* 추출이 남긴 작업 메모는 거르고 공고문 내용만 낸다 (lib/notes.ts) */}
        {notes.length > 0 ? (
          <View style={{ gap: 12 }}>
            <SectionTitle>그 밖의 조건</SectionTitle>
            <Card style={{ gap: 12 }}>
              {notes.slice(0, 4).map((n, i) => <Sub key={i}>{n}</Sub>)}
            </Card>
          </View>
        ) : null}
        <Sub tone="3" variant="caption" style={{ paddingHorizontal: 4 }}>
          조건 일치는 공고문과 입력값을 비교한 결과예요. 실제 자격은 서류 심사로 확정됩니다.
          {a.status === "VERIFIED" ? " 이 공고의 조건은 사람이 공고문과 대조했어요." : ""} 숫자가 이상하면 그 줄을 눌러 알려 주세요.
        </Sub>
      </View>

      {/* 한국 사용자는 시세·학군까지 그쪽 앱에서 본다. 좌표만 정확히 넘겨 주고 나머지는 맡긴다. */}
      <BottomSheet visible={mapOpen} onClose={() => setMapOpen(false)}>
        <View style={{ gap: 6 }}>
          <T variant="title" style={{ fontSize: 20, lineHeight: 28 }}>지도에서 보기</T>
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

      <SubscriptionSheet visible={sheet} onClose={() => setSheet(false)} onStarted={() => router.push(`/announcement/${a.id}/cost`)} />
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
      {chevron ? <Icon name="right" size={18} color={colors.text4} /> : null}
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
