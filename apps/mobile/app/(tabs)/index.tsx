import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { Icon } from "@/components/Icon";
import { BigNumber, Card, Chip, Row, Screen, Sub, T, Tag } from "@/components/ui";
import { ANNOUNCEMENTS, matchAll, matching, type Matched } from "@/data/announcements";
import { daysUntil, dday, HOUSING_LABEL } from "@/lib/format";
import { REGIONS } from "@/lib/onboarding";
import { useAppState } from "@/store/appState";
import { useTheme } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";

/** 홈: "조건에 맞는 공고 N개" 한 문장과 큰 숫자로 시작한다. */
export default function Home() {
  const { state } = useAppState();
  const { colors } = useTheme();
  const router = useRouter();
  const [myRegionOnly, setMyRegionOnly] = useState(false);
  const [rentalOnly, setRentalOnly] = useState(false);
  const [showOthers, setShowOthers] = useState(false);

  const all = useMemo(() => matchAll(state.profile), [state.profile]);
  const filtered = useMemo(
    () =>
      all.filter((m) => {
        if (myRegionOnly && state.profile?.region_code && m.announcement.region_code !== state.profile.region_code) return false;
        if (rentalOnly && m.announcement.housing_type === "public_sale") return false;
        return true;
      }),
    [all, myRegionOnly, rentalOnly, state.profile?.region_code],
  );
  const matched = matching(filtered);
  const pending = filtered.filter((m) => m.announcement.status !== "VERIFIED");
  const others = filtered.filter((m) => m.announcement.status === "VERIFIED" && !m.match?.is_match);
  const soon = matched.filter((m) => (daysUntil(m.announcement.apply_end) ?? 99) <= 14);
  const rest = matched.filter((m) => !soon.includes(m));
  const today = new Date();
  const regionLabel = REGIONS.find((r) => r.value === state.profile?.region_code)?.label ?? "내 지역";

  return (
    <Screen>
      <View style={{ paddingTop: 14, gap: 2 }}>
        <Sub>내 조건에 맞는 공고</Sub>
        <BigNumber value={String(matched.length)} unit="개" />
        <Sub>{today.getFullYear()}년 {today.getMonth() + 1}월 {today.getDate()}일 기준 · 공고 {ANNOUNCEMENTS.length}개 중</Sub>
      </View>
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        <Chip on={myRegionOnly} onPress={() => setMyRegionOnly((v) => !v)}>{regionLabel}만</Chip>
        <Chip on={rentalOnly} onPress={() => setRentalOnly((v) => !v)}>임대만</Chip>
      </View>

      {soon.length > 0 && <Section title="접수 임박" items={soon} onOpen={(id) => router.push(`/announcement/${id}`)} />}
      {rest.length > 0 && <Section title={soon.length ? "전체" : "조건에 맞는 공고"} items={rest} onOpen={(id) => router.push(`/announcement/${id}`)} />}
      {matched.length === 0 && (
        <Card>
          <T variant="heading">아직 조건에 맞는 공고가 없어요</T>
          <Sub>새 공고가 올라오면 알려드릴게요. 내 정보에서 비어 있는 조건을 채우면 판별되는 공고가 늘어날 수 있어요.</Sub>
        </Card>
      )}
      {pending.length > 0 && <Section title="분석 중" items={pending} onOpen={(id) => router.push(`/announcement/${id}`)} />}

      {others.length > 0 && (
        <View style={{ gap: space.md }}>
          <Chip on={showOthers} onPress={() => setShowOthers((v) => !v)}>조건이 맞지 않는 공고 {others.length}개 {showOthers ? "숨기기" : "보기"}</Chip>
          {showOthers && <Section items={others} onOpen={(id) => router.push(`/announcement/${id}`)} />}
        </View>
      )}
      <View style={{ height: 8 }} />
      <Sub style={{ color: colors.text2 }}>
        <Icon name="info" size={12} color={colors.text2} /> "조건 일치"는 공고문 조건과 입력값을 비교한 결과이며 신청 자격을 보장하지 않아요.
      </Sub>
    </Screen>
  );
}

function Section({ title, items, onOpen }: { title?: string; items: Matched[]; onOpen: (id: string) => void }) {
  return (
    <View style={{ gap: 10 }}>
      {title ? <T variant="label" style={{ marginTop: 4, opacity: 0.7 }}>{title}</T> : null}
      {items.map((m) => <AnnouncementCard key={m.announcement.id} m={m} onPress={() => onOpen(m.announcement.id)} />)}
    </View>
  );
}

export function AnnouncementCard({ m, onPress }: { m: Matched; onPress: () => void }) {
  const { colors } = useTheme();
  const a = m.announcement;
  const days = daysUntil(a.apply_end);
  const units = a.extraction.tracks.flatMap((t) => t.unit_types.map((u) => u.name));
  const unitLabel = units.length ? [...new Set(units)].slice(0, 4).join("·") + (units.length > 4 ? " 외" : "") : "";
  return (
    <Card onPress={onPress}>
      <Row>
        <T variant="heading" style={{ flex: 1, fontSize: 15 }}>{a.title}</T>
        {days !== null ? <Tag tone={days <= 14 ? "danger" : "gray"}>{dday(a.apply_end)}</Tag> : null}
      </Row>
      <Sub>
        {HOUSING_LABEL[a.housing_type]}{unitLabel ? ` · ${unitLabel}` : ""}{a.region_name ? ` · ${a.region_name}` : ""}
      </Sub>
      <Row style={{ marginTop: 4 }}>
        {a.status !== "VERIFIED" ? (
          <Tag tone="warn" icon="alert">공고 조건 분석 중</Tag>
        ) : m.match?.is_match ? (
          <Tag icon="check">조건 {m.matched}/{m.total} 일치</Tag>
        ) : (
          <Tag tone="danger" icon="x">조건 {m.match?.best_track ? m.matched : Math.max(...m.match!.tracks.map((t) => t.summary.matched))}/{m.total || (m.match?.tracks[0] ? m.match.tracks[0].summary.matched + m.match.tracks[0].summary.mismatched + m.match.tracks[0].summary.needs_check : 0)} 일치</Tag>
        )}
        {m.distanceKm !== null ? <Sub>직장까지 약 {m.distanceKm.toFixed(0)}km</Sub> : a.transit?.nearest_station ? <Sub>{a.transit.nearest_station} 도보 {a.transit.station_walk_min}분</Sub> : <Sub style={{ color: colors.text2 }}>{a.address ? "" : ""}</Sub>}
      </Row>
    </Card>
  );
}
