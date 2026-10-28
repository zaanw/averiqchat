begin;
create table public.saved_conversations (
  user_id uuid primary key,
  conversation_id uuid not null unique,
  foreign key(conversation_id,user_id) references public.conversation_members(conversation_id,user_id) on delete cascade
);
alter table public.saved_conversations enable row level security;
create policy saved_read on public.saved_conversations for select to authenticated
  using(user_id=auth.uid() and private.is_member(conversation_id));
revoke all on public.saved_conversations from anon,authenticated;
grant select on public.saved_conversations to authenticated;

create function public.open_saved_messages() returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
  perform private.rate_limit('saved_chat',20,60);
  select conversation_id into cid from public.saved_conversations where user_id=auth.uid();
  if cid is not null then return cid; end if;
  insert into public.conversations(kind,direct_key) values('direct','saved:'||auth.uid()::text)
    on conflict(direct_key) do update set direct_key=excluded.direct_key returning id into cid;
  insert into public.conversation_members(conversation_id,user_id) values(cid,auth.uid()) on conflict do nothing;
  insert into public.saved_conversations(user_id,conversation_id) values(auth.uid(),cid) on conflict(user_id) do nothing;
  return cid;
end $$;

create table public.message_reactions (
  message_id uuid not null,
  conversation_id uuid not null,
  user_id uuid not null,
  emoji text not null check(emoji in ('👍','❤️','😂','🎉','😮','😢')),
  primary key(message_id,user_id),
  foreign key(message_id,conversation_id) references public.messages(id,conversation_id) on delete cascade,
  foreign key(conversation_id,user_id) references public.conversation_members(conversation_id,user_id) on delete cascade
);
create index reactions_conversation_idx on public.message_reactions(conversation_id,message_id);
alter table public.message_reactions enable row level security;
create policy reactions_read on public.message_reactions for select to authenticated using(private.is_member(conversation_id));
revoke all on public.message_reactions from anon,authenticated;
grant select on public.message_reactions to authenticated;

create function public.set_message_reaction(mid uuid,reaction text default null) returns void language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
  select conversation_id into cid from public.messages where id=mid and deleted_at is null for update;
  if cid is null or not private.is_member(cid) then raise exception 'Сообщение недоступно'; end if;
  perform private.rate_limit('message_reaction',60,60);
  if reaction is null then
    delete from public.message_reactions where message_id=mid and user_id=auth.uid();
  else
    insert into public.message_reactions(message_id,conversation_id,user_id,emoji) values(mid,cid,auth.uid(),reaction)
      on conflict(message_id,user_id) do update set emoji=excluded.emoji;
  end if;
end $$;
create function private.clear_message_reactions() returns trigger language plpgsql security definer set search_path='' as $$
begin
  delete from public.message_reactions where message_id=new.id;
  return new;
end $$;
revoke all on function private.clear_message_reactions() from public,anon,authenticated;
create trigger clear_deleted_reactions after update of deleted_at on public.messages
  for each row when(new.deleted_at is not null) execute function private.clear_message_reactions();
revoke execute on function public.open_saved_messages(),public.set_message_reaction(uuid,text) from public,anon;
grant execute on function public.open_saved_messages(),public.set_message_reaction(uuid,text) to authenticated;
commit;
