import { memo, useMemo } from "react";
import { View } from "react-native";
import type { UserProfile } from "@housing/schema";
import { Card, Sub, T, Tag } from "./ui";
import { isReadable, type Matched } from "@/data/announcements";
import { LOANS } from "@/data/loans";
import { commuteFor, commuteShort, nearestHouseShort, splitStation } from "@/lib/commute";
import { housingLabel } from "@/lib/format";
import { fundsFor, fundsNote } from "@/lib/funds";
import { applyPhase, phaseLabel, phaseTone } from "@/lib/phase";
import { sizeText } from "@/lib/units";
import { useTheme } from "@/theme/ThemeProvider";
import { fonts } from "@/theme/tokens";

/**
 * 목록 카드. 상태(안 본 공고 여부·프로필)는 부모가 읽어 props로 준다 — 카드가 스토어를 직접 구독하면
 * 알림 하나가 와도 카드 수십 장이 같이 다시 그려진다 (2026-09-24 감사). memo라 props가 같으면 그대로다.
 */
export const AnnouncementCard = memo(function AnnouncementCard({ m, fresh, profile, onOpen }: { m: Matched; fresh: boolean; profile: UserProfile | null; onOpen: (id: string) => void }) {
  const { colors } = useTheme();
  const a = m.announcement;
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
  const funds = useMemo(() => fundsFor(a, profile, LOANS), [a, profile]);
  const note = m.match?.is_match ? fundsNote(funds) : null;

  const place = m.nearestHouse
    ? nearestHouseShort(m.distanceKm, m.distancePartnerKm) ?? a.region_name
    : commuteShort(
      m.distanceKm,
      m.distancePartnerKm,
      commuteFor(a.commute, profile?.workplace?.label),
      commuteFor(a.commute, profile?.workplace_partner?.label),
    ) ??
    (a.transit?.nearest_station ? `${splitStation(a.transit.nearest_station).station} 도보 약 ${a.transit.station_walk_min}분` : a.region_name);

  return (
    <Card onPress={() => onOpen(a.id)} style={{ gap: 12 }}>
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
          <T variant="subheading" style={{ flex: 1 }}>{a.title}</T>
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
});
