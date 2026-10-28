begin;
create table public.privacy_settings (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 read_receipts boolean not null default true,
 discoverable boolean not null default true
);
alter table public.privacy_settings enable row level security;
create policy privacy_read on public.privacy_settings for select to authenticated using(user_id=auth.uid());
revoke all on public.privacy_settings from anon,authenticated;
grant select on public.privacy_settings to authenticated;
create function public.set_privacy_settings(share_read_receipts boolean default null,allow_discovery boolean default null) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.rate_limit('privacy_settings',30,60);
 if share_read_receipts is null and allow_discovery is null then raise exception 'Укажите настройки приватности'; end if;
 insert into public.privacy_settings as settings(user_id,read_receipts,discoverable) values(auth.uid(),coalesce(share_read_receipts,true),coalesce(allow_discovery,true))
 on conflict(user_id) do update set read_receipts=coalesce(share_read_receipts,settings.read_receipts),discoverable=coalesce(allow_discovery,settings.discoverable);
end $$;
create or replace function public.mark_read(cid uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if coalesce((select read_receipts from public.privacy_settings where user_id=auth.uid()),true) then
 update public.conversation_members set last_read_at=now() where conversation_id=cid and user_id=auth.uid();
 end if;
end $$;
create or replace function public.find_user(exact_username text) returns setof public.profiles language plpgsql security definer set search_path='' as $$begin
 perform private.rate_limit('search',20,60);
 return query select p.* from public.profiles p where p.username=lower(ltrim(btrim(exact_username),'@')) and p.id<>auth.uid()
 and (private.is_peer(p.id) or coalesce((select discoverable from public.privacy_settings where user_id=p.id),true));
end $$;
create function public.list_blocked_users(after_username text default null) returns table(id uuid,username text,display_name text)
language plpgsql security definer set search_path='' as $$begin
 perform private.rate_limit('blocked_list',60,60);
 return query select p.id,p.username,p.display_name from public.blocks b join public.profiles p on p.id=b.blocked_id
 where b.blocker_id=auth.uid() and (after_username is null or p.username>after_username) order by p.username limit 50;
end $$;
revoke execute on function public.set_privacy_settings(boolean,boolean),public.list_blocked_users(text) from public,anon;
grant execute on function public.set_privacy_settings(boolean,boolean),public.list_blocked_users(text) to authenticated;
commit;
