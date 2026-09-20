import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/Icon";
import { BigNumber, Card, Chip, IconTile, Screen, SectionTitle, Sub, T, Tag } from "@/components/ui";
import { ANNOUNCEMENTS, matchAll, matching, type Matched } from "@/data/announcements";
import { daysUntil, dday, HOUSING_LABEL } from "@/lib/format";
import { REGIONS } from "@/lib/onboarding";
import { useAppState } from "@/store/appState";
import { useTheme } from "@/theme/ThemeProvider";
import { fonts } from "@/theme/tokens";

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
  const open = (id: string) => router.push(`/announcement/${id}`);

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingTop: 28 }}>
        <View style={{ gap: 6 }}>
          <T variant="body" color={colors.text2}>내 조건에 맞는 공고</T>
          <BigNumber value={String(matched.length)} unit="개" size={44} />
          <Sub tone="3">{today.getMonth() + 1}월 {today.getDate()}일 기준 · 전체 공고 {ANNOUNCEMENTS.length}개</Sub>
        </View>
        <IconTile name="house" tone="primary" size={56} />
      </View>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Chip on={myRegionOnly} onPress={() => setMyRegionOnly((v) => !v)}>{regionLabel}만</Chip>
        <Chip on={rentalOnly} onPress={() => setRentalOnly((v) => !v)}>임대만</Chip>
      </View>

      {soon.length > 0 ? <Section title="접수 임박" items={soon} onOpen={open} /> : null}
      {rest.length > 0 ? <Section title={soon.length ? "그 밖의 공고" : "조건에 맞는 공고"} items={rest} onOpen={open} /> : null}
      {matched.length === 0 ? (
        <Card style={{ alignItems: "center", paddingVertical: 32, gap: 8 }}>
          <IconTile name="bookmark" size={48} />
          <T variant="heading" style={{ fontSize: 18, textAlign: "center" }}>아직 조건에 맞는 공고가 없어요</T>
          <Sub style={{ textAlign: "center" }}>새 공고가 올라오면 알려드릴게요. 내 정보에서 비어 있는 조건을 채우면 판별되는 공고가 늘어날 수 있어요.</Sub>
        </Card>
      ) : null}
      {pending.length > 0 ? <Section title="조건 분석 중" items={pending} onOpen={open} /> : null}

      {others.length > 0 ? (
        <Pressable onPress={() => setShowOthers((v) => !v)} accessibilityRole="button" style={({ pressed }) => ({ paddingVertical: 14, paddingHorizontal: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between", opacity: pressed ? 0.6 : 1 })}>
          <T variant="bodyMedium" color={colors.text2}>조건이 맞지 않는 공고 {others.length}개</T>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <T variant="small" color={colors.text3}>{showOthers ? "숨기기" : "보기"}</T>
            <Icon name="right" size={16} color={colors.text4} />
          </View>
        </Pressable>
      ) : null}
      {showOthers && others.length > 0 ? <Section items={others} onOpen={open} /> : null}

      <View style={{ flexDirection: "row", gap: 8, paddingTop: 8, paddingHorizontal: 4 }}>
        <Icon name="info" size={16} color={colors.text4} />
        <Sub tone="3" variant="caption" style={{ flex: 1 }}>"조건 일치"는 공고문 조건과 입력값을 비교한 결과이며 신청 자격을 보장하지 않아요.</Sub>
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
  const a = m.announcement;
  const days = daysUntil(a.apply_end);
  const units = [...new Set(a.extraction.tracks.flatMap((t) => t.unit_types.map((u) => u.name)))];
  const unitLabel = units.length ? units.slice(0, 3).join(" · ") + (units.length > 3 ? ` 외 ${units.length - 3}` : "") : "";
  const status =
    a.status !== "VERIFIED"
      ? { tone: "warn" as const, icon: "alert" as const, text: "조건 분석 중" }
      : m.match?.is_match && m.matched > 0
        ? { tone: "primary" as const, icon: "check" as const, text: `조건 ${m.total}개 중 ${m.matched}개 일치${m.needsCheck ? ` · 확인 ${m.needsCheck}` : ""}` }
        : m.match?.is_match
          ? { tone: "warn" as const, icon: "alert" as const, text: `조건 ${m.needsCheck}개 확인 필요` }
          : { tone: "danger" as const, icon: "x" as const, text: `조건 ${m.total}개 중 ${m.matched}개 일치` };
  const place = m.distanceKm !== null ? `직장까지 약 ${m.distanceKm.toFixed(0)}km` : a.transit?.nearest_station ? `${a.transit.nearest_station} 도보 ${a.transit.station_walk_min}분` : a.region_name;

  return (
    <Card onPress={onPress} style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Sub tone="3" variant="caption">{HOUSING_LABEL[a.housing_type]}{unitLabel ? ` · ${unitLabel}` : ""}</Sub>
        {days !== null ? <T variant="label" color={days <= 14 ? colors.danger : colors.text3} style={{ fontFamily: fonts.bold }}>{dday(a.apply_end)}</T> : null}
      </View>
      <View style={{ gap: 4 }}>
        <T variant="subheading" style={{ fontSize: 18, lineHeight: 26 }}>{a.title}</T>
        {place ? <Sub tone="3">{place}</Sub> : null}
      </View>
      <View style={{ flexDirection: "row" }}>
        <Tag tone={status.tone} icon={status.icon}>{status.text}</Tag>
      </View>
    </Card>
  );
}
