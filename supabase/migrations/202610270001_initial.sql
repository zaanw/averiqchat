begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check (username ~ '^[a-z][a-z0-9_]{2,23}$'),
 display_name text not null check (length(btrim(display_name)) between 1 and 60),
 avatar_path text,
 created_at timestamptz not null default now(),
 constraint avatar_owner check (avatar_path is null or (split_part(avatar_path,'/',1)=id::text and avatar_path ~ '^[0-9a-f-]+/[0-9a-f-]+\.(jpg|png|webp)$'))
);
create table public.conversations (
 id uuid primary key default gen_random_uuid(), kind text not null check (kind in ('direct','group')),
 title text check (length(btrim(title)) between 1 and 80), avatar_path text,
 direct_key text unique, created_at timestamptz not null default now(),
 check ((kind='group' and title is not null and direct_key is null) or (kind='direct' and direct_key is not null and title is null)),
 check (avatar_path is null or (kind='group' and split_part(avatar_path,'/',1)=id::text))
);
create table public.conversation_members (
 conversation_id uuid not null references public.conversations on delete cascade,
 user_id uuid not null references public.profiles on delete cascade,
 role text not null default 'member' check (role in ('owner','member')),
 last_read_at timestamptz not null default 'epoch', joined_at timestamptz not null default now(),
 primary key (conversation_id,user_id)
);
create index members_user_idx on public.conversation_members(user_id,conversation_id);
create unique index one_owner_idx on public.conversation_members(conversation_id) where role='owner';
create table public.messages (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations on delete cascade,
 sender_id uuid not null references public.profiles, body text not null default '' check (length(body)<=4000),
 reply_to uuid references public.messages(id) on delete set null,
 created_at timestamptz not null default now(), edited_at timestamptz, deleted_at timestamptz,
 unique(id,conversation_id)
);
create index messages_history_idx on public.messages(conversation_id,created_at desc,id);
create index messages_sender_time_idx on public.messages(sender_id,created_at desc);
create table public.attachments (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations on delete cascade,
 message_id uuid unique, uploader_id uuid not null references public.profiles,
 path text unique not null, name text not null check(length(name) between 1 and 180),
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','application/pdf','text/plain')),
 size bigint not null check(size between 1 and 10485760), created_at timestamptz not null default now(),
 foreign key(message_id,conversation_id) references public.messages(id,conversation_id) on delete cascade,
 check(split_part(path,'/',1)=conversation_id::text and split_part(path,'/',2)=uploader_id::text and path ~ '^[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+\.(jpg|png|webp|pdf|txt)$')
);
create index attachments_conversation_idx on public.attachments(conversation_id);
create table public.blocks (
 blocker_id uuid not null references public.profiles on delete cascade, blocked_id uuid not null references public.profiles on delete cascade,
 created_at timestamptz not null default now(), primary key(blocker_id,blocked_id), check(blocker_id<>blocked_id)
);
create table public.reports (
 id uuid primary key default gen_random_uuid(), reporter_id uuid not null references public.profiles on delete cascade,
 message_id uuid not null references public.messages on delete cascade,
 reason text not null check(length(btrim(reason)) between 5 and 1000), created_at timestamptz not null default now(),
 unique(reporter_id,message_id)
);
create table private.rate_limits(user_id uuid not null references auth.users on delete cascade, action text not null, window_start timestamptz not null, hits integer not null,primary key(user_id,action));
create function private.rate_limit(action_name text, max_hits integer, seconds integer) returns void language plpgsql security definer set search_path='' as $$
declare n integer; begin
 if auth.uid() is null then raise exception 'Требуется вход'; end if;
 insert into private.rate_limits as r values(auth.uid(),action_name,clock_timestamp(),1)
 on conflict(user_id,action) do update set hits=case when r.window_start<clock_timestamp()-make_interval(secs=>seconds) then 1 else r.hits+1 end,
 window_start=case when r.window_start<clock_timestamp()-make_interval(secs=>seconds) then clock_timestamp() else r.window_start end returning hits into n;
 if n>max_hits then raise exception 'Слишком много запросов. Попробуйте позже.'; end if;
