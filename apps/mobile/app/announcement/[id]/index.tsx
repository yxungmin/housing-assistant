import { useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { haversineKm, matchAnnouncement } from "@housing/engine";
import { Icon } from "@/components/Icon";
import { SubscriptionSheet } from "@/components/SubscriptionSheet";
import { BottomCTA, Card, ConditionRow, Header, IconButton, IconTile, KeyValue, Notice, Screen, SectionTitle, Sub, T, Tag } from "@/components/ui";
import { getAnnouncement, ruleCounts, useAnnouncements } from "@/data/announcements";
import { inputSummary, ruleTitle } from "@/lib/conditions";
import { daysUntil, dday, HOUSING_LABEL, longDate, shortDate } from "@/lib/format";
import { canOpenCost, useAppState } from "@/store/appState";
import { useTheme } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";

/** 공고 상세: 조건 체크리스트(근거 쪽), 위치, 일정, 비용 계산 CTA */
export default function AnnouncementDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { state, toggleSaved } = useAppState();
  const { list } = useAnnouncements();
  const a = getAnnouncement(id ?? "", list);
  const [sheet, setSheet] = useState(false);
  const distanceKm = a && state.profile?.workplace && a.lat !== undefined && a.lng !== undefined ? haversineKm(state.profile.workplace, { lat: a.lat, lng: a.lng }) : null;

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
  const days = daysUntil(a.apply_end);
  const openCost = () => {
    if (canOpenCost(state, a.id)) router.push(`/announcement/${a.id}/cost`);
    else setSheet(true);
  };

  return (
    <Screen
      padded={false}
      header={<Header onBack={() => router.back()} right={<IconButton pop name={saved ? "heart-filled" : "heart"} label={saved ? "관심 해제" : "관심 등록"} onPress={() => toggleSaved(a.id)} color={saved ? colors.danger : colors.text} />} />}
      footer={a.status === "VERIFIED" ? <BottomCTA label={hasRental ? "예상 주거비 보기" : "분양 공고는 계산을 아직 지원하지 않아요"} onPress={openCost} disabled={!hasRental} /> : undefined}
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

        {a.status !== "VERIFIED" ? <Notice tone="warn" icon="alert">공고 조건을 분석하고 있어요. 검수가 끝나면 조건 일치와 비용 계산이 열립니다.</Notice> : null}

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
                        <ConditionRow key={i} status={r.status} title={ruleTitle(r.rule)} why={inputSummary(r.rule, state.profile, r)} page={r.rule.source.page} />
                      ))}
                    </View>
                  );
                }
                return rules.map((r, i) => (
                  <ConditionRow key={`${g.group.id}-${i}`} status={r.status} title={ruleTitle(r.rule)} why={inputSummary(r.rule, state.profile, r)} page={r.rule.source.page} />
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
        <Sub tone="3" variant="caption" style={{ paddingHorizontal: 4 }}>조건 일치는 공고문과 입력값을 비교한 결과예요. 실제 자격은 서류 심사로 확정됩니다.</Sub>
        <View style={{ height: 24 }} />
      </View>

      <SubscriptionSheet visible={sheet} onClose={() => setSheet(false)} onStarted={() => router.push(`/announcement/${a.id}/cost`)} />
    </Screen>
  );
}
