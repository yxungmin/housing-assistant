import { useState } from "react";
import { useRouter } from "expo-router";
import { Linking, Pressable, View } from "react-native";
import { ageFromBirthDate, monthsBetween } from "@housing/engine";
import { SubscriptionManageSheet } from "@/components/SubscriptionSheet";
import { BottomSheet, Card, Chip, ListRow, Notice, PageTitle, Screen, SectionTitle, Sub, T, Tag } from "@/components/ui";
import { LOAN_AS_OF } from "@/data/loans";
import { useAnnouncements } from "@/data/announcements";
import { remoteConfigured } from "@/data/remote";
import { daysLeft } from "@/lib/billing";
import { usePrice } from "@/data/price";
import { BUSINESS, BUSINESS_FIELDS, businessBlanks, ftcLookupUrl } from "@/legal/business";
import { longDate, manwon, yearsMonths } from "@/lib/format";
import { getPushToken, notificationsSupported, requestNotificationPermission } from "@/lib/notifications";
import { SERVICE_REGION_LABEL } from "@housing/schema";
import { REGIONS } from "@/lib/onboarding";
import { isOpen, REPORT_STATUS_LABEL } from "@/lib/reports";
import { useAppState, type ThemePref } from "@/store/appState";
import { PROVIDER_LABEL } from "@/lib/auth";
import { SignInSheet } from "@/components/SignIn";
import { useTheme } from "@/theme/ThemeProvider";

const MARRIAGE: Record<string, string> = { single: "미혼", married: "기혼", pre_marriage: "예비 신혼부부", single_parent: "한부모" };

