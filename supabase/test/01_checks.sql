-- 마이그레이션이 "적용된다"가 아니라 "설계대로 움직인다"를 확인한다.
-- 실패하면 raise exception으로 멈춘다 (psql은 ON_ERROR_STOP으로 돌린다).

\set ON_ERROR_STOP on

-- ── 1. 게시 전에는 앱이 공고를 보지 못한다 ──────────────────────────────
insert into announcements (id, lh_id, provider, title, housing_type, region_code, apply_end, latest_version)
values ('11111111-1111-4111-8111-111111111111', 'TEST-001', 'LH', '검증용 공고', 'happy', '11', current_date + 10, 1);

insert into announcement_versions (id, announcement_id, version, status, extraction, checks)
values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 1, 'UNVERIFIED',
        '{"title":"검증용 공고","housing_type":"happy","schedule":{},"tracks":[],"notes":[]}'::jsonb,
        '["가격 정보 없음"]'::jsonb);

do $$ declare s text; begin
  select status into s from app_announcements where lh_id = 'TEST-001';
  if s <> 'UNVERIFIED' then raise exception '게시 전인데 status=%', s; end if;
end $$;

-- ── 2. 자동 게시: 사람 승인 없이 AUTO로 내려간다 ────────────────────────
select auto_publish_version('22222222-2222-4222-8222-222222222222');

do $$ declare s text; e jsonb; c jsonb; begin
  select status, extraction, checks into s, e, c from app_announcements where lh_id = 'TEST-001';
  if s <> 'AUTO' then raise exception '자동 게시 후 status=% (AUTO여야 한다)', s; end if;
  if e is null then raise exception '자동 게시했는데 extraction이 비어 있다'; end if;
  if c ->> 0 <> '가격 정보 없음' then raise exception 'checks가 내려오지 않았다: %', c; end if;
end $$;

-- ── 3. 사람 확인 도장을 찍으면 VERIFIED ─────────────────────────────────
select publish_version('22222222-2222-4222-8222-222222222222', '검수자');

do $$ declare s text; vb text; begin
  select status into s from app_announcements where lh_id = 'TEST-001';
  if s <> 'VERIFIED' then raise exception '사람 확인 후 status=%', s; end if;
  select verified_by into vb from announcement_versions where id = '22222222-2222-4222-8222-222222222222';
  if vb <> '검수자' then raise exception 'verified_by가 기록되지 않았다: %', vb; end if;
end $$;

-- ── 4. CONFLICT는 자동 게시하지 않는다 ──────────────────────────────────
insert into announcement_versions (id, announcement_id, version, status, conflict_reasons)
values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 2, 'CONFLICT',
        '["소득 상한이 비현실적으로 크다"]'::jsonb);

do $$ begin
  begin
    perform auto_publish_version('33333333-3333-4333-8333-333333333333');
    raise exception 'CONFLICT 버전이 게시되었다';
  exception when others then
    if sqlerrm like '%CONFLICT 버전이 게시되었다%' then raise; end if;
  end;
end $$;

-- 게시된 버전이 CONFLICT로 바뀌면 앱은 다시 못 본다 (뷰의 조인 조건)
update announcement_versions set status = 'CONFLICT' where id = '22222222-2222-4222-8222-222222222222';
do $$ declare s text; begin
  select status into s from app_announcements where lh_id = 'TEST-001';
  if s <> 'UNVERIFIED' then raise exception 'CONFLICT인데 앱에 status=%로 보인다', s; end if;
end $$;
update announcement_versions set status = 'VERIFIED' where id = '22222222-2222-4222-8222-222222222222';

-- ── 5. 신고: 같은 client_id가 다시 와도 한 건으로 남는다 ────────────────
insert into issue_reports (announcement_id, client_id, target_kind, track_index, item_index, label, page, message)
values ('11111111-1111-4111-8111-111111111111', 'client-abc', 'pricing', 0, 3, '59A 보증금 5억', 15, '공고문과 달라요');

-- 앱은 upsert를 쓰지 않는다 (PostgREST upsert는 UPDATE 정책까지 요구한다).
-- 재전송은 유일 인덱스에 막혀 409가 되고, 앱은 그걸 "이미 들어감"으로 본다.
do $$ begin
  begin
    insert into issue_reports (announcement_id, client_id, target_kind, label, message)
    values ('11111111-1111-4111-8111-111111111111', 'client-abc', 'pricing', '59A 보증금 5억', '재전송');
    raise exception '같은 client_id가 두 번 들어갔다';
  exception when unique_violation then null;
  end;
end $$;

do $$ declare n int; begin
  select count(*) into n from issue_reports where client_id = 'client-abc';
  if n <> 1 then raise exception '재전송으로 신고가 %건 쌓였다', n; end if;
end $$;

-- ── 6. 신고 상태 뷰는 message를 내려 주지 않는다 ────────────────────────
do $$ declare n int; begin
  select count(*) into n from information_schema.columns
   where table_name = 'issue_report_status' and column_name = 'message';
  if n <> 0 then raise exception 'issue_report_status에 message가 노출된다'; end if;
end $$;

do $$ declare s text; begin
  select status into s from issue_report_status where client_id = 'client-abc';
  if s <> 'OPEN' then raise exception '신고 초기 상태가 %', s; end if;
end $$;

-- ── 7. 검수 큐가 쓰는 상태 값이 허용되는가 ──────────────────────────────
update issue_reports set status = 'FIXED', resolution = '알려 주신 대로 고쳤어요', resolved_at = now()
 where client_id = 'client-abc';

do $$ begin
  begin
    update issue_reports set status = 'WHATEVER' where client_id = 'client-abc';
    raise exception '허용되지 않은 status가 들어갔다';
  exception when check_violation then null;
  end;
end $$;

-- ── 8. 앱이 읽는 컬럼이 뷰에 다 있는가 (apps/mobile/src/data/remote.ts의 FeedRow) ──
do $$
declare missing text;
begin
  select string_agg(c, ', ') into missing
  from unnest(array['id','lh_id','provider','title','housing_type','region_code','status',
                    'notice_date','apply_start','apply_end','pdf_url','lat','lng','transit','nearby','extraction','checks']) c
  where not exists (
    select 1 from information_schema.columns
     where table_name = 'app_announcements' and column_name = c
  );
  if missing is not null then raise exception '앱이 읽는 컬럼이 뷰에 없다: %', missing; end if;
end $$;

select '모든 검증 통과' as result;
