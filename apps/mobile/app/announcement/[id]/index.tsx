import { useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { matchAnnouncement } from "@housing/engine";
import { Icon } from "@/components/Icon";
import { SubscriptionSheet } from "@/components/SubscriptionSheet";
import { BottomCTA, Card, ConditionRow, Header, IconButton, ListRow, Notice, Row, Screen, SectionTitle, Sub, T, Tag } from "@/components/ui";
import { getAnnouncement, ruleCounts } from "@/data/announcements";
import { inputSummary, ruleTitle } from "@/lib/conditions";
import { dday, HOUSING_LABEL, longDate, shortDate } from "@/lib/format";
import { canOpenCost, useAppState } from "@/store/appState";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";

/** 공고 상세: 조건 체크리스트(근거 쪽), 위치, 일정, 비용 계산 CTA */
export default function AnnouncementDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { state, toggleSaved } = useAppState();
  const a = getAnnouncement(id ?? "");
  const [sheet, setSheet] = useState(false);

  const match = useMemo(() => (a && a.status === "VERIFIED" && state.profile ? matchAnnouncement(a.extraction, state.profile) : null), [a, state.profile]);
  const track = match?.best_track ?? (match ? [...match.tracks].sort((x, y) => y.summary.matched - x.summary.matched)[0] ?? null : null);
  const hasRental = !!a?.extraction.tracks.some((t) => t.pricing.some((p) => p.kind === "rental"));
  const saved = !!a && state.saved.includes(a.id);

  if (!a) {
    return (
      <Screen>
        <T variant="heading" style={{ paddingTop: 20 }}>공고를 찾을 수 없어요</T>
      </Screen>
    );
  }
  const counts = track ? ruleCounts(track) : { matched: 0, needsCheck: 0, total: 0 };
  const households = a.extraction.tracks.reduce((s, t) => s + (t.households ?? 0), 0);
  const openCost = () => {
    if (canOpenCost(state, a.id)) router.push(`/announcement/${a.id}/cost`);
    else setSheet(true);
  };

  return (
    <Screen padded={false}>
      <Header onBack={() => router.back()} right={<IconButton name={saved ? "heart-filled" : "heart"} label={saved ? "관심 해제" : "관심 등록"} onPress={() => toggleSaved(a.id)} color={saved ? colors.primary : colors.text} />} />
      <View style={{ paddingHorizontal: space.screen, gap: space.lg }}>
        <View style={{ gap: 10, paddingTop: 8 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Tag tone="gray">{HOUSING_LABEL[a.housing_type]}</Tag>
            {a.apply_end ? <Tag tone={(() => { const d = dday(a.apply_end); return d.startsWith("D-") && Number(d.slice(2)) <= 14 ? "danger" : "gray"; })()}>{dday(a.apply_end)}</Tag> : null}
          </View>
          <T variant="title" style={{ fontSize: 24, lineHeight: 32 }}>{a.title}</T>
          <Sub>{a.address ?? a.region_name}{households ? ` · 총 ${households.toLocaleString("ko-KR")}세대` : ""}</Sub>
        </View>

        {a.status !== "VERIFIED" ? (
          <Notice tone="warn" icon="alert">공고 조건을 분석하고 있어요. 검수가 끝나면 조건 일치와 비용 계산이 열립니다.</Notice>
        ) : null}

        {track ? (
          <View style={{ gap: 8 }}>
            <SectionTitle right={<Sub tone="3">근거 쪽</Sub>}>{track.track.name}</SectionTitle>
            <Card style={{ gap: 0, paddingVertical: 6 }}>
              <View style={{ paddingVertical: 12 }}>
                <T variant="heading">조건 {counts.total}개 중 {counts.matched}개 일치{counts.needsCheck ? <T variant="heading" color={colors.warning}> · 확인 {counts.needsCheck}</T> : null}</T>
              </View>
              {track.groups.map((g, gi) => {
                const rules = g.rules.filter((r) => !r.skipped);
                if (g.group.mode === "any_of" && rules.length > 1) {
                  return (
                    <View key={g.group.id} style={{ backgroundColor: colors.cardSoft, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 4, marginVertical: 8 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 10 }}>
                        <Sub tone="3">{g.group.label} · 하나만 맞으면 됩니다</Sub>
                        {g.status === "MATCH" ? <Icon name="check" size={14} color={colors.ok} strokeWidth={3} /> : null}
                      </View>
                      {rules.map((r, i) => (
                        <ConditionRow key={i} first={i === 0} status={r.status} title={ruleTitle(r.rule)} why={inputSummary(r.rule, state.profile, r)} page={r.rule.source.page} />
                      ))}
                    </View>
                  );
                }
                return rules.map((r, i) => (
                  <ConditionRow key={`${g.group.id}-${i}`} first={gi === 0 && i === 0} status={r.status} title={ruleTitle(r.rule)} why={inputSummary(r.rule, state.profile, r)} page={r.rule.source.page} />
                ));
              })}
            </Card>
            {match && match.tracks.length > 1 ? (
              <Sub tone="3">다른 트랙: {match.tracks.filter((t) => t !== track).map((t) => { const c = ruleCounts(t); return `${t.track.name} ${c.matched}/${c.total}`; }).join(" · ")}</Sub>
            ) : null}
          </View>
        ) : null}

        {(a.lat !== undefined || a.transit?.nearest_station) ? (
          <Card soft style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Icon name="map-pin" size={22} color={colors.primary} />
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="bodyMedium">{a.transit?.nearest_station ? `${a.transit.nearest_station} 도보 ${a.transit.station_walk_min}분` : "위치"}</T>
              <Sub tone="3">{state.profile?.workplace ? "직장까지 시간 계산 중" : "직장 위치를 넣으면 통근 시간이 보여요"}</Sub>
            </View>
          </Card>
        ) : null}

        <View style={{ gap: 8 }}>
          <SectionTitle>일정</SectionTitle>
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            <ListRow first label="공고일" value={longDate(a.notice_date)} />
            <ListRow label="접수" value={`${shortDate(a.apply_start)} ~ ${shortDate(a.apply_end)}`} />
            {a.extraction.schedule.winner_announce ? <ListRow label="당첨자 발표" value={longDate(a.extraction.schedule.winner_announce)} /> : null}
            {a.extraction.schedule.move_in ? <ListRow label="입주 예정" value={a.extraction.schedule.move_in} /> : null}
          </Card>
        </View>

        {a.extraction.notes.length > 0 ? (
          <View style={{ gap: 8 }}>
            <SectionTitle>그 밖의 조건 (공고문 원문)</SectionTitle>
            <Card style={{ gap: 10 }}>
              {a.extraction.notes.slice(0, 4).map((n, i) => <T key={i} variant="small" color={colors.text2}>{n}</T>)}
            </Card>
          </View>
        ) : null}
        <Row style={{ gap: 8 }}>
          <Sub tone="3" style={{ flex: 1 }}>조건 일치는 공고문과 입력값을 비교한 결과예요. 실제 자격은 서류 심사로 확정됩니다.</Sub>
        </Row>
        <View style={{ height: 40 }} />
      </View>

      {a.status === "VERIFIED" ? (
        <BottomCTA label={hasRental ? "비용 계산 보기" : "분양 공고는 계산을 아직 지원하지 않아요"} onPress={openCost} disabled={!hasRental} />
      ) : null}
      <SubscriptionSheet visible={sheet} onClose={() => setSheet(false)} onStarted={() => router.push(`/announcement/${a.id}/cost`)} />
    </Screen>
  );
}
