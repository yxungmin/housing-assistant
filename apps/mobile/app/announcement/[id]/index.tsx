import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { haversineKm, matchAnnouncement, type RuleResult } from "@housing/engine";
import { Icon } from "@/components/Icon";
import { ReportSheet } from "@/components/ReportSheet";
import { SubscriptionSheet } from "@/components/SubscriptionSheet";
import { BottomCTA, Card, ConditionRow, Header, IconButton, IconTile, KeyValue, Notice, Screen, SectionTitle, Sub, T, Tag } from "@/components/ui";
import { getAnnouncement, isReadable, ruleCounts, useAnnouncements } from "@/data/announcements";
import { inputSummary, ruleTitle } from "@/lib/conditions";
import { daysUntil, dday, HOUSING_LABEL, longDate, shortDate } from "@/lib/format";
import { unseenChange } from "@/lib/changes";
import { draftReport, findReport, REPORT_STATUS_LABEL, type ReportTarget } from "@/lib/reports";
import { hasSource, openSource } from "@/lib/source";
import { canOpenCost, useAppState } from "@/store/appState";
import { useTheme } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";

/** 공고 상세: 조건 체크리스트(근거 쪽), 위치, 일정, 비용 계산 CTA */
export default function AnnouncementDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { state, toggleSaved, addReport, seeChange } = useAppState();
  const { list } = useAnnouncements();
  const a = getAnnouncement(id ?? "", list);
  const [sheet, setSheet] = useState(false);
  // 들어올 때 한 번만 집는다. 본 것으로 표시해도 이 화면에서는 계속 보이게 하려고.
  const [change] = useState(() => unseenChange(state.changes, id ?? ""));
  const [report, setReport] = useState<{ target: ReportTarget; sourceText?: string } | null>(null);
  // 닫히는 동안에도 내용이 보여야 시트가 빈 채로 내려가지 않는다
  const lastReport = useRef<{ target: ReportTarget; sourceText?: string } | null>(null);
  if (report) lastReport.current = report;
  const distanceKm = a && state.profile?.workplace && a.lat !== undefined && a.lng !== undefined ? haversineKm(state.profile.workplace, { lat: a.lat, lng: a.lng }) : null;

  const match = useMemo(() => (a && isReadable(a) && state.profile ? matchAnnouncement(a.extraction, state.profile) : null), [a, state.profile]);
  const track = match?.best_track ?? (match ? [...match.tracks].sort((x, y) => y.summary.matched - x.summary.matched)[0] ?? null : null);
  const hasRental = !!a?.extraction.tracks.some((t) => t.pricing.some((p) => p.kind === "rental"));
  // 가격이 아예 없는 공고를 "분양"이라고 하면 사실이 아니다. 두 경우를 나눠 말한다.
  const hasAnyPricing = !!a?.extraction.tracks.some((t) => t.pricing.length > 0);
  const saved = !!a && state.saved.includes(a.id);

  useEffect(() => {
    if (change) seeChange(change.announcementId);
  }, [change, seeChange]);

  if (!a) {
    return (
      <Screen>
        <T variant="heading" style={{ paddingTop: 20 }}>공고를 찾을 수 없어요</T>
      </Screen>
    );
  }
  const counts = track ? ruleCounts(track) : { matched: 0, needsCheck: 0, total: 0 };
  const trackIndex = track ? a.extraction.tracks.indexOf(track.track) : -1;
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
    if (canOpenCost(state, a.id)) router.push(`/announcement/${a.id}/cost`);
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
          <View style={{ flexDirection: "row", gap: 6 }}>
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
                        {g.status === "MATCH" ? <Icon name="check" size={13} color={colors.ok} strokeWidth={3} /> : null}
                      </View>
                      {rules.map((r, i) => (
                        <ConditionRow key={i} status={r.status} title={ruleTitle(r.rule)} why={inputSummary(r.rule, state.profile, r)} page={r.rule.source.page} {...rowReport(r)} />
                      ))}
                    </View>
                  );
                }
                return rules.map((r, i) => (
                  <ConditionRow key={`${g.group.id}-${i}`} status={r.status} title={ruleTitle(r.rule)} why={inputSummary(r.rule, state.profile, r)} page={r.rule.source.page} {...rowReport(r)} />
                ));
              })}
            </Card>
            {match && match.tracks.length > 1 ? (
              <Sub tone="3" variant="caption" style={{ paddingHorizontal: 4 }}>다른 트랙 · {match.tracks.filter((t) => t !== track).map((t) => { const c = ruleCounts(t); return `${t.track.name} ${c.matched}/${c.total}`; }).join(" · ")}</Sub>
            ) : null}
          </View>
        ) : null}

        {(a.lat !== undefined || a.transit?.nearest_station) ? (
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <IconTile name="map-pin" tone="info" />
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="bodyMedium">{a.transit?.nearest_station ? `${a.transit.nearest_station} 도보 ${a.transit.station_walk_min}분` : "위치"}</T>
              <Sub tone="3" variant="caption">{distanceKm !== null ? `직장(${state.profile?.workplace?.label ?? ""})까지 직선 약 ${distanceKm.toFixed(0)}km · 통근 시간은 준비 중` : state.profile?.workplace ? "위치 좌표가 없어 거리를 계산할 수 없어요" : "직장 위치를 넣으면 거리가 보여요"}</Sub>
            </View>
          </Card>
        ) : null}

        {hasSource(a.pdf_url) ? (
          <Card onPress={() => void openSource(a.pdf_url!)} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <IconTile name="info" tone="gray" />
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="bodyMedium">공고문 원문 보기</T>
              <Sub tone="3" variant="caption">기관 사이트의 공고문 PDF · 접수 전에 원본을 꼭 확인하세요</Sub>
            </View>
            <Icon name="right" size={18} color={colors.text4} />
          </Card>
        ) : null}

        <View style={{ gap: 12 }}>
          <SectionTitle>일정</SectionTitle>
          <Card style={{ gap: 14 }}>
            <KeyValue label="공고일" value={longDate(a.notice_date)} />
            <KeyValue label="접수" value={`${shortDate(a.apply_start)} ~ ${shortDate(a.apply_end)}`} />
            {a.extraction.schedule.winner_announce ? <KeyValue label="당첨자 발표" value={longDate(a.extraction.schedule.winner_announce)} /> : null}
            {a.extraction.schedule.move_in ? <KeyValue label="입주 예정" value={a.extraction.schedule.move_in} /> : null}
          </Card>
        </View>

        {a.extraction.notes.length > 0 ? (
          <View style={{ gap: 12 }}>
            <SectionTitle>그 밖의 조건</SectionTitle>
            <Card style={{ gap: 12 }}>
              {a.extraction.notes.slice(0, 4).map((n, i) => <Sub key={i}>{n}</Sub>)}
            </Card>
          </View>
        ) : null}
        <Sub tone="3" variant="caption" style={{ paddingHorizontal: 4 }}>
          조건 일치는 공고문과 입력값을 비교한 결과예요. 실제 자격은 서류 심사로 확정됩니다.
          {a.status === "VERIFIED" ? " 이 공고의 조건은 사람이 공고문과 대조했어요." : ""} 숫자가 이상하면 그 줄을 눌러 알려 주세요.
        </Sub>
        <View style={{ height: 24 }} />
      </View>

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
