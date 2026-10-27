import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
const url = process.env.TEST_SUPABASE_URL,
  key = process.env.TEST_SUPABASE_ANON_KEY,
  service = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
// Dedicated project preferred. Testing the connected project requires explicit
// TEST_SUPABASE_ALLOW_PROJECT, creates only temporary users, and cleans up their data.
describe.skipIf(!url || !key || !service)(
  "real Supabase: auth, two users, RLS and Storage",
  () => {
    let admin: SupabaseClient;
    const objects: string[] = [];
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
      if (
        new URL(url!).hostname === "vjahdisfhotedmexfrpk.supabase.co" &&
        process.env.TEST_SUPABASE_ALLOW_PROJECT !== "vjahdisfhotedmexfrpk"
      )
        throw new Error(
          "Explicit project acceptance authorization is required",
        );
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
        users.push({ id: data.user.id, client, username, email });
        const login = await client.auth.signInWithPassword({ email, password });
        if (login.error) throw login.error;
      }
    }, 60000);
    afterAll(async () => {
      if (!admin) return;
      const errors: string[] = [];
      if (objects.length) {
        const result = await admin.storage.from("attachments").remove(objects);
        if (result.error) errors.push("storage cleanup failed");
      }
      for (const id of conversations) {
        const result = await admin.from("conversations").delete().eq("id", id);
        if (result.error) errors.push("conversation cleanup failed");
      }
      for (const u of users) {
        await u.client.auth.signOut();
        const result = await admin.auth.admin.deleteUser(u.id);
        if (result.error) errors.push("temporary account cleanup failed");
      }
      if (errors.length) throw new Error(errors.join("; "));
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
    it("requires email confirmation before login", async () => {
      const client = createClient(url!, key!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const username = `confirm_${suffix}`,
        email = `averiq-confirm-${suffix}@example.com`;
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
        user_metadata: { username },
      });
      expect(created.error).toBeNull();
      const id = created.data.user?.id;
      if (!id) throw new Error("No temporary user");
      users.push({ id, client, username, email });
      expect(
        (await client.auth.signInWithPassword({ email, password })).error,
      ).not.toBeNull();
      expect(
        (await admin.auth.admin.updateUserById(id, { email_confirm: true }))
          .error,
      ).toBeNull();
      expect(
        (await client.auth.signInWithPassword({ email, password })).error,
      ).toBeNull();
    });
    it.skipIf(!process.env.TEST_SIGNUP_EMAIL)(
      "registers through the public Auth endpoint",
      async () => {
        const client = createClient(url!, key!, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const email = process.env.TEST_SIGNUP_EMAIL!,
          username = `signup_${suffix}`;
        // Never sign up or delete an address already belonging to a real account.
        for (let page = 1; ; page++) {
          const result = await admin.auth.admin.listUsers({
            page,
            perPage: 1000,
          });
          if (result.error)
            throw new Error(
              "Cannot establish that the signup test address is unused",
            );
          if (
            result.data.users.some(
              (user) => user.email?.toLowerCase() === email.toLowerCase(),
            )
          )
            throw new Error(
              "The controlled signup test address is already registered; use an unused address",
            );
          if (result.data.users.length < 1000) break;
        }
        const signup = await client.auth.signUp({
          email,
          password,
          options: { data: { username } },
        });
        expect(signup.error).toBeNull();
        expect(signup.data.session).toBeNull();
        const id = signup.data.user?.id;
        if (!id) throw new Error("No signup user");
        const verified = await admin.auth.admin.getUserById(id);
        if (
          verified.error ||
          verified.data.user.user_metadata.username !== username
        )
          throw new Error(
            "Cannot establish ownership of the temporary signup account",
          );
        users.push({ id, client, username, email });
        expect(
          (await client.auth.signInWithPassword({ email, password })).error,
        ).not.toBeNull();
        // This verifies signup policy only. Mailbox delivery/callback is a separate signoff.
      },
    );
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
      const received = new Promise<void>((resolve) => {
        channel.on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${cid}`,
          },
          () => resolve(),
        );
      });
      async function timeout<T>(
        promise: Promise<T>,
        ms: number,
        label: string,
      ): Promise<T> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            promise,
            new Promise<never>((_resolve, reject) => {
              timer = setTimeout(() => reject(new Error(label)), ms);
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      }
      try {
        await timeout(
          new Promise<void>((resolve, reject) => {
            channel.subscribe((status) => {
              if (status === "SUBSCRIBED") resolve();
              if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
                reject(new Error(status));
            });
          }),
          15000,
          "Realtime subscription timed out",
        );
        const sent = await a.client.rpc("send_message", {
          cid,
          content: "Hello across accounts",
        });
        expect(sent.error).toBeNull();
        await timeout(received, 15000, "Realtime message delivery timed out");
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
        objects.push(path);
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
