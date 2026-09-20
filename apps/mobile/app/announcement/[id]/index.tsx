import { useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { matchAnnouncement } from "@housing/engine";
import { Icon } from "@/components/Icon";
import { SubscriptionSheet } from "@/components/SubscriptionSheet";
import { BottomCTA, Card, ConditionRow, Row, Screen, Sub, T, Tag } from "@/components/ui";
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
  const openCost = () => {
    if (canOpenCost(state, a.id)) router.push(`/announcement/${a.id}/cost`);
    else setSheet(true);
  };

  return (
    <Screen padded={false}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: space.lg, paddingVertical: 6 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="뒤로"><Icon name="left" color={colors.text2} /></Pressable>
        <Pressable onPress={() => toggleSaved(a.id)} hitSlop={10} accessibilityRole="button" accessibilityLabel={saved ? "관심 해제" : "관심 등록"}>
          <Icon name={saved ? "heart-filled" : "heart"} color={saved ? colors.primary : colors.text2} />
        </Pressable>
      </View>
      <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Tag>{HOUSING_LABEL[a.housing_type]}</Tag>
            {a.apply_end ? <Tag tone="gray">접수 {shortDate(a.apply_start)} ~ {shortDate(a.apply_end)} · {dday(a.apply_end)}</Tag> : null}
          </View>
          <T variant="heading" style={{ fontSize: 18, lineHeight: 25 }}>{a.title}</T>
          <Sub>{a.address ?? a.region_name}{a.extraction.tracks[0]?.households ? ` · 총 ${a.extraction.tracks.reduce((s, t) => s + (t.households ?? 0), 0)}세대` : ""}</Sub>
        </View>

        {a.status !== "VERIFIED" && (
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: 12 }}>
            <Icon name="alert" size={16} color={colors.warning} />
            <Sub style={{ flex: 1, color: colors.warning }}>공고 조건을 분석하고 있어요. 검수가 끝나면 조건 일치와 비용 계산이 열립니다. 지금은 공고문 원문만 볼 수 있어요.</Sub>
          </View>
        )}

        {track && (
          <Card>
            <Row>
              <T variant="label" style={{ opacity: 0.8 }}>{track.track.name} · 조건 {counts.total}개 중 {counts.matched}개 일치{counts.needsCheck ? ` · 확인 필요 ${counts.needsCheck}` : ""}</T>
              <Sub>근거 쪽</Sub>
            </Row>
            <View>
              {track.groups.map((g, gi) => {
                const rules = g.rules.filter((r) => !r.skipped);
                if (g.group.mode === "any_of" && rules.length > 1) {
                  return (
                    <View key={g.group.id} style={{ borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 4, marginVertical: 6 }}>
                      <Sub style={{ fontSize: 11.5 }}>{g.group.label} · 하나만 맞으면 됩니다 {g.status === "MATCH" ? "✓" : ""}</Sub>
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
            </View>
            {match && match.tracks.length > 1 && (
              <Sub>다른 트랙 {match.tracks.length - 1}개: {match.tracks.filter((t) => t !== track).map((t) => { const c = ruleCounts(t); return `${t.track.name} ${c.matched}/${c.total}`; }).join(", ")}</Sub>
            )}
          </Card>
        )}

        {(a.lat !== undefined || a.transit?.nearest_station) && (
          <View style={{ height: 110, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Icon name="map-pin" size={24} color={colors.primary} />
            <Sub>
              {a.transit?.nearest_station ? `${a.transit.nearest_station} 도보 ${a.transit.station_walk_min}분` : "위치"}
              {state.profile?.workplace ? " · 직장까지 계산 중" : " · 직장 위치를 넣으면 통근 시간이 보여요"}
            </Sub>
          </View>
        )}

        <Card>
          <T variant="label" style={{ opacity: 0.8 }}>일정</T>
          <Row><Sub>공고일</Sub><T variant="small">{longDate(a.notice_date)}</T></Row>
          <Row><Sub>접수</Sub><T variant="small">{longDate(a.apply_start)} ~ {longDate(a.apply_end)}</T></Row>
          {a.extraction.schedule.winner_announce ? <Row><Sub>당첨자 발표</Sub><T variant="small">{longDate(a.extraction.schedule.winner_announce)}</T></Row> : null}
          {a.extraction.schedule.move_in ? <Row><Sub>입주 예정</Sub><T variant="small">{a.extraction.schedule.move_in}</T></Row> : null}
        </Card>

        {a.extraction.notes.length > 0 && (
          <Card>
            <T variant="label" style={{ opacity: 0.8 }}>그 밖의 조건 (공고문 원문)</T>
            {a.extraction.notes.slice(0, 4).map((n, i) => <Sub key={i}>· {n}</Sub>)}
          </Card>
        )}
        <Sub>조건 일치는 공고문과 입력값을 비교한 결과예요. 실제 자격은 서류 심사로 확정됩니다.</Sub>
        <View style={{ height: 60 }} />
      </View>

      {a.status === "VERIFIED" && (
        <BottomCTA label={hasRental ? "비용 계산 보기" : "분양 공고는 계산을 아직 지원하지 않아요"} onPress={openCost} disabled={!hasRental} />
      )}
      <SubscriptionSheet visible={sheet} onClose={() => setSheet(false)} onStarted={() => router.push(`/announcement/${a.id}/cost`)} />
    </Screen>
  );
}
