-- 승인 요청용 새 테이블만 추가하며 기존 메모와 정책은 변경하지 않습니다.
create table public.vault_device_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_hash text not null check (session_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending','approved','rejected','revoked')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  expires_at timestamptz,
  unique (user_id, session_hash),
  check (status <> 'approved' or (reviewed_at is not null and expires_at is not null))
);
alter table public.vault_device_requests enable row level security;
revoke all on public.vault_device_requests from public, anon, authenticated;
grant select, insert, update on public.vault_device_requests to service_role;

-- 검증된 서버만 호출. 세션 원문 대신 SHA-256을 저장합니다.
create function public.vault_device_access(p_user uuid, p_session uuid, p_request boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.vault_device_requests%rowtype; h text;
begin
  if not exists (select 1 from auth.sessions where id = p_session and user_id = p_user) then
    return jsonb_build_object('status','session_invalid','registered',false);
  end if;
  h := encode(sha256(convert_to(p_session::text, 'UTF8')), 'hex');
  if p_request then
    insert into public.vault_device_requests(user_id, session_hash)
      values(p_user, h) on conflict (user_id, session_hash) do nothing;
  end if;
  select * into r from public.vault_device_requests where user_id=p_user and session_hash=h;
  if not found then return jsonb_build_object('status','not_requested','registered',false); end if;
  if r.status='approved' and r.expires_at<=now() then
    return jsonb_build_object('status','expired','registered',false,'requestId',r.id);
  end if;
  return jsonb_build_object('status',r.status,'registered',r.status='approved' and r.expires_at>now(),'requestId',r.id);
end;
$$;
revoke all on function public.vault_device_access(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.vault_device_access(uuid,uuid,boolean) to service_role;
