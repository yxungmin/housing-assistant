import { useRouter } from "expo-router";
import { View } from "react-native";
import { Card, Header, ListRow, PageTitle, Screen, SectionTitle, Sub } from "@/components/ui";
import { CONDITION_GROUPS, stepDisplay, stepLabel, visibleSteps } from "@/lib/onboarding";
import { useAppState } from "@/store/appState";

/**
 * 내 조건 목록. 항목 하나를 눌러 그것만 고친다.
 *
 * 전에는 "수정"이 처음부터 스무 질문을 다시 걷게 했다. 연소득 하나 바꾸려고 생년월일부터
 * 다시 지나야 하면 아무도 고치지 않는다. 고치지 않으면 값이 낡고, 낡은 값으로 판정한 결과는
 * 틀린 채로 남는다 — 이 앱이 파는 것이 그 판정이라 그대로 두면 안 된다.
 *
 * 묶음은 `lib/onboarding.ts`의 CONDITION_GROUPS에 있다. 단계 id와 같이 고쳐야 하는 표라서
 * 화면이 아니라 단계 정의 옆에 둔다.
 */
export default function Conditions() {
  const router = useRouter();
  const { state } = useAppState();
  const profile = state.profile ?? {};
  const steps = visibleSteps(profile);
  const byId = new Map(steps.map((s) => [s.id, s]));

  // 묶음에 넣지 못한 단계가 생기면 마지막에 모아 둔다. 조용히 사라지면 고칠 수 없는 항목이 된다.
  const grouped = new Set(CONDITION_GROUPS.flatMap((g) => g.ids));
  const rest = steps.filter((s) => !grouped.has(s.id) && s.kind !== "skip-info");

  const open = (id: string) => router.push(`/onboarding?step=${id}`);

  // 헤더에 제목을 또 넣지 않는다 — 바로 아래 PageTitle과 겹쳐 같은 말이 두 번 나온다
  return (
    <Screen header={<Header onBack={() => router.back()} />}>
      <PageTitle title="내 조건" sub="항목을 눌러 그것만 고칠 수 있어요. 고치면 공고마다 조건을 바로 다시 맞춰 봐요." />

      {[...CONDITION_GROUPS, ...(rest.length ? [{ title: "그 밖에", ids: rest.map((s) => s.id) }] : [])].map((group) => {
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
                    value={value ?? "아직 안 넣었어요"}
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
