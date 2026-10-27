import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
const url = process.env.TEST_SUPABASE_URL,
  key = process.env.TEST_SUPABASE_ANON_KEY,
  service = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
// Explicit opt-in: runs only against a dedicated test project, never a production project.
describe.skipIf(!url || !key || !service)(
  "real Supabase: auth, two users, RLS and Storage",
  () => {
    let admin: SupabaseClient;
    const users: {
      id: string;
      client: SupabaseClient;
      username: string;
      email: string;
    }[] = [];
    const conversations: string[] = [];
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const password = `Averiq-${crypto.randomUUID()}!`;
    beforeAll(async () => {
      admin = createClient(url!, service!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      for (let i = 0; i < 3; i++) {
        const username = `t${i}_${suffix}`,
          email = `averiq-${i}-${suffix}@example.com`;
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { username, display_name: username },
        });
        if (error) throw error;
        const client = createClient(url!, key!, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const login = await client.auth.signInWithPassword({ email, password });
        if (login.error) throw login.error;
        users.push({ id: data.user.id, client, username, email });
      }
    }, 60000);
    afterAll(async () => {
      for (const id of conversations)
        await admin.from("conversations").delete().eq("id", id);
      for (const u of users) {
        await u.client.auth.signOut();
        await admin.auth.admin.deleteUser(u.id);
      }
    });
    it("authenticates distinct accounts and rejects incorrect password", async () => {
      expect(new Set(users.map((u) => u.id)).size).toBe(3);
      const bad = await createClient(url!, key!, {
        auth: { persistSession: false },
      }).auth.signInWithPassword({
        email: users[0].email,
        password: "Incorrect-password-000",
      });
      expect(bad.error).not.toBeNull();
    });
    it("registers an unconfirmed account; confirms email before password login", async () => {
      const client = createClient(url!, key!, {
        auth: { persistSession: false },
      });
      const email = `averiq-signup-${suffix}@example.com`;
      const username = `signup_${suffix}`;
      const signup = await client.auth.signUp({
        email,
        password,
        options: { data: { username } },
      });
      expect(signup.error).toBeNull();
      expect(signup.data.session).toBeNull();
      const id = signup.data.user?.id;
      expect(id).toBeTruthy();
      if (!id) throw new Error("No signup user");
      users.push({ id, client, username, email });
      const before = await client.auth.signInWithPassword({ email, password });
      expect(before.error).not.toBeNull();
      const confirm = await admin.auth.admin.updateUserById(id, {
        email_confirm: true,
      });
      expect(confirm.error).toBeNull();
      const after = await client.auth.signInWithPassword({ email, password });
      expect(after.error).toBeNull();
    });
    it("enforces username uniqueness and hides emails and the user directory", async () => {
      const duplicate = await users[1].client
        .from("profiles")
        .update({ username: users[0].username })
        .eq("id", users[1].id);
      expect(duplicate.error?.code).toBe("23505");
      const list = await users[2].client.from("profiles").select("*");
      expect(list.error).toBeNull();
      expect(list.data).toHaveLength(1);
      expect(list.data?.[0]).not.toHaveProperty("email");
      const search = await users[0].client.rpc("find_user", {
        exact_username: users[1].username,
      });
      expect(search.data?.[0].id).toBe(users[1].id);
    });
    it("persists messages, denies a third account, enforces ownership and blocks", async () => {
      const [a, b, c] = users;
      const chat = await a.client.rpc("create_direct", { peer_id: b.id });
      expect(chat.error).toBeNull();
      const cid = chat.data as string;
      conversations.push(cid);
      const channel = b.client.channel(`chat:${cid}`, {
        config: { private: true },
      });
      const received = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Realtime delivery timed out")),
          15000,
        );
        channel.on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${cid}`,
          },
          () => {
            clearTimeout(timeout);
            resolve();
          },
        );
      });
      await new Promise<void>((resolve, reject) => {
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") resolve();
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
            reject(new Error(status));
        });
      });
      try {
        const sent = await a.client.rpc("send_message", {
          cid,
          content: "Hello across accounts",
        });
        expect(sent.error).toBeNull();
        await received;
        const mid = sent.data;
        const history = await b.client
          .from("messages")
          .select("*")
          .eq("id", mid)
          .single();
        expect(history.data?.body).toBe("Hello across accounts");
        expect(
          (
            await c.client
              .from("messages")
              .select("*")
              .eq("conversation_id", cid)
          ).data,
        ).toEqual([]);
        expect(
          (await c.client.rpc("send_message", { cid, content: "unauthorized" }))
            .error,
        ).not.toBeNull();
        expect(
          (await b.client.rpc("edit_message", { mid, content: "forged edit" }))
            .error,
        ).not.toBeNull();
        expect(
          (await a.client.rpc("edit_message", { mid, content: "edited" }))
            .error,
        ).toBeNull();
        expect((await b.client.rpc("mark_read", { cid })).error).toBeNull();
        await b.client.rpc("set_block", { peer_id: a.id, blocked: true });
        expect(
          (await a.client.rpc("send_message", { cid, content: "blocked" }))
            .error,
        ).not.toBeNull();
        await b.client.rpc("set_block", { peer_id: a.id, blocked: false });
        const repeatId = crypto.randomUUID();
        expect(
          (
            await a.client.rpc("send_message", {
              cid,
              content: "retry",
              client_id: repeatId,
            })
          ).data,
        ).toBe(repeatId);
        expect(
          (
            await a.client.rpc("send_message", {
              cid,
              content: "retry",
              client_id: repeatId,
            })
          ).data,
        ).toBe(repeatId);
        expect(
          (await b.client.from("messages").select("id").eq("id", repeatId))
            .data,
        ).toHaveLength(1);
        const path = `${cid}/${a.id}/${crypto.randomUUID()}.txt`;
        const upload = await a.client.storage
          .from("attachments")
          .upload(
            path,
            new Blob(["private attachment"], { type: "text/plain" }),
          );
        expect(upload.error).toBeNull();
        try {
          const meta = await a.client.rpc("register_attachment", {
            cid,
            file_path: path,
            file_name: "note.txt",
            file_mime: "text/plain",
            file_size: 18,
          });
          expect(meta.error).toBeNull();
          const msg = await a.client.rpc("send_message", {
            cid,
            content: "",
            attachment_id: meta.data,
          });
          expect(msg.error).toBeNull();
          expect(
            (
              await b.client.storage
                .from("attachments")
                .createSignedUrl(path, 60)
            ).error,
          ).toBeNull();
          expect(
            (
              await c.client.storage
                .from("attachments")
                .createSignedUrl(path, 60)
            ).error,
          ).not.toBeNull();
          await a.client.rpc("delete_message", { mid: msg.data });
          expect(
            (
              await b.client.storage
                .from("attachments")
                .createSignedUrl(path, 60)
            ).error,
          ).not.toBeNull();
        } finally {
          await a.client.storage.from("attachments").remove([path]);
        }
      } finally {
        await b.client.removeChannel(channel);
      }
    }, 60000);
    it("allows only the group owner to invite members", async () => {
      const [a, b, c] = users;
      const group = await a.client.rpc("create_group", {
        group_title: "Integration group",
        member_ids: [b.id],
      });
      expect(group.error).toBeNull();
      const cid = group.data;
      conversations.push(cid);
      expect(
        (await b.client.rpc("invite_member", { cid, peer_id: c.id })).error,
      ).not.toBeNull();
      expect(
        (await a.client.rpc("invite_member", { cid, peer_id: c.id })).error,
      ).toBeNull();
      expect(
        (await c.client.rpc("send_message", { cid, content: "group hello" }))
          .error,
      ).toBeNull();
      expect((await c.client.rpc("leave_group", { cid })).error).toBeNull();
      expect(
        (await c.client.from("messages").select("*").eq("conversation_id", cid))
          .data,
      ).toEqual([]);
    });
  },
);
