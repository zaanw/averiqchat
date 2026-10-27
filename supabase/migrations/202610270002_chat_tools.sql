begin;
-- Personal organization is visible only to its owner, including in shared chats.
create table public.conversation_preferences (
  user_id uuid not null,
  conversation_id uuid not null,
  pinned boolean not null default false,
  folder text check(folder is null or (folder=btrim(folder) and length(folder) between 1 and 24)),
  primary key(user_id,conversation_id),
  foreign key(conversation_id,user_id) references public.conversation_members(conversation_id,user_id) on delete cascade
);
alter table public.conversation_preferences enable row level security;
create policy preferences_read on public.conversation_preferences for select to authenticated
  using(user_id=auth.uid() and private.is_member(conversation_id));
revoke all on public.conversation_preferences from anon,authenticated;
grant select on public.conversation_preferences to authenticated;

create function public.set_chat_preferences(cid uuid,pinned_value boolean default null,folder_value text default null,set_folder boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare normalized_folder text;
begin
  if not private.is_member(cid) then raise exception 'Нет доступа к чату'; end if;
  perform private.rate_limit('chat_preferences',60,60);
  normalized_folder=nullif(btrim(folder_value),'');
  if set_folder and length(normalized_folder)>24 then raise exception 'Название папки — до 24 символов'; end if;
  insert into public.conversation_preferences as p(user_id,conversation_id,pinned,folder)
    values(auth.uid(),cid,coalesce(pinned_value,false),case when set_folder then normalized_folder end)
    on conflict(user_id,conversation_id) do update set
      pinned=coalesce(pinned_value,p.pinned),
      folder=case when set_folder then normalized_folder else p.folder end;
end $$;

-- Literal case-insensitive substring search, with a stable cursor and membership check.
create function public.search_messages(cid uuid,query_text text,before_created timestamptz default null,before_id uuid default null)
returns setof public.messages language plpgsql security definer set search_path='' as $$
declare needle text;
begin
  if not private.is_member(cid) then raise exception 'Нет доступа к чату'; end if;
  needle=btrim(query_text);
  if needle is null or length(needle) not between 2 and 100 then raise exception 'Введите от 2 до 100 символов'; end if;
  if (before_created is null)<>(before_id is null) then raise exception 'Некорректный курсор поиска'; end if;
  perform private.rate_limit('message_search',60,60);
  return query select m.* from public.messages m where m.conversation_id=cid
    and m.deleted_at is null and strpos(lower(m.body),lower(needle))>0
    and (before_created is null or (m.created_at,m.id)<(before_created,before_id))
    order by m.created_at desc,m.id desc limit 50;
end $$;
revoke execute on function public.set_chat_preferences(uuid,boolean,text,boolean),public.search_messages(uuid,text,timestamptz,uuid) from public,anon;
grant execute on function public.set_chat_preferences(uuid,boolean,text,boolean),public.search_messages(uuid,text,timestamptz,uuid) to authenticated;
commit;
