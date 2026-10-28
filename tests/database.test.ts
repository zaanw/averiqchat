import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
// Real PostgreSQL engine, minimal Supabase service schemas. Tests database policies,
// not Supabase Auth HTTP, SMTP, Storage bytes or Realtime transport.
describe("PostgreSQL migration and authorization", () => {
  let db: PGlite;
  let cid: string;
  let mid: string;
  const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  async function as(index: number) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      ids[index],
    ]);
    await db.exec("set role authenticated");
  }
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
 create role anon; create role authenticated;
 create schema auth;create schema storage;create schema realtime;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,storage,realtime to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant select,insert,delete on storage.objects to authenticated;
 create table realtime.messages(id uuid default gen_random_uuid(),topic text);
 alter table realtime.messages enable row level security;
 grant select,insert on realtime.messages to authenticated;
 create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
 create publication supabase_realtime;
 `);
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/202610270001_initial.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/202610270002_chat_tools.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/202610280001_saved_reactions.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    for (let i = 0; i < 3; i++)
      await db.query(
        "insert into auth.users(id,raw_user_meta_data) values($1,$2)",
        [
          ids[i],
          JSON.stringify({
            username: `tester_${i}`,
            display_name: `Tester ${i}`,
          }),
        ],
      );
    await as(0);
    const direct = await db.query<{ id: string }>(
      "select public.create_direct($1) as id",
      [ids[1]],
    );
    cid = direct.rows[0].id;
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  it("creates profiles without emails, exact lookup, unique username", async () => {
    await as(2);
    const list = await db.query("select * from public.profiles");
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0]).not.toHaveProperty("email");
    const search = await db.query("select * from public.find_user($1)", [
      "@tester_0",
    ]);
    expect(search.rows).toHaveLength(1);
    await expect(
      db.query("update public.profiles set username=$1 where id=$2", [
        "tester_0",
        ids[2],
      ]),
    ).rejects.toThrow(/unique/);
  });
  it("delivers persistent messages only to members and denies forged writes", async () => {
    await as(0);
    const sent = await db.query<{ id: string }>(
      "select public.send_message($1,$2) as id",
      [cid, "Hello from Alice"],
    );
    mid = sent.rows[0].id;
    await as(1);
    expect(
      (await db.query("select body from public.messages where id=$1", [mid]))
        .rows,
    ).toEqual([{ body: "Hello from Alice" }]);
    await expect(
      db.query("select public.edit_message($1,$2)", [mid, "forged"]),
    ).rejects.toThrow();
    await expect(
      db.query("delete from public.messages where id=$1", [mid]),
    ).rejects.toThrow(/permission denied/);
    await as(2);
    expect(
      (
        await db.query(
          "select * from public.messages where conversation_id=$1",
          [cid],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "select * from public.conversation_members where conversation_id=$1",
          [cid],
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.send_message($1,$2)", [cid, "unauthorized"]),
    ).rejects.toThrow();
    await expect(
      db.query(
        "insert into public.messages(conversation_id,sender_id,body) values($1,$2,$3)",
        [cid, ids[0], "forged"],
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("lists only visible conversations with their actual last message", async () => {
    await as(0);
    const own = await db.query<{ id: string; last_message: { body: string } }>(
      "select * from public.list_conversations()",
    );
    expect(own.rows).toHaveLength(1);
    expect(own.rows[0].id).toBe(cid);
    expect(own.rows[0].last_message.body).toBe("Hello from Alice");
    await as(2);
    expect(
      (await db.query("select * from public.list_conversations()")).rows,
    ).toHaveLength(0);
  });
  it("edits, replies, marks read, deduplicates retry, deletes with tombstone", async () => {
    await as(0);
    await db.query("select public.edit_message($1,$2)", [mid, "Edited text"]);
    expect(
      (
        await db.query<{ body: string }>(
          "select body from public.messages where id=$1",
          [mid],
        )
      ).rows[0].body,
    ).toBe("Edited text");
    const retry = crypto.randomUUID();
    for (let i = 0; i < 2; i++)
      await db.query("select public.send_message($1,$2,$3,null,$4)", [
        cid,
        "Reply",
        mid,
        retry,
      ]);
    expect(
      (await db.query("select id from public.messages where id=$1", [retry]))
        .rows,
    ).toHaveLength(1);
    await as(1);
    await db.query("select public.mark_read($1)", [cid]);
    expect(
      (
        await db.query<{ read: boolean }>(
          "select last_read_at>'epoch'::timestamptz as read from public.conversation_members where conversation_id=$1 and user_id=$2",
          [cid, ids[1]],
        )
      ).rows[0].read,
    ).toBe(true);
    await as(0);
    await db.query("select public.delete_message($1)", [mid]);
    expect(
      (
        await db.query<{ body: string; deleted_at: string | null }>(
          "select body,deleted_at from public.messages where id=$1",
          [mid],
        )
      ).rows[0],
    ).toMatchObject({ body: "" });
    expect(
      (
        await db.query("select deleted_at from public.messages where id=$1", [
          mid,
        ])
      ).rows[0],
    ).not.toEqual({ deleted_at: null });
  });
  it("blocks direct sends in both directions and persists reports privately", async () => {
    await as(1);
    await db.query("select public.set_block($1,true)", [ids[0]]);
    await expect(
      db.query("select public.send_message($1,$2)", [cid, "blocked"]),
    ).rejects.toThrow();
    await as(0);
    await expect(
      db.query("select public.send_message($1,$2)", [cid, "also blocked"]),
    ).rejects.toThrow();
    await as(1);
    await db.query("select public.report_message($1,$2)", [
      mid,
      "Test report for moderation",
    ]);
    expect((await db.query("select * from public.reports")).rows).toHaveLength(
      1,
    );
    await as(0);
    expect((await db.query("select * from public.reports")).rows).toHaveLength(
      0,
    );
    await as(1);
    await db.query("select public.set_block($1,false)", [ids[0]]);
  });
  it("enforces group roles, cross-conversation replies and membership after leaving", async () => {
    await as(0);
    const group = (
      await db.query<{ id: string }>(
        "select public.create_group($1,$2) as id",
        ["Team", [ids[1]]],
      )
    ).rows[0].id;
    await expect(
      db.query("select public.send_message($1,$2,$3)", [
        group,
        "bad reply",
        mid,
      ]),
    ).rejects.toThrow();
    await as(1);
    await expect(
      db.query("select public.invite_member($1,$2)", [group, ids[2]]),
    ).rejects.toThrow();
    await as(0);
    await db.query("select public.invite_member($1,$2)", [group, ids[2]]);
    await expect(
      db.query("select public.leave_group($1)", [group]),
    ).rejects.toThrow();
    await as(2);
    await db.query("select public.send_message($1,$2)", [
      group,
      "Group message",
    ]);
    await db.query("select public.leave_group($1)", [group]);
    expect(
      (
        await db.query(
          "select * from public.messages where conversation_id=$1",
          [group],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("protects storage paths, attachment binding, and revoked access after deletion", async () => {
    await as(0);
    const path = `${cid}/${ids[0]}/${crypto.randomUUID()}.txt`;
    await db.query(
      "insert into storage.objects(bucket_id,name) values($1,$2)",
      ["attachments", path],
    );
    const aid = (
      await db.query<{ id: string }>(
        "select public.register_attachment($1,$2,$3,$4,$5) as id",
        [cid, path, "note.txt", "text/plain", 15],
      )
    ).rows[0].id;
    const msg = (
      await db.query<{ id: string }>(
        "select public.send_message($1,$2,null,$3) as id",
        [cid, "", aid],
      )
    ).rows[0].id;
    await as(1);
    expect(
      (await db.query("select * from storage.objects where name=$1", [path]))
        .rows,
    ).toHaveLength(1);
    await expect(
      db.query("select public.send_message($1,$2,null,$3)", [
        cid,
        "stolen attachment",
        aid,
      ]),
    ).rejects.toThrow();
    await as(2);
    expect(
      (await db.query("select * from storage.objects where name=$1", [path]))
        .rows,
    ).toHaveLength(0);
    await expect(
      db.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
        "attachments",
        `${cid}/${ids[2]}/${crypto.randomUUID()}.txt`,
      ]),
    ).rejects.toThrow();
    await as(0);
    await db.query("select public.delete_message($1)", [msg]);
    await as(1);
    expect(
      (await db.query("select * from storage.objects where name=$1", [path]))
        .rows,
    ).toHaveLength(0);
  });
  it("requires membership for private typing channels and rejects malformed paths", async () => {
    await as(0);
    await db.query("select set_config('realtime.topic',$1,false)", [
      `chat:${cid}`,
    ]);
    await db.query("insert into realtime.messages(topic) values($1)", [
      `chat:${cid}`,
    ]);
    await as(2);
    await expect(
      db.query("insert into realtime.messages(topic) values($1)", [
        `chat:${cid}`,
      ]),
    ).rejects.toThrow();
    expect(
      (await db.query("select * from realtime.messages")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select private.path_uuid($1,1) as id", ["invalid/path"]))
        .rows,
    ).toEqual([{ id: null }]);
  });
  it("keeps pins and folders private and prevents forged preferences", async () => {
    await as(0);
    await db.query(
      "select public.set_chat_preferences($1,true,'Работа',true)",
      [cid],
    );
    expect(
      (
        await db.query(
          "select pinned,folder from public.conversation_preferences",
        )
      ).rows,
    ).toEqual([{ pinned: true, folder: "Работа" }]);
    await db.query("select public.set_chat_preferences($1,false)", [cid]);
    expect(
      (
        await db.query(
          "select pinned,folder from public.conversation_preferences",
        )
      ).rows,
    ).toEqual([{ pinned: false, folder: "Работа" }]);
    await as(1);
    expect(
      (await db.query("select * from public.conversation_preferences")).rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        "update public.conversation_preferences set folder='stolen' where user_id=$1",
        [ids[0]],
      ),
    ).rejects.toThrow(/permission denied/);
    await as(2);
    await expect(
      db.query("select public.set_chat_preferences($1,true)", [cid]),
    ).rejects.toThrow(/Нет доступа/);
    await as(0);
    await expect(
      db.query("select public.set_chat_preferences($1,null,$2,true)", [
        cid,
        "x".repeat(25),
      ]),
    ).rejects.toThrow(/24/);
    await db.query("select public.set_chat_preferences($1,null,'',true)", [
      cid,
    ]);
    expect(
      (await db.query("select folder from public.conversation_preferences"))
        .rows,
    ).toEqual([{ folder: null }]);
  });
  it("searches older history literally and hides it from outsiders", async () => {
    await as(0);
    const message = (
      await db.query<{ id: string }>(
        "select public.send_message($1,$2) as id",
        [cid, "Unique search 50%_match"],
      )
    ).rows[0].id;
    await as(1);
    expect(
      (
        await db.query("select id from public.search_messages($1,$2)", [
          cid,
          "50%_MATCH",
        ])
      ).rows,
    ).toEqual([{ id: message }]);
    expect(
      (
        await db.query("select id from public.search_messages($1,$2)", [
          cid,
          "missing needle",
        ])
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select * from public.search_messages($1,'a')", [cid]),
    ).rejects.toThrow(/2 до 100/);
    await as(2);
    await expect(
      db.query("select * from public.search_messages($1,'Unique')", [cid]),
    ).rejects.toThrow(/Нет доступа/);
    await as(0);
    await db.query("select public.delete_message($1)", [message]);
    expect(
      (
        await db.query("select id from public.search_messages($1,$2)", [
          cid,
          "50%_match",
        ])
      ).rows,
    ).toHaveLength(0);
  });
  it("paginates search without losing messages with equal timestamps", async () => {
    await as(0);
    const searchChat = (
      await db.query<{ id: string }>(
        "select public.create_group('Search cursor',$1::uuid[]) as id",
        [[]],
      )
    ).rows[0].id;
    await db.exec("reset role");
    for (let i = 0; i < 55; i++)
      await db.query(
        "insert into public.messages(conversation_id,sender_id,body,created_at) values($1,$2,'Cursor needle', '2026-10-27T01:00:00Z')",
        [searchChat, ids[0]],
      );
    await as(0);
    const first = (
      await db.query<{ id: string; created_at: string }>(
        "select id,created_at from public.search_messages($1,'needle')",
        [searchChat],
      )
    ).rows;
    expect(first).toHaveLength(50);
    const last = first.at(-1)!;
    const second = (
      await db.query<{ id: string }>(
        "select id from public.search_messages($1,'needle',$2,$3)",
        [searchChat, last.created_at, last.id],
      )
    ).rows;
    expect(second).toHaveLength(5);
    expect(
      new Set([...first, ...second].map((message) => message.id)).size,
    ).toBe(55);
    expect(
      (
        await db.query("select id from public.search_messages($1,'needle')", [
          cid,
        ])
      ).rows,
    ).toHaveLength(0);
  });
  it("removes personal preferences when membership ends", async () => {
    await as(0);
    const groupId = (
      await db.query<{ id: string }>(
        "select public.create_group('Temporary folder group',$1::uuid[]) as id",
        [[ids[1]]],
      )
    ).rows[0].id;
    await as(1);
    await db.query(
      "select public.set_chat_preferences($1,true,'Личное',true)",
      [groupId],
    );
    await db.query("select public.leave_group($1)", [groupId]);
    expect(
      (
        await db.query(
          "select * from public.conversation_preferences where conversation_id=$1",
          [groupId],
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.search_messages($1,'test')", [groupId]),
    ).rejects.toThrow(/Нет доступа/);
  });
  it("creates one private saved conversation per account", async () => {
    await as(0);
    const saved = (
      await db.query<{ id: string }>(
        "select public.open_saved_messages() as id",
      )
    ).rows[0].id;
    expect(
      (await db.query("select public.open_saved_messages() as id")).rows,
    ).toEqual([{ id: saved }]);
    const note = (
      await db.query<{ id: string }>(
        "select public.send_message($1,'Private note') as id",
        [saved],
      )
    ).rows[0].id;
    expect(
      (
        await db.query(
          "select * from public.conversation_members where conversation_id=$1",
          [saved],
        )
      ).rows,
    ).toHaveLength(1);
    await as(1);
    expect(
      (await db.query("select * from public.saved_conversations")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from public.messages where id=$1", [note]))
        .rows,
    ).toHaveLength(0);
    await expect(
      db.query("select * from public.search_messages($1,'Private')", [saved]),
    ).rejects.toThrow(/Нет доступа/);
    await expect(
      db.query("select public.invite_member($1,$2)", [saved, ids[1]]),
    ).rejects.toThrow();
    const ownSaved = (
      await db.query<{ id: string }>(
        "select public.open_saved_messages() as id",
      )
    ).rows[0].id;
    expect(ownSaved).not.toBe(saved);
  });
  it("limits reactions to members, with one choice per person", async () => {
    await as(0);
    const message = (
      await db.query<{ id: string }>(
        "select public.send_message($1,'React to this') as id",
        [cid],
      )
    ).rows[0].id;
    await db.query("select public.set_message_reaction($1,'👍')", [message]);
    await db.query("select public.set_message_reaction($1,'❤️')", [message]);
    expect(
      (
        await db.query(
          "select emoji from public.message_reactions where message_id=$1",
          [message],
        )
      ).rows,
    ).toEqual([{ emoji: "❤️" }]);
    await as(1);
    await db.query("select public.set_message_reaction($1,'❤️')", [message]);
    expect(
      (
        await db.query(
          "select emoji from public.message_reactions where message_id=$1",
          [message],
        )
      ).rows,
    ).toHaveLength(2);
    await db.query("select public.set_message_reaction($1,null)", [message]);
    expect(
      (
        await db.query(
          "select user_id from public.message_reactions where message_id=$1",
          [message],
        )
      ).rows,
    ).toEqual([{ user_id: ids[0] }]);
    await expect(
      db.query("select public.set_message_reaction($1,'not-an-emoji')", [
        message,
      ]),
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.query("insert into public.message_reactions values($1,$2,$3,'👍')", [
        message,
        cid,
        ids[0],
      ]),
    ).rejects.toThrow(/permission denied/);
    await as(2);
    expect(
      (await db.query("select * from public.message_reactions")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.set_message_reaction($1,'👍')", [message]),
    ).rejects.toThrow(/недоступно/);
    await as(0);
    await db.query("select public.delete_message($1)", [message]);
    expect(
      (
        await db.query(
          "select * from public.message_reactions where message_id=$1",
          [message],
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.set_message_reaction($1,'👍')", [message]),
    ).rejects.toThrow(/недоступно/);
  });
  it("throttles persisted sends server-side", async () => {
    await as(0);
    let denied = false;
    for (let i = 0; i < 35; i++) {
      try {
        await db.query("select public.send_message($1,$2)", [cid, `spam ${i}`]);
      } catch (e) {
        expect(String(e)).toContain("Слишком много запросов");
        denied = true;
        break;
      }
    }
    expect(denied).toBe(true);
  });
});