end $$;
create function private.is_member(cid uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.conversation_members where conversation_id=cid and user_id=auth.uid())$$;
create function private.is_owner(cid uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.conversation_members where conversation_id=cid and user_id=auth.uid() and role='owner')$$;
create function private.is_peer(pid uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.conversation_members a join public.conversation_members b using(conversation_id) where a.user_id=auth.uid() and b.user_id=pid)$$;
create function private.blocked(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.blocks where (blocker_id=a and blocked_id=b) or (blocker_id=b and blocked_id=a))$$;
create function private.can_send(cid uuid) returns boolean language sql stable security definer set search_path='' as $$select private.is_member(cid) and not exists(select 1 from public.conversations c join public.conversation_members m on m.conversation_id=c.id where c.id=cid and c.kind='direct' and m.user_id<>auth.uid() and private.blocked(auth.uid(),m.user_id))$$;
create function private.create_profile() returns trigger language plpgsql security definer set search_path='' as $$
declare uname text; begin
 uname=lower(btrim(new.raw_user_meta_data->>'username'));
 if uname is null or uname !~ '^[a-z][a-z0-9_]{2,23}$' then raise exception 'Некорректный юзернейм'; end if;
 insert into public.profiles(id,username,display_name) values(new.id,uname,left(coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'),''),uname),60));
 return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.create_profile();
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.attachments enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table private.rate_limits enable row level security;
create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or private.is_peer(id));
create policy profiles_edit on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy conversations_read on public.conversations for select to authenticated using(private.is_member(id));
create policy members_read on public.conversation_members for select to authenticated using(private.is_member(conversation_id));
create policy messages_read on public.messages for select to authenticated using(private.is_member(conversation_id));
create policy attachments_read on public.attachments for select to authenticated using(private.is_member(conversation_id));
create policy blocks_read on public.blocks for select to authenticated using(blocker_id=auth.uid());
create policy reports_read on public.reports for select to authenticated using(reporter_id=auth.uid());
revoke all on public.profiles,public.conversations,public.conversation_members,public.messages,public.attachments,public.blocks,public.reports from anon,authenticated;
grant select on public.profiles,public.conversations,public.conversation_members,public.messages,public.attachments,public.blocks,public.reports to authenticated;
grant update(username,display_name,avatar_path) on public.profiles to authenticated;
-- One indexed last-message lookup per visible conversation; no global history cap.
create function public.list_conversations() returns table(id uuid,kind text,title text,avatar_path text,created_at timestamptz,last_message jsonb)
language sql stable security invoker set search_path='' as $$
 select c.id,c.kind,c.title,c.avatar_path,c.created_at,
 case when last_msg.id is null then null else to_jsonb(last_msg) end
 from public.conversations c
 left join lateral (select m.* from public.messages m where m.conversation_id=c.id order by m.created_at desc,m.id desc limit 1) last_msg on true
 order by coalesce(last_msg.created_at,c.created_at) desc,c.id;
$$;
revoke execute on function public.list_conversations() from public,anon;
grant execute on function public.list_conversations() to authenticated;
create function public.find_user(exact_username text) returns setof public.profiles language plpgsql security definer set search_path='' as $$begin
 perform private.rate_limit('search',20,60);
 return query select * from public.profiles where username=lower(ltrim(btrim(exact_username),'@')) and id<>auth.uid(); end $$;
create function public.create_direct(peer_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid; k text; begin
 perform private.rate_limit('create_chat',10,60);
 if peer_id=auth.uid() or not exists(select 1 from public.profiles where id=peer_id) or private.blocked(auth.uid(),peer_id) then raise exception 'Невозможно начать разговор'; end if;
 k=least(auth.uid()::text,peer_id::text)||':'||greatest(auth.uid()::text,peer_id::text);
 insert into public.conversations(kind,direct_key) values('direct',k) on conflict(direct_key) do update set direct_key=excluded.direct_key returning id into cid;
 insert into public.conversation_members(conversation_id,user_id) values(cid,auth.uid()),(cid,peer_id) on conflict do nothing;
 return cid; end $$;
create function public.create_group(group_title text, member_ids uuid[]) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid; pid uuid; begin
 perform private.rate_limit('create_chat',10,60);
 if length(btrim(group_title)) not between 1 and 80 or coalesce(cardinality(member_ids),0)>49 then raise exception 'Название: 1–80 символов, до 50 участников'; end if;
 insert into public.conversations(kind,title) values('group',btrim(group_title)) returning id into cid;
 insert into public.conversation_members(conversation_id,user_id,role) values(cid,auth.uid(),'owner');
 foreach pid in array coalesce(member_ids,array[]::uuid[]) loop
 if pid<>auth.uid() then
 if private.blocked(auth.uid(),pid) then raise exception 'Участник недоступен'; end if;
 insert into public.conversation_members(conversation_id,user_id) values(cid,pid) on conflict do nothing;
 end if; end loop; return cid; end $$;
create function public.invite_member(cid uuid,peer_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.rate_limit('invite',20,60);
 perform pg_advisory_xact_lock(hashtextextended(cid::text,0));
 if not private.is_owner(cid) or not exists(select 1 from public.conversations where id=cid and kind='group') then raise exception 'Только владелец группы может приглашать'; end if;
 if private.blocked(auth.uid(),peer_id) or (select count(*) from public.conversation_members where conversation_id=cid)>=50 then raise exception 'Невозможно пригласить участника'; end if;
 insert into public.conversation_members(conversation_id,user_id) values(cid,peer_id) on conflict do nothing;
end $$;
create function public.leave_group(cid uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform pg_advisory_xact_lock(hashtextextended(cid::text,0));
 if not private.is_member(cid) or not exists(select 1 from public.conversations where id=cid and kind='group') then raise exception 'Группа недоступна'; end if;
 if private.is_owner(cid) then
 if (select count(*) from public.conversation_members where conversation_id=cid)>1 then raise exception 'Владелец может выйти только из пустой группы'; end if;
 delete from public.conversations where id=cid;
 else delete from public.conversation_members where conversation_id=cid and user_id=auth.uid(); end if; end $$;
create function public.update_group(cid uuid,group_title text,group_avatar text default null) returns void language plpgsql security definer set search_path='' as $$begin
 if not private.is_owner(cid) then raise exception 'Требуется роль владельца'; end if;
 if group_avatar is not null and (split_part(group_avatar,'/',1)<>cid::text or group_avatar !~ '^[0-9a-f-]+/[0-9a-f-]+\.(jpg|png|webp)$') then raise exception 'Некорректный путь'; end if;
 update public.conversations set title=btrim(group_title),avatar_path=group_avatar where id=cid and kind='group'; end $$;
create function public.register_attachment(cid uuid,file_path text,file_name text,file_mime text,file_size bigint) returns uuid language plpgsql security definer set search_path='' as $$
declare aid uuid; begin
 perform private.rate_limit('attachment',20,60);
 if not private.can_send(cid) or split_part(file_path,'/',2)<>auth.uid()::text then raise exception 'Нет доступа'; end if;
 if not exists(select 1 from storage.objects where bucket_id='attachments' and name=file_path) then raise exception 'Файл не загружен'; end if;
 insert into public.attachments(conversation_id,uploader_id,path,name,mime_type,size) values(cid,auth.uid(),file_path,file_name,file_mime,file_size) returning id into aid; return aid; end $$;
create function public.send_message(cid uuid,content text,reply_id uuid default null,attachment_id uuid default null,client_id uuid default gen_random_uuid()) returns uuid language plpgsql security definer set search_path='' as $$
declare mid uuid; begin
 perform private.rate_limit('message',30,60);
 if not private.can_send(cid) then raise exception 'Нет доступа к отправке'; end if;
 if length(btrim(content))>4000 or (length(btrim(content))=0 and attachment_id is null) then raise exception 'Пустое или слишком длинное сообщение'; end if;
 if reply_id is not null and not exists(select 1 from public.messages where id=reply_id and conversation_id=cid and deleted_at is null) then raise exception 'Сообщение для ответа недоступно'; end if;
 if exists(select 1 from public.messages where id=client_id and sender_id=auth.uid() and conversation_id=cid) then return client_id; end if;
 if attachment_id is not null then
 perform 1 from public.attachments where id=attachment_id and conversation_id=cid and uploader_id=auth.uid() and message_id is null for update;
 if not found then raise exception 'Вложение недоступно'; end if; end if;
 insert into public.messages(id,conversation_id,sender_id,body,reply_to) values(client_id,cid,auth.uid(),btrim(content),reply_id) returning id into mid;
 if attachment_id is not null then update public.attachments set message_id=mid where id=attachment_id; end if;
 return mid; end $$;
create function public.edit_message(mid uuid,content text) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.rate_limit('edit',30,60);
 if length(btrim(content)) not between 1 and 4000 then raise exception 'Текст: 1–4000 символов'; end if;
 update public.messages set body=btrim(content),edited_at=now() where id=mid and sender_id=auth.uid() and deleted_at is null and private.can_send(conversation_id);
 if not found then raise exception 'Сообщение недоступно'; end if; end $$;
create function public.delete_message(mid uuid) returns void language plpgsql security definer set search_path='' as $$begin
 update public.messages set body='',deleted_at=now() where id=mid and sender_id=auth.uid() and private.is_member(conversation_id) and deleted_at is null;
 if not found then raise exception 'Сообщение недоступно'; end if;
 -- Keep a tombstone for replies and Realtime; metadata removal revokes new signed URLs.
 -- Remove physical objects through the Storage API, never SQL.
 delete from public.attachments where message_id=mid;
 end $$;
create function public.mark_read(cid uuid) returns void language plpgsql security definer set search_path='' as $$begin
 update public.conversation_members set last_read_at=now() where conversation_id=cid and user_id=auth.uid(); end $$;
create function public.set_block(peer_id uuid,blocked boolean) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.rate_limit('block',20,60);
 if blocked then insert into public.blocks(blocker_id,blocked_id) values(auth.uid(),peer_id) on conflict do nothing;
 else delete from public.blocks where blocker_id=auth.uid() and blocked_id=peer_id; end if; end $$;
create function public.report_message(mid uuid,report_reason text) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.rate_limit('report',5,3600);
 if not exists(select 1 from public.messages where id=mid and sender_id<>auth.uid() and private.is_member(conversation_id)) then raise exception 'Сообщение недоступно'; end if;
 insert into public.reports(reporter_id,message_id,reason) values(auth.uid(),mid,btrim(report_reason)); end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('attachments','attachments',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf','text/plain']),
 ('avatars','avatars',false,2097152,array['image/jpeg','image/png','image/webp']),
 ('group-avatars','group-avatars',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
-- Parse untrusted paths without throwing on invalid UUIDs.
create function private.path_uuid(p text,part integer) returns uuid language plpgsql immutable set search_path='' as $$begin return split_part(p,'/',part)::uuid; exception when invalid_text_representation then return null; end $$;
create policy attachment_upload on storage.objects for insert to authenticated with check(bucket_id='attachments' and private.can_send(private.path_uuid(name,1)) and split_part(name,'/',2)=auth.uid()::text and name ~ '^[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+\.(jpg|png|webp|pdf|txt)$');
create policy attachment_download on storage.objects for select to authenticated using(bucket_id='attachments' and private.is_member(private.path_uuid(name,1)) and exists(select 1 from public.attachments a join public.messages m on m.id=a.message_id where a.path=storage.objects.name and m.deleted_at is null));
create policy attachment_remove on storage.objects for delete to authenticated using(bucket_id='attachments' and split_part(name,'/',2)=auth.uid()::text and private.is_member(private.path_uuid(name,1)));
create policy avatar_upload on storage.objects for insert to authenticated with check(bucket_id='avatars' and split_part(name,'/',1)=auth.uid()::text and name ~ '^[0-9a-f-]+/[0-9a-f-]+\.(jpg|png|webp)$');
create policy avatar_read on storage.objects for select to authenticated using(bucket_id='avatars' and (private.path_uuid(name,1)=auth.uid() or private.is_peer(private.path_uuid(name,1))));
create policy avatar_remove on storage.objects for delete to authenticated using(bucket_id='avatars' and split_part(name,'/',1)=auth.uid()::text);
create policy group_avatar_upload on storage.objects for insert to authenticated with check(bucket_id='group-avatars' and private.is_owner(private.path_uuid(name,1)) and name ~ '^[0-9a-f-]+/[0-9a-f-]+\.(jpg|png|webp)$');
create policy group_avatar_read on storage.objects for select to authenticated using(bucket_id='group-avatars' and private.is_member(private.path_uuid(name,1)));
create policy group_avatar_remove on storage.objects for delete to authenticated using(bucket_id='group-avatars' and private.is_owner(private.path_uuid(name,1)));
-- Clients cannot publish forged typing/presence events to other conversations.
create policy chat_realtime_read on realtime.messages for select to authenticated using(private.is_member(private.path_uuid(replace(realtime.topic(),':','/'),2)));
create policy chat_realtime_write on realtime.messages for insert to authenticated with check(private.is_member(private.path_uuid(replace(realtime.topic(),':','/'),2)));
-- Restrict every RPC (Postgres defaults otherwise grant PUBLIC execute).
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_member(uuid),private.is_owner(uuid),private.is_peer(uuid),private.can_send(uuid),private.path_uuid(text,integer) to authenticated;
revoke execute on function public.find_user(text),public.create_direct(uuid),public.create_group(text,uuid[]),public.invite_member(uuid,uuid),public.leave_group(uuid),public.update_group(uuid,text,text),public.register_attachment(uuid,text,text,text,bigint),public.send_message(uuid,text,uuid,uuid,uuid),public.edit_message(uuid,text),public.delete_message(uuid),public.mark_read(uuid),public.set_block(uuid,boolean),public.report_message(uuid,text) from public,anon;
grant execute on function public.find_user(text),public.create_direct(uuid),public.create_group(text,uuid[]),public.invite_member(uuid,uuid),public.leave_group(uuid),public.update_group(uuid,text,text),public.register_attachment(uuid,text,text,text,bigint),public.send_message(uuid,text,uuid,uuid,uuid),public.edit_message(uuid,text),public.delete_message(uuid),public.mark_read(uuid),public.set_block(uuid,boolean),public.report_message(uuid,text) to authenticated;
alter publication supabase_realtime add table public.messages,public.conversations,public.conversation_members;
commit;
