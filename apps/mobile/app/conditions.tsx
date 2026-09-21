import { useRouter } from "expo-router";
import { View } from "react-native";
import { Card, Header, ListRow, PageTitle, Screen, SectionTitle, Sub } from "@/components/ui";
import { stepDisplay, stepLabel, visibleSteps } from "@/lib/onboarding";
import { useAppState } from "@/store/appState";

/**
 * 내 조건 목록. 항목 하나를 눌러 그것만 고친다.
 *
 * 전에는 "수정"이 처음부터 스무 질문을 다시 걷게 했다. 연소득 하나 바꾸려고 생년월일부터
 * 다시 지나야 하면 아무도 고치지 않는다. 고치지 않으면 값이 낡고, 낡은 값으로 판정한 결과는
 * 틀린 채로 남는다 — 이 앱이 파는 것이 그 판정이라 그대로 두면 안 된다.
 *
 * 묶음은 사람이 한 번에 떠올리는 단위로 나눈다. 단계 순서는 처음 입력할 때의 순서이고,
 * 고칠 때 찾는 순서와는 다르다.
 */
const GROUPS: { title: string; ids: string[] }[] = [
  { title: "나와 가구", ids: ["birth_date", "marriage", "marriage_years", "household_size", "children_count", "youngest", "statuses"] },
  { title: "사는 곳과 직장", ids: ["region", "sigungu", "workplace_region", "workplace_sigungu", "workplace_partner_region", "workplace_partner_sigungu"] },
  { title: "소득과 자산", ids: ["income_type", "annual_income", "total_assets", "car_value", "debt", "cash"] },
  { title: "주택과 청약", ids: ["homeless", "homeless_months", "subscription_months", "subscription_active"] },
];

export default function Conditions() {
  const router = useRouter();
  const { state } = useAppState();
  const profile = state.profile ?? {};
  const steps = visibleSteps(profile);
  const byId = new Map(steps.map((s) => [s.id, s]));

  // 묶음에 넣지 못한 단계가 생기면 마지막에 모아 둔다. 조용히 사라지면 고칠 수 없는 항목이 된다.
  const grouped = new Set(GROUPS.flatMap((g) => g.ids));
  const rest = steps.filter((s) => !grouped.has(s.id) && s.kind !== "skip-info");

  const open = (id: string) => router.push(`/onboarding?step=${id}`);

  return (
    <Screen header={<Header onBack={() => router.back()} title="내 조건" />}>
      <PageTitle title="내 조건" sub="항목을 눌러 그것만 고칠 수 있어요. 고치면 공고 판정에 바로 반영돼요." />

      {[...GROUPS, ...(rest.length ? [{ title: "그 밖에", ids: rest.map((s) => s.id) }] : [])].map((group) => {
        const rows = group.ids.map((id) => byId.get(id)).filter((s): s is NonNullable<typeof s> => !!s && s.kind !== "skip-info");
        if (rows.length === 0) return null;
        return (
          <View key={group.title} style={{ gap: 12 }}>
            <SectionTitle>{group.title}</SectionTitle>
            <Card style={{ paddingVertical: 4 }}>
              {rows.map((s) => {
                const value = stepDisplay(s, profile);
                return (
                  <ListRow
                    key={s.id}
                    label={stepLabel(s)}
                    value={value ?? "입력 안 함"}
                    onPress={() => open(s.id)}
                  />
                );
              })}
            </Card>
          </View>
        );
      })}

      <Sub tone="3" variant="caption">
        여기 적은 값은 기기에만 저장돼요. 서버로 보내지 않아요.
      </Sub>
    </Screen>
  );
}
