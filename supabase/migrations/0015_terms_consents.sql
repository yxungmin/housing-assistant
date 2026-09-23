-- 이용약관 동의 기록.
--
-- 약관은 보여 주고 동의를 받아야 계약 내용이 된다. 나중에 "그런 약관은 본 적 없다"는 말이 나오면
-- 누가 어느 판에 언제 동의했는지가 유일한 근거다. 그래서 계정에 붙여 남긴다.
--
-- 개인정보 처리 "동의"는 여기 없다. 계정 id·이메일·구독 상태는 계약 이행에 필요한 정보라
-- 동의 없이 처리하고 처리방침으로 알린다(개인정보 보호법 제15조 제1항 제4호). 필수 동의로 묶지 않는다.
--
-- 계정에 담는 것이 구독 상태 + 이 기록뿐이라는 선은 그대로다. 프로필(소득·자산)은 여전히 기기에만 있다.
-- 계정을 지우면 같이 지운다(on delete cascade) — 계약이 끝났으니 동의 기록을 쥐고 있을 이유가 없다.
create table if not exists terms_consents (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- apps/mobile/src/legal/terms.ts의 TERMS_VERSION
  terms_version text not null,
  -- 만 14세 이상이라고 확인했는가. 14세 미만은 법정대리인 동의가 따로 필요해 여기서 받지 않는다
  age_confirmed boolean not null check (age_confirmed),
  -- 시각은 서버가 적는다. 기기 시계는 믿을 근거가 못 된다
  agreed_at timestamptz not null default now(),
  primary key (user_id, terms_version)
);

comment on table terms_consents is '이용약관 동의 기록 (판·시각). 계정 삭제와 함께 지워진다';

alter table terms_consents enable row level security;

-- 자기 기록만 넣고 읽는다. 남의 id로 넣는 것은 정책이 막는다.
drop policy if exists terms_consents_insert_own on terms_consents;
create policy terms_consents_insert_own on terms_consents for insert to authenticated with check (user_id = auth.uid());
drop policy if exists terms_consents_read_own on terms_consents;
create policy terms_consents_read_own on terms_consents for select to authenticated using (user_id = auth.uid());

-- 넣을 수 있는 칸을 셋으로 좁힌다. agreed_at을 앱이 적게 두면 날짜를 지어낼 수 있다.
-- 고치기·지우기 권한은 주지 않는다 — 동의 기록은 덧붙이기만 한다.
revoke all on terms_consents from anon, authenticated;
grant select on terms_consents to authenticated;
grant insert (user_id, terms_version, age_confirmed) on terms_consents to authenticated;
