-- 검수 통과 시 호출: 버전을 VERIFIED로 바꾸고 published_version을 옮긴다.
-- 앱은 published_version만 읽으므로 그 전까지 이전 VERIFIED 버전이 그대로 보인다.
create or replace function publish_version(p_version_id uuid, p_verified_by text default null)
returns void language plpgsql security definer as $$
declare
  v record;
begin
  select id, announcement_id, version into v from announcement_versions where id = p_version_id;
  if v.id is null then raise exception 'version not found'; end if;

  update announcement_versions
     set status = 'VERIFIED', verified_at = now(), verified_by = p_verified_by
   where id = p_version_id;
  update eligibility_rules r set verified = true
    from supply_tracks t where r.track_id = t.id and t.version_id = p_version_id;
  update announcements set published_version = v.version, updated_at = now()
   where id = v.announcement_id;
end $$;

-- 검수자가 보류: CONFLICT로
create or replace function reject_version(p_version_id uuid, p_reason text)
returns void language sql security definer as $$
  update announcement_versions
     set status = 'CONFLICT', conflict_reasons = conflict_reasons || to_jsonb(p_reason)
   where id = p_version_id;
$$;

-- 앱 조회용 뷰: 공고 + 게시된 버전의 트랙 id 목록
create or replace view published_announcements as
select a.*, v.id as version_id, v.status as version_status
  from announcements a
  left join announcement_versions v
    on v.announcement_id = a.id and v.version = a.published_version;
