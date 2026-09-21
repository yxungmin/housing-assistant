-- "이 숫자 이상해요"를 항목 단위로 받고, 처리 상태를 남긴다.
--
-- 앱은 announcement_versions.extraction(jsonb)만 읽으므로 eligibility_rules/pricing의 uuid를 모른다.
-- 그래서 신고는 (버전, 트랙 순번, 항목 순번) + 신고 당시 화면에 보이던 문장으로 가리킨다.
-- 문장을 함께 받는 이유: 재추출로 순번이 밀려도 검수자가 무엇을 신고한 건지 알 수 있어야 한다.
alter table issue_reports add column if not exists target_kind text not null default 'other';
alter table issue_reports add column if not exists track_index int;
alter table issue_reports add column if not exists item_index int;
alter table issue_reports add column if not exists label text;
alter table issue_reports add column if not exists page int;
alter table issue_reports add column if not exists suggested text;
alter table issue_reports add column if not exists version int;
alter table issue_reports add column if not exists status text not null default 'OPEN';
alter table issue_reports add column if not exists resolution text;
alter table issue_reports add column if not exists resolved_at timestamptz;
-- 기기가 만든 id. 네트워크가 끊겨 다시 보내도 한 건으로 남는다.
alter table issue_reports add column if not exists client_id text;

alter table issue_reports drop constraint if exists issue_reports_target_kind_check;
alter table issue_reports add constraint issue_reports_target_kind_check
  check (target_kind in ('rule', 'pricing', 'schedule', 'other'));

alter table issue_reports drop constraint if exists issue_reports_status_check;
alter table issue_reports add constraint issue_reports_status_check
  check (status in ('OPEN', 'NO_CHANGE', 'FIXED', 'SOURCE_AMENDED', 'INVALID'));

-- 같은 신고가 두 번 들어오지 않게 한다. 앱은 upsert를 쓰지 않고 그냥 넣은 뒤
-- 중복(409)이면 이미 보낸 것으로 본다 — upsert는 UPDATE 정책을 요구하는데,
-- 신고 테이블에 UPDATE를 열면 누구나 남의 신고를 고칠 수 있다.
create unique index if not exists issue_reports_client_idx on issue_reports (client_id);
create index if not exists issue_reports_queue_idx on issue_reports (status, created_at desc);
create index if not exists issue_reports_announcement_idx on issue_reports (announcement_id);

comment on column issue_reports.target_kind is '신고 대상: rule 자격 조건 / pricing 임대조건 / schedule 일정 / other';
comment on column issue_reports.label is '신고 당시 화면에 보이던 문장. 재추출로 순번이 밀려도 대상을 알아볼 수 있게 남긴다';
comment on column issue_reports.status is
  'OPEN 확인 중 / NO_CHANGE 원문과 같아 고칠 것 없음 / FIXED 우리가 틀려서 고침 / SOURCE_AMENDED 원문이 정정됨 / INVALID 신고 내용이 아님';
comment on column issue_reports.resolution is '사용자에게 보여 줄 한 줄 설명. 수정했으면 무엇을 어떻게 고쳤는지';

-- 신고자가 자기 신고의 처리 결과를 볼 수 있어야 "확인 중"이 끝을 맺는다.
-- message는 빼고 내려 준다 — 사용자가 쓴 글이 다른 사람에게 읽히면 안 된다.
--
-- issue_reports에는 insert 정책만 있어 anon은 읽지 못한다. 그래서 이 뷰만 security_invoker = false로 두어
-- RLS를 지나가게 하고, 대신 내려 줄 컬럼을 여기서 못 박는다 (app_announcements와 반대 방향의 선택).
-- 앱은 자기 client_id로만 조회한다. 전체를 훑어도 개인정보는 없다 (message 없음).
create or replace view issue_report_status
with (security_invoker = false) as
select id, client_id, announcement_id, target_kind, track_index, item_index, status, resolution, resolved_at, created_at
from issue_reports;

grant select on issue_report_status to anon, authenticated;