/** 내 정보: 조건 수정(항상 무료), 구독 상태, 알림, 데이터 기준일, 화면 모드 */
export default function Profile() {
  const { state, setTheme, setNotifications, reset, signOut, deleteAccount } = useAppState();
  const { colors } = useTheme();
  const router = useRouter();
  const feed = useAnnouncements();
  const { monthly: price, amount } = usePrice();
  const [manage, setManage] = useState(false);
  const [signInSheet, setSignInSheet] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [notiMsg, setNotiMsg] = useState<string | null>(null);
  const [reports, setReports] = useState(false);
  const openReports = state.reports.filter(isOpen).length;
  const p = state.profile;
  const missing: string[] = [];
  if (p?.car_value === undefined) missing.push("자동차 가액");
  if (p?.monthly_debt_payment === undefined) missing.push("월 부채 상환액");
  // 보유 현금이 없으면 예상 주거비가 "얼마가 모자라는지"를 말하지 못한다
  if (p?.cash_on_hand === undefined) missing.push("보유 현금");
  if (!p?.workplace) missing.push("직장 위치");
  // 부부는 두 사람 통근을 같이 봐야 후보가 제대로 걸러진다
  else if ((p.marriage === "married" || p.marriage === "pre_marriage") && !p.workplace_partner) missing.push("배우자 직장 위치");
  const sub = state.subscription;
  const age = p?.birth_date ? `${p.birth_date.slice(0, 4)}년생 · 만 ${ageFromBirthDate(p.birth_date)}세` : p?.age !== undefined ? `만 ${p.age}세` : "";
  const subLabel = { none: "구독 전", trial: "첫 달 무료 이용 중", active: "구독 중", expired: "구독 종료" }[sub.status];
  const subSub =
    sub.status === "trial" ? sub.cancelled ? `${longDate(sub.expiresAt?.slice(0, 10))}까지 무료 · 해지해서 결제되지 않아요` : `${longDate(sub.expiresAt?.slice(0, 10))}에 ${amount} 첫 결제 · 이후 ${price}`
    : sub.status === "active" ? `${price}${sub.cancelled ? ` · ${longDate(sub.expiresAt?.slice(0, 10))}에 종료` : ` · ${daysLeft(sub)}일 뒤 갱신`}`
    : sub.status === "expired" ? "다시 구독하면 모든 공고를 계산할 수 있어요"
    : "구독하면 필요한 현금과 월 주거비를 계산해 드려요";

  const toggleNotifications = async () => {
    if (!notificationsSupported) {
      setNotiMsg("알림은 iOS·Android 앱에서만 켤 수 있어요.");
      return;
    }
    if (state.notifications) {
      setNotifications(false, null);
      setNotiMsg(null);
      return;
    }
    const ok = await requestNotificationPermission();
    if (!ok) {
      setNotiMsg("알림 권한이 꺼져 있어요. 기기 설정에서 허용해 주세요.");
      return;
    }
    const token = await getPushToken();
    setNotifications(true, token);
    setNotiMsg(null);
  };

  return (
    <Screen>
      <PageTitle title="내 정보" />

      <Card onPress={() => router.push("/conditions")} style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <T variant="subheading">내 조건</T>
          <Tag tone={p ? "gray" : "primary"}>{p ? "수정" : "입력하기"}</Tag>
        </View>
        {p ? (
          <View style={{ gap: 6 }}>
            <T variant="bodyMedium">{age} · {p.household_size}인 가구 · {MARRIAGE[p.marriage ?? ""]}{p.income_type === "dual" ? " 맞벌이" : ""} · {p.region_sigungu ?? REGIONS.find((r) => r.value === p.region_code)?.label}</T>
            {/* 안 넣은 값은 "현금 -"처럼 기호로 두지 않고 빼 둔다. 무엇이 빠졌는지는 아래 "아직 입력하지 않은 항목"이 말한다 */}
            <Sub>
              {[
                p.monthly_income !== undefined ? `월 소득 ${manwon(p.monthly_income)}` : null,
                p.total_assets !== undefined ? `자산 ${manwon(p.total_assets)}` : null,
                p.cash_on_hand !== undefined ? `현금 ${manwon(p.cash_on_hand)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Sub>
            <Sub>{p.is_homeless ? `무주택 ${yearsMonths(p.homeless_months)}` : "유주택"} · 청약통장 {(p.subscription_months ?? 0) + (p.subscription_active && p.subscription_as_of ? monthsBetween(p.subscription_as_of) : 0)}개월{p.subscription_active ? " (납입 중)" : ""}</Sub>
            {p.workplace ? (
              <Sub>
                직장 {p.workplace.label ?? "위치 저장됨"}
                {p.workplace_partner ? ` · ${p.marriage === "pre_marriage" ? "예비 배우자" : "배우자"} ${p.workplace_partner.label ?? "위치 저장됨"}` : ""}
              </Sub>
            ) : null}
          </View>
        ) : (
          <Sub>아직 조건을 입력하지 않았어요.</Sub>
        )}
        {missing.length > 0 ? <Sub tone="3" variant="caption">아직 입력하지 않은 항목: {missing.join(", ")}. 입력하면 "확인 필요"였던 조건까지 맞춰 볼 수 있어요.</Sub> : null}
      </Card>

      <View style={{ gap: 8 }}>
        <SectionTitle>계정</SectionTitle>
        <Card style={{ gap: 4, paddingVertical: 8, paddingHorizontal: 12 }}>
          {state.account ? (
            <>
              <ListRow
                icon="user"
                iconTone="primary"
                label={`${PROVIDER_LABEL[state.account.provider]} 계정으로 로그인했어요`}
                sub={state.account.email ?? "계정에는 구독 상태만 저장돼요"}
              />
              <ListRow icon="logout" label="로그아웃" sub="조건과 저장한 공고는 이 기기에 그대로 남아요" onPress={() => setConfirmOut(true)} />
              {/* App Store 5.1.1(v): 계정을 만들 수 있으면 앱 안에서 삭제도 시작할 수 있어야 한다.
                  숨겨 두면 조항을 어기는 것이고, 애초에 남의 계정을 우리가 쥐고 있을 이유가 없다. */}
              <ListRow icon="trash" label="계정 삭제" sub="계정과 이 기기의 입력을 모두 지워요" danger onPress={() => { setDeleteError(null); setConfirmDelete(true); }} />
            </>
          ) : (
            // 이미 구독(체험) 중인데 "로그인하면 첫 달 0원"이라고 하면 앞뒤가 안 맞는다 (구매 복원 뒤에 생기는 상태)
            <ListRow
              icon="user"
              label="로그인"
              sub={sub.status === "trial" || sub.status === "active" ? "로그인하면 다른 기기에서도 구독을 이어서 써요" : "로그인하면 첫 달은 0원이에요"}
              onPress={() => setSignInSheet(true)}
            />
          )}
        </Card>
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle>구독</SectionTitle>
        <Card style={{ gap: 4, paddingVertical: 8, paddingHorizontal: 12 }}>
          {/* 미구독에 체크 표시가 붙어 있었다 — 모양이 "됐다"는 말이라 상태와 어긋난다 */}
          <ListRow
            icon={sub.status === "trial" || sub.status === "active" ? "check" : sub.status === "expired" ? "alert" : "info"}
            iconTone={sub.status === "trial" || sub.status === "active" ? "primary" : sub.status === "expired" ? "warn" : "gray"}
            label={subLabel}
            sub={subSub}
          />
          <ListRow icon="more" label="구독 관리" sub="구매 복원 · 갱신 해지" onPress={() => setManage(true)} />
        </Card>
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle>알림</SectionTitle>
        <Card style={{ gap: 4, paddingVertical: 8, paddingHorizontal: 12 }}>
          <ListRow
            icon="bell"
            iconTone={state.notifications ? "primary" : "gray"}
            label={state.notifications ? "알림 켜짐" : "알림 꺼짐"}
            sub={notiMsg ?? "관심 공고 마감 3일 전 · 내 지역 새 공고"}
            value={<Tag tone={state.notifications ? "primary" : "gray"}>{state.notifications ? "끄기" : "켜기"}</Tag>}
            onPress={() => void toggleNotifications()}
          />
        </Card>
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle>설정</SectionTitle>
        <Card style={{ gap: 4, paddingVertical: 8, paddingHorizontal: 12 }}>
          <ListRow icon="info" label="대출 금리 기준일" value={longDate(LOAN_AS_OF)} />
          <ListRow icon="house" label="공고 데이터" sub={feed.source === "remote" ? `서버 동기화 ${feed.syncedAt ? longDate(feed.syncedAt.slice(0, 10)) : ""}` : feed.source === "cache" ? "마지막 동기화 데이터 (오프라인)" : remoteConfigured ? "동기화 중" : "앱에 포함된 데이터"} value={`${feed.list.length}건`} />
          <ListRow icon="map-pin" label="제공 지역" sub="다른 지역은 아직 모으지 않아요" value={SERVICE_REGION_LABEL} />
          <ListRow
            icon="alert"
            label="이 숫자 이상해요"
            sub={state.reports.length === 0 ? "공고 화면에서 이상한 줄을 눌러 알려 주세요" : `신고 ${state.reports.length}건${openReports ? ` · 확인 중 ${openReports}건` : ""}`}
            onPress={state.reports.length > 0 ? () => setReports(true) : undefined}
          />
          <View style={{ paddingVertical: 12, paddingHorizontal: 4, gap: 12 }}>
            <T variant="bodyMedium">화면 모드</T>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["system", "light", "dark"] as ThemePref[]).map((m) => (
                <Chip key={m} on={state.themePref === m} onPress={() => setTheme(m)}>{{ system: "시스템 설정", light: "라이트", dark: "다크" }[m]}</Chip>
              ))}
            </View>
          </View>
        </Card>
      </View>

      <View style={{ gap: 8 }}>
        <SectionTitle>약관</SectionTitle>
        <Card style={{ gap: 4, paddingVertical: 8, paddingHorizontal: 12 }}>
          <ListRow icon="info" label="이용약관" onPress={() => router.push("/legal/terms")} />
          <ListRow icon="info" label="개인정보처리방침" onPress={() => router.push("/legal/privacy")} />
        </Card>
      </View>

      {/*
        사업자 정보 (legal/business.ts). 돈을 받는 서비스는 이용자가 쉽게 볼 수 있는 곳에 적어야 한다.
        빈칸도 숨기지 않고 "준비 중"으로 보인다 — 숨기면 비어 있다는 사실까지 숨겨진다.
      */}
      <View style={{ gap: 6, paddingHorizontal: 4 }}>
        <T variant="small" color={colors.text2}>사업자 정보</T>
        {BUSINESS_FIELDS.map(([key, label]) => (
          <View key={key} style={{ flexDirection: "row", gap: 12 }}>
            <Sub tone="3" variant="caption" style={{ width: 124 }}>{label}</Sub>
            <Sub tone={BUSINESS[key] ? "2" : "3"} variant="caption" style={{ flex: 1 }}>{BUSINESS[key] || "준비 중"}</Sub>
          </View>
        ))}
        {businessBlanks().length > 0 ? (
          <Sub tone="3" variant="caption">사업자 등록 중이에요. 등록이 끝나면 채워 둘게요.</Sub>
        ) : null}
        {ftcLookupUrl(BUSINESS.registrationNo) ? (
          <Pressable onPress={() => void Linking.openURL(ftcLookupUrl(BUSINESS.registrationNo)!)} accessibilityRole="link" hitSlop={8} style={{ alignSelf: "flex-start" }}>
            <Sub tone="3" variant="caption" style={{ textDecorationLine: "underline" }}>사업자 정보 확인 (공정거래위원회)</Sub>
          </Pressable>
        ) : null}
      </View>

      <Sub tone="3" variant="caption" style={{ paddingHorizontal: 4 }}>입력한 조건은 이 기기에만 저장되고 서버로 보내지 않아요.</Sub>
      {/* 한 번 물어본다. 바로 위 계정 삭제는 두 번 확인하는데 이건 한 번에 실행되고 있었다 —
          잃는 것은 거의 같다(조건·저장한 공고·알림). 되돌릴 수 없는 일은 같은 격으로 다룬다. */}
      <Pressable onPress={() => setConfirmReset(true)} accessibilityRole="button" style={{ paddingVertical: 12, paddingHorizontal: 4 }}>
        <T variant="small" color={colors.text3}>모든 데이터 지우고 처음부터</T>
      </Pressable>
      <SubscriptionManageSheet visible={manage} onClose={() => setManage(false)} />
      <SignInSheet visible={signInSheet} onClose={() => setSignInSheet(false)} />
      <BottomSheet visible={confirmReset} onClose={() => setConfirmReset(false)}>
        <View style={{ gap: 16 }}>
          <View style={{ gap: 6 }}>
            <T variant="title">모두 지우고 처음부터 할까요?</T>
            <Sub variant="body">
              이 기기의 조건·소득·자산, 저장한 공고, 알림 설정이 지워지고 처음 화면으로 돌아가요. 되돌릴 수 없어요.
            </Sub>
          </View>
          <Card style={{ gap: 4 }}>
            <T variant="bodyMedium">계정은 그대로예요</T>
            <Sub tone="3" variant="caption">
              로그인과 구독은 유지돼요. 계정까지 지우시려면 위의 “계정 삭제”를 눌러 주세요.
            </Sub>
          </Card>
          <ListRow icon="trash" label="지우고 처음부터" danger onPress={() => { setConfirmReset(false); reset(); }} />
        </View>
      </BottomSheet>
      {/* 되돌릴 수 없는 일이라 무엇이 사라지는지 먼저 다 적는다. 누른 뒤에 알게 되면 늦다. */}
      <BottomSheet visible={confirmDelete} onClose={() => (deleting ? undefined : setConfirmDelete(false))}>
        <View style={{ gap: 16 }}>
          <View style={{ gap: 6 }}>
            <T variant="title">계정을 삭제할까요?</T>
            <Sub variant="body">되돌릴 수 없어요. 같은 계정으로 다시 로그인해도 복구되지 않아요.</Sub>
          </View>
          <Card style={{ gap: 8 }}>
            <T variant="bodyMedium">지워지는 것</T>
            <Sub tone="3" variant="caption">
              서버의 계정과 구독 기록, 그리고 이 기기에 저장한 조건·소득·자산·저장한 공고·알림 설정이 모두 사라져요.
            </Sub>
            <T variant="bodyMedium" style={{ paddingTop: 4 }}>남는 것</T>
            <Sub tone="3" variant="caption">
              결제 기록은 세무 근거라 남지만 누구 것인지는 남지 않아요. 기기에는 "첫 달 무료를 썼다"는 표시 하나만 남아요.
            </Sub>
          </Card>
          {state.subscription.status === "trial" || state.subscription.status === "active" ? (
            <Notice tone="warn" icon="alert">
              구독은 스토어에서 따로 해지하셔야 해요. 계정을 지워도 스토어 결제는 멈추지 않아요.
            </Notice>
          ) : null}
          {deleteError ? <Sub tone="3" variant="caption" style={{ textAlign: "center" }}>{deleteError}</Sub> : null}
          <ListRow
            icon="trash"
            label={deleting ? "지우는 중" : "계정 삭제"}
            danger
            onPress={
              deleting
                ? undefined
                : () => {
                    setDeleting(true);
                    setDeleteError(null);
                    void deleteAccount()
                      .then(() => setConfirmDelete(false))
                      .catch((e: unknown) => setDeleteError(e instanceof Error ? e.message : "삭제하지 못했어요."))
                      .finally(() => setDeleting(false));
                  }
            }
          />
        </View>
      </BottomSheet>
      {/* 로그아웃은 한 번 묻는다. 눌러서 바로 나가면 되돌릴 방법이 로그인뿐이다 */}
      <BottomSheet visible={confirmOut} onClose={() => setConfirmOut(false)}>
        <View style={{ gap: 16 }}>
          <View style={{ gap: 6 }}>
            <T variant="title">로그아웃할까요?</T>
            <Sub variant="body">
              입력한 조건, 저장한 공고, 마감 알림은 이 기기에 그대로 남아요. 다시 로그인하면 구독도 그대로 이어져요.
            </Sub>
          </View>
          <ListRow icon="logout" label="로그아웃" danger onPress={() => { setConfirmOut(false); void signOut(); }} />
        </View>
      </BottomSheet>
      <BottomSheet visible={reports} onClose={() => setReports(false)}>
        <View style={{ gap: 8 }}>
          <T variant="title">내가 보낸 신고</T>
          <Sub>확인하고 결과를 여기에 남겨 드려요. 고쳐진 값은 공고 화면에 바로 반영돼요.</Sub>
        </View>
        <View style={{ gap: 18 }}>
          {state.reports.slice(0, 20).map((r) => (
            <View key={r.id} style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Tag tone={r.status === "OPEN" ? "gray" : "primary"}>{REPORT_STATUS_LABEL[r.status]}</Tag>
                <Sub tone="3" variant="caption">{longDate(r.createdAt.slice(0, 10))}</Sub>
              </View>
              <T variant="bodyMedium">{r.target.label}</T>
              <Sub tone="3" variant="caption">{r.announcementTitle}</Sub>
              {r.resolution ? <Sub variant="caption">{r.resolution}</Sub> : null}
            </View>
          ))}
        </View>
      </BottomSheet>
    </Screen>
  );
}
