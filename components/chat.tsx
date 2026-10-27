"use client";
/* eslint-disable @next/next/no-img-element -- Private signed Storage URLs must not pass through a shared optimizer. */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  Check,
  CheckCheck,
  FileText,
  Hash,
  ImagePlus,
  LoaderCircle,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Reply,
  Search,
  Settings,
  ShieldBan,
  Smile,
  Sun,
  Moon,
  Trash2,
  Users,
  X,
  Flag,
  Download,
} from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "../lib/supabase";
import type {
  Attachment,
  Conversation,
  Member,
  Message,
  Profile,
} from "../lib/types";
import { messageSchema, usernameSchema, validateFile } from "../lib/validation";
import Brand from "./brand";
import { errorText } from "../lib/errors";

function Avatar({
  name,
  path,
  bucket = "avatars",
}: {
  name: string;
  path?: string | null;
  bucket?: string;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      const client = getSupabase();
      if (!client || !path) {
        if (active) setUrl("");
        return;
      }
      const { data } = await client.storage
        .from(bucket)
        .createSignedUrl(path, 300);
      if (active) setUrl(data?.signedUrl || "");
    }
    void load();
    const timer = setInterval(() => void load(), 240000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [path, bucket]);
  return (
    <span className="avatar">
      {url ? <img src={url} alt="" /> : name.slice(0, 2).toUpperCase()}
    </span>
  );
}
function FileView({ attachment }: { attachment: Attachment }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  async function load() {
    const { data, error } = await getSupabase()!
      .storage.from("attachments")
      .createSignedUrl(attachment.path, 60);
    if (error) {
      setError(error.message);
      return;
    }
    setUrl(data.signedUrl);
    setOpen(true);
  }
  return (
    <div className="attachment">
      <button onClick={() => void load()}>
        <FileText size={18} />
        <span>
          {attachment.name}
          <small>
            {(attachment.size / 1024).toFixed(0)} КБ · открыть на 60 секунд
          </small>
        </span>
        <Download size={16} />
      </button>
      {error && <p role="alert">{error}</p>}
      {open &&
        url &&
        (attachment.mime_type.startsWith("image/") ? (
          <a href={url} target="_blank" rel="noopener noreferrer">
            <img src={url} alt={attachment.name} className="attachment-image" />
          </a>
        ) : (
          <a
            className="text-button"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Открыть файл
          </a>
        ))}
    </div>
  );
}

export default function Chat({ userId }: { userId: string }) {
  const client = getSupabase()!;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [latest, setLatest] = useState<Message[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<"new" | "settings" | "group" | null>(null);
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<Profile | null>(null);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupPeople, setGroupPeople] = useState<Profile[]>([]);
  const [connected, setConnected] = useState(false);
  const [typing, setTyping] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [light, setLight] = useState(false);
  const [menu, setMenu] = useState(false);
  const [attachmentPending, setAttachmentPending] = useState(false);
  const [retryPending, setRetryPending] = useState(false);
  const closeModal = useCallback(() => setModal(null), []);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastTyping = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const activeRef = useRef<string | null>(selected);
  const olderRef = useRef(false);
  const pendingId = useRef<string | null>(null);
  const pendingMessage = useRef<{
    cid: string;
    content: string;
    reply_id: string | null;
    attachment_id: string | null;
    client_id: string;
  } | null>(null);
  const pendingAttachment = useRef<string | null>(null);
  const current = conversations.find((c) => c.id === selected);
  const currentMembers = members.filter((m) => m.conversation_id === selected);
  const peerId = currentMembers.find((m) => m.user_id !== userId)?.user_id;
  const peer = profiles.find((p) => p.id === peerId);
  const owner =
    currentMembers.find((m) => m.user_id === userId)?.role === "owner";
  const nameOf = useCallback(
    (c: Conversation) =>
      c.kind === "group"
        ? c.title || "Группа"
        : profiles.find((p) =>
            members.some(
              (m) =>
                m.conversation_id === c.id &&
                m.user_id === p.id &&
                p.id !== userId,
            ),
          )?.display_name || "Личный чат",
    [profiles, members, userId],
  );
  const refresh = useCallback(async () => {
    const [p, c, m, ps, b] = await Promise.all([
      client.from("profiles").select("*").eq("id", userId).single(),
      client.rpc("list_conversations"),
      client.from("conversation_members").select("*"),
      client.from("profiles").select("*"),
      client.from("blocks").select("blocked_id"),
    ]);
    for (const result of [p, c, m, ps, b]) if (result.error) throw result.error;
    setProfile(p.data);
    setConversations(c.data || []);
    setMembers(m.data || []);
    setProfiles(ps.data || []);
    setBlocked((b.data || []).map((x) => x.blocked_id));
    setLatest(
      (c.data || [])
        .map(
          (item: Conversation & { last_message: Message | null }) =>
            item.last_message,
        )
        .filter((message: Message | null): message is Message => !!message),
    );
    if (
      activeRef.current &&
      !(c.data || []).some(
        (item: Conversation) => item.id === activeRef.current,
      )
    ) {
      activeRef.current = null;
      setSelected(null);
      setMessages([]);
      setAttachments([]);
    }
  }, [client, userId]);
  const loadMessages = useCallback(
    async (cid: string, older = false) => {
      let query = client
        .from("messages")
        .select("*")
        .eq("conversation_id", cid)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(50);
      // A timestamp + UUID cursor avoids losing messages with equal timestamps.
      if (older && olderRef.current) return;
      if (older) {
        olderRef.current = true;
        setHistoryLoading(true);
        const first = messages[0];
        if (first)
          query = query.or(
            `created_at.lt.${first.created_at},and(created_at.eq.${first.created_at},id.lt.${first.id})`,
          );
      }
      try {
        const result = await query;
        if (result.error) throw result.error;
        if (activeRef.current !== cid) return;
        const rows = (result.data || []) as Message[];
        // Catch up every missed page after a long disconnect, not just the latest 50.
        if (!older && messages.length) {
          let cursor = messages[messages.length - 1];
          while (activeRef.current === cid) {
            const catchup = await client
              .from("messages")
              .select("*")
              .eq("conversation_id", cid)
              .or(
                `created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`,
              )
              .order("created_at", { ascending: true })
              .order("id", { ascending: true })
              .limit(200);
            if (catchup.error) throw catchup.error;
            const page = (catchup.data || []) as Message[];
            rows.push(...page);
            if (page.length < 200) break;
            cursor = page[page.length - 1];
          }
        }
        // Refresh loaded older rows too: reconnects must not leave stale edits/deletions.
        if (!older && messages.length > 50) {
          const oldIds = messages.slice(0, -50).map((message) => message.id);
          for (let offset = 0; offset < oldIds.length; offset += 100) {
            const updated = await client
              .from("messages")
              .select("*")
              .eq("conversation_id", cid)
              .in("id", oldIds.slice(offset, offset + 100));
            if (updated.error) throw updated.error;
            rows.push(...(updated.data || []));
          }
        }
        const pageIds = rows.map((message) => message.id);
        const loadedFiles: Attachment[] = [];
        for (let offset = 0; offset < pageIds.length; offset += 100) {
          const result = await client
            .from("attachments")
            .select("*")
            .eq("conversation_id", cid)
            .in("message_id", pageIds.slice(offset, offset + 100));
          if (result.error) throw result.error;
          loadedFiles.push(...(result.data || []));
        }
        if (activeRef.current !== cid) return;
        if (older || messages.length === 0)
          setHasOlder((result.data || []).length === 50);
        setMessages((previous) => {
          const map = new Map(previous.map((m) => [m.id, m]));
          for (const row of rows) map.set(row.id, row);
          return [...map.values()].sort(
            (a, b) =>
              a.created_at.localeCompare(b.created_at) ||
              a.id.localeCompare(b.id),
          );
        });
        setAttachments((previous) => [
          ...previous.filter(
            (attachment) => !pageIds.includes(attachment.message_id || ""),
          ),
          ...loadedFiles,
        ]);
        if (
          !older &&
          document.visibilityState === "visible" &&
          document.hasFocus() &&
          (!bottomRef.current?.parentElement ||
            bottomRef.current.parentElement.scrollHeight -
              bottomRef.current.parentElement.scrollTop -
              bottomRef.current.parentElement.clientHeight <
              120)
        ) {
          const { error } = await client.rpc("mark_read", { cid });
          if (error) throw error;
        }
      } finally {
        if (older) {
          olderRef.current = false;
          setHistoryLoading(false);
        }
      }
      // messages are used only for the manual pagination cursor; subscription uses a ref below.
    },
    [client, messages],
  );
  const loaderRef = useRef(loadMessages);
  useEffect(() => {
    loaderRef.current = loadMessages;
  }, [loadMessages]);
  useEffect(() => {
    let active = true;
    async function init() {
      try {
        await refresh();
      } catch (e) {
        if (active) setError(errorText(e));
      } finally {
        if (active) setLoading(false);
      }
    }
    void init();
    const timer = setInterval(
      () => void refresh().catch((e) => setError(errorText(e))),
      15000,
    );
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    const stored = localStorage.getItem("averiq-theme");
    Promise.resolve().then(() => setLight(stored === "light"));
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = light ? "light" : "dark";
    localStorage.setItem("averiq-theme", light ? "light" : "dark");
  }, [light]);
  useEffect(() => {
    if (!selected) return;
    const cid = selected;
    let alive = true;
    async function reload() {
      try {
        await loaderRef.current(cid);
        await refresh();
      } catch (e) {
        if (alive) setError(errorText(e));
      }
    }
    void reload();
    const channel = client
      .channel(`chat:${cid}`, {
        config: { private: true, presence: { key: userId } },
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${cid}`,
        },
        (payload) => {
          if (activeRef.current !== cid) return;
          if (payload.eventType === "UPDATE")
            setMessages((previous) =>
              previous.map((message) =>
                message.id === payload.new.id
                  ? (payload.new as Message)
                  : message,
              ),
            );
          void reload();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_members",
          filter: `conversation_id=eq.${cid}`,
        },
        () => void refresh().catch((e) => setError(errorText(e))),
      )
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ typing: boolean; at: number }>();
        setTyping(
          Object.entries(state).some(
            ([id, items]) =>
              id !== userId &&
              items.some((x) => x.typing && Date.now() - x.at < 5000),
          ),
        );
      })
      .subscribe((status) => {
        if (!alive) return;
        setConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") {
          void channel.track({ typing: false, at: Date.now() });
          void reload();
        }
      });
    channelRef.current = channel;
    const timer = setInterval(() => {
      void reload();
      const state = channel.presenceState<{ typing: boolean; at: number }>();
      setTyping(
        Object.entries(state).some(
          ([id, items]) =>
            id !== userId &&
            items.some((x) => x.typing && Date.now() - x.at < 5000),
        ),
      );
    }, 5000);
    const focus = () => void reload();
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
      channelRef.current = null;
      void client.removeChannel(channel);
    };
  }, [client, selected, userId, refresh]);
  const newestMessageId = messages.at(-1)?.id;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [newestMessageId]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  }
  function select(id: string | null) {
    activeRef.current = id;
    setSelected(id);
    setTyping(false);
    setRetryPending(false);
    pendingMessage.current = null;
    setMessages([]);
    setAttachments([]);
    setDraft("");
    setReply(null);
    setEditing(null);
    setFile(null);
    pendingId.current = null;
    pendingAttachment.current = null;
    setAttachmentPending(false);
    setMenu(false);
    setConnected(false);
    setHasOlder(false);
  }
  async function searchUser() {
    const parsed = usernameSchema.parse(search.replace(/^@/, ""));
    const data = await rpc("find_user", { exact_username: parsed });
    setFound(data?.[0] || null);
    if (!data?.length)
      setNotice("Пользователь не найден. Нужен точный @username.");
  }
  async function startChat(person: Profile) {
    const cid = await rpc("create_direct", { peer_id: person.id });
    await refresh();
    setModal(null);
    select(cid);
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || busy) return;
    const cid = selected;
    await run(async () => {
      if (editing) {
        const body = messageSchema.parse(draft);
        await rpc("edit_message", { mid: editing.id, content: body });
      } else {
        if (!file) messageSchema.parse(draft);
        if (draft.trim().length > 4000)
          throw new Error("Не более 4000 символов");
        if (file && !pendingAttachment.current) {
          validateFile(file);
          const ext: Record<string, string> = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "application/pdf": "pdf",
            "text/plain": "txt",
          };
          const path = `${cid}/${userId}/${crypto.randomUUID()}.${ext[file.type]}`;
          const { error } = await client.storage
            .from("attachments")
            .upload(path, file, { contentType: file.type, upsert: false });
          if (error) throw error;
          try {
            pendingAttachment.current = await rpc("register_attachment", {
              cid,
              file_path: path,
              file_name: file.name.slice(0, 180),
              file_mime: file.type,
              file_size: file.size,
            });
            setAttachmentPending(true);
          } catch (e) {
            await client.storage.from("attachments").remove([path]);
            throw e;
          }
        }
        pendingId.current ??= crypto.randomUUID();
        pendingMessage.current ??= {
          cid,
          content: draft,
          reply_id: reply?.id || null,
          attachment_id: pendingAttachment.current,
          client_id: pendingId.current,
        };
        setRetryPending(true);
        await rpc("send_message", pendingMessage.current);
      }
      pendingId.current = null;
      pendingMessage.current = null;
      setRetryPending(false);
      pendingAttachment.current = null;
      setAttachmentPending(false);
      setDraft("");
      setFile(null);
      setReply(null);
      setEditing(null);
      await channelRef.current?.track({ typing: false, at: Date.now() });
      await loaderRef.current(cid);
      await refresh();
      composerRef.current?.focus();
    });
  }
  async function uploadAvatar(file: File, group = false) {
    validateFile(file, true);
    const exts: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };
    const path = `${group ? selected : userId}/${crypto.randomUUID()}.${exts[file.type]}`;
    const bucket = group ? "group-avatars" : "avatars";
    const { error } = await client.storage
      .from(bucket)
      .upload(path, file, { contentType: file.type });
    if (error) throw error;
    try {
      if (group) {
        await rpc("update_group", {
          cid: selected,
          group_title: current?.title,
          group_avatar: path,
        });
      } else {
        const { error } = await client
          .from("profiles")
          .update({ avatar_path: path })
          .eq("id", userId);
        if (error) throw error;
      }
    } catch (e) {
      await client.storage.from(bucket).remove([path]);
      throw e;
    }
    await refresh();
  }
  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    await run(async () => {
      const username = usernameSchema.parse(data.get("username"));
      const display_name = String(data.get("display_name")).trim();
      if (!display_name || display_name.length > 60)
        throw new Error("Имя: от 1 до 60 символов");
      const { error } = await client
        .from("profiles")
        .update({ username, display_name })
        .eq("id", userId);
      if (error) throw error;
      await refresh();
      setNotice("Профиль сохранён");
    });
  }
  async function removeMessage(m: Message) {
    if (!window.confirm("Удалить сообщение для всех участников?")) return;
    await run(async () => {
      const paths = attachments
        .filter((a) => a.message_id === m.id)
        .map((a) => a.path);
      await rpc("delete_message", { mid: m.id });
      if (paths.length) {
        const { error } = await client.storage
          .from("attachments")
          .remove(paths);
        if (error) setNotice("Сообщение удалено, очистка файла не завершена.");
      }
      if (selected) await loaderRef.current(selected);
    });
  }
  return (
    <main className={`chat-app ${selected ? "has-selection" : ""}`}>
      <aside className="sidebar">
        <header className="sidebar-top">
          <Brand />
          <button
            className="icon-button"
            aria-label="Новый чат"
            onClick={() => {
              setModal("new");
              setFound(null);
              setSearch("");
              setGroupPeople([]);
              setGroupTitle("");
            }}
          >
            <Plus size={21} />
          </button>
        </header>
        <div className="sidebar-heading">
          <h1>Сообщения</h1>
          <span>{conversations.length}</span>
        </div>
        <div className="sidebar-search input-icon">
          <Search size={17} />
          <input
            aria-label="Фильтр чатов"
            placeholder="Найти разговор…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="list-label">ВАШИ РАЗГОВОРЫ</div>
        <nav aria-label="Чаты" className="conversation-list">
          {loading ? (
            <p className="muted loading-line">
              <LoaderCircle className="spin" size={18} /> Загружаем чаты…
            </p>
          ) : (
            conversations
              .filter((c) =>
                nameOf(c).toLowerCase().includes(filter.toLowerCase()),
              )
              .map((c) => {
                const last = latest.find((m) => m.conversation_id === c.id);
                const own = members.find(
                  (m) => m.conversation_id === c.id && m.user_id === userId,
                );
                const other = profiles.find((p) =>
                  members.some(
                    (m) =>
                      m.conversation_id === c.id &&
                      m.user_id === p.id &&
                      p.id !== userId,
                  ),
                );
                const unread =
                  last &&
                  last.sender_id !== userId &&
                  own &&
                  Date.parse(last.created_at) > Date.parse(own.last_read_at);
                return (
                  <button
                    key={c.id}
                    onClick={() => select(c.id)}
                    className={`conversation-item ${c.id === selected ? "active" : ""}`}
                  >
                    <Avatar
                      name={nameOf(c)}
                      path={
                        c.kind === "group" ? c.avatar_path : other?.avatar_path
                      }
                      bucket={c.kind === "group" ? "group-avatars" : "avatars"}
                    />
                    <span className="conversation-info">
                      <strong>{nameOf(c)}</strong>
                      <span>
                        {last
                          ? last.deleted_at
                            ? "Сообщение удалено"
                            : last.body || "Вложение"
                          : c.kind === "group"
                            ? "Новая группа"
                            : "Начните разговор"}
                      </span>
                    </span>
                    <span className="conversation-meta">
                      {last && (
                        <time>
                          {new Date(last.created_at).toLocaleTimeString("ru", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      )}
                      {unread && (
                        <i aria-label="Есть непрочитанные сообщения" />
                      )}
                    </span>
                  </button>
                );
              })
          )}
          {!loading && !conversations.length && (
            <div className="empty-list">
              <MessageCircle size={28} />
              <p>Здесь появятся ваши разговоры</p>
              <button className="text-button" onClick={() => setModal("new")}>
                Найти человека
              </button>
            </div>
          )}
        </nav>
        <footer className="sidebar-profile">
          <button
            className="profile-button"
            onClick={() => setModal("settings")}
          >
            <Avatar
              name={profile?.display_name || "A"}
              path={profile?.avatar_path}
            />
            <span>
              <strong>{profile?.display_name || "Профиль"}</strong>
              <small>@{profile?.username}</small>
            </span>
          </button>
          <button
            className="icon-button"
            aria-label="Настройки"
            onClick={() => setModal("settings")}
          >
            <Settings size={19} />
          </button>
        </footer>
      </aside>
      <section className="chat-main">
        {error && (
          <div className="global-alert" role="alert">
            <span>{error}</span>
            <button aria-label="Закрыть ошибку" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="global-notice" role="status">
            <span>{notice}</span>
            <button
              aria-label="Закрыть уведомление"
              onClick={() => setNotice("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {!current ? (
          <div className="chat-welcome">
            <div className="welcome-symbol">
              <MessageCircle size={42} />
            </div>
            <span className="eyebrow">ПРОСТРАНСТВО ДЛЯ СВОИХ</span>
            <h2>Начните с «привет»</h2>
            <p>
              Найдите человека по юзернейму
              <br />и начните ваш первый разговор.
            </p>
            <button className="primary" onClick={() => setModal("new")}>
              <Plus size={18} /> Новый разговор
            </button>
            <small>
              <Hash size={13} /> Без публичного каталога пользователей
            </small>
          </div>
        ) : (
          <>
            <header className="chat-header">
              <button
                className="icon-button back-button"
                aria-label="Назад к чатам"
                onClick={() => select(null)}
              >
                <ArrowLeft size={20} />
              </button>
              <Avatar
                name={nameOf(current)}
                path={
                  current.kind === "group"
                    ? current.avatar_path
                    : peer?.avatar_path
                }
                bucket={current.kind === "group" ? "group-avatars" : "avatars"}
              />
              <div className="chat-heading">
                <h2>{nameOf(current)}</h2>
                <span className={typing ? "accent-text" : ""}>
                  {typing
                    ? "печатает…"
                    : current.kind === "group"
                      ? `${currentMembers.length} участников`
                      : `@${peer?.username || "…"}`}
                </span>
              </div>
              <span
                className={`connection ${connected ? "online" : ""}`}
                title={
                  connected
                    ? "Realtime подключён"
                    : "Повторное подключение; история обновляется каждые 5 секунд"
                }
              >
                {connected ? "На связи" : "Подключение…"}
              </span>
              <div className="menu-wrap">
                <button
                  className="icon-button"
                  aria-label="Действия с чатом"
                  aria-expanded={menu}
                  onClick={() => setMenu(!menu)}
                >
                  <MoreHorizontal />
                </button>
                {menu && (
                  <div className="dropdown">
                    {current.kind === "group" ? (
                      <>
                        <button
                          onClick={() => {
                            setModal("group");
                            setGroupTitle(current.title || "");
                            setFound(null);
                            setSearch("");
                            setMenu(false);
                          }}
                        >
                          <Users size={16} /> О группе
                        </button>
                        <button
                          onClick={() =>
                            void run(async () => {
                              await rpc("leave_group", { cid: selected });
                              select(null);
                              await refresh();
                            })
                          }
                        >
                          <LogOut size={16} /> Покинуть группу
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() =>
                          void run(async () => {
                            if (!peerId) return;
                            await rpc("set_block", {
                              peer_id: peerId,
                              blocked: !blocked.includes(peerId),
                            });
                            await refresh();
                            setMenu(false);
                          })
                        }
                      >
                        <ShieldBan size={16} />
                        {peerId && blocked.includes(peerId)
                          ? "Разблокировать"
                          : "Заблокировать"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </header>
            <div
              className="message-scroll"
              role="log"
              aria-label="История сообщений"
              aria-live="polite"
            >
              {hasOlder && (
                <button
                  className="load-older"
                  disabled={historyLoading}
                  onClick={() => void run(() => loadMessages(current.id, true))}
                >
                  {historyLoading ? "Загрузка…" : "Ранее"}
                </button>
              )}
              {!messages.length && (
                <div className="conversation-empty">
                  <span className="day-label">Начало разговора</span>
                  <p>Пока тихо. Напишите первое сообщение.</p>
                </div>
              )}
              {messages.map((m, i) => {
                const mine = m.sender_id === userId;
                const sender = profiles.find((p) => p.id === m.sender_id);
                const quoted = messages.find((x) => x.id === m.reply_to);
                const files = attachments.filter((a) => a.message_id === m.id);
                const read =
                  currentMembers
                    .filter((p) => p.user_id !== userId)
                    .every(
                      (p) =>
                        Date.parse(p.last_read_at) >= Date.parse(m.created_at),
                    ) && currentMembers.length > 1;
                return (
                  <div key={m.id}>
                    {(i === 0 ||
                      m.created_at.slice(0, 10) !==
                        messages[i - 1].created_at.slice(0, 10)) && (
                      <div className="day-divider">
                        <span>
                          {new Date(m.created_at).toLocaleDateString("ru", {
                            day: "numeric",
                            month: "long",
                          })}
                        </span>
                      </div>
                    )}
                    <article className={`message-row ${mine ? "mine" : ""}`}>
                      <div className="bubble">
                        {current.kind === "group" && !mine && (
                          <strong className="sender-name">
                            {sender?.display_name || "Участник"}
                          </strong>
                        )}
                        {m.reply_to && (
                          <button
                            className="quoted"
                            onClick={() => {
                              const el = document.getElementById(
                                `message-${m.reply_to}`,
                              );
                              if (el)
                                el.scrollIntoView({
                                  behavior: "smooth",
                                  block: "center",
                                });
                              else
                                setNotice(
                                  "Загрузите более раннюю историю, чтобы увидеть исходное сообщение.",
                                );
                            }}
                          >
                            ↳{" "}
                            {quoted
                              ? quoted.deleted_at
                                ? "Сообщение удалено"
                                : quoted.body || "Вложение"
                              : "Более раннее сообщение"}
                          </button>
                        )}
                        <p
                          id={`message-${m.id}`}
                          className={m.deleted_at ? "deleted" : ""}
                        >
                          {m.deleted_at ? "Сообщение удалено" : m.body}
                        </p>
                        {!m.deleted_at &&
                          files.map((a) => (
                            <FileView key={a.id} attachment={a} />
                          ))}
                        <div className="message-meta">
                          {m.edited_at && <span>изменено</span>}
                          <time dateTime={m.created_at}>
                            {new Date(m.created_at).toLocaleTimeString("ru", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                          {mine &&
                            !m.deleted_at &&
                            (read ? (
                              <CheckCheck
                                size={14}
                                aria-label="Прочитано всеми"
                              />
                            ) : (
                              <Check
                                size={14}
                                aria-label="Сохранено на сервере"
                              />
                            ))}
                        </div>
                      </div>
                      {!m.deleted_at && (
                        <div className="message-actions">
                          <button
                            aria-label="Ответить"
                            disabled={busy || retryPending}
                            title="Ответить"
                            onClick={() => {
                              setReply(m);
                              setEditing(null);
                              composerRef.current?.focus();
                            }}
                          >
                            <Reply size={14} />
                          </button>
                          {mine ? (
                            <>
                              <button
                                aria-label="Редактировать"
                                disabled={busy || retryPending}
                                title="Редактировать"
                                onClick={() => {
                                  setEditing(m);
                                  setDraft(m.body);
                                  setReply(null);
                                  composerRef.current?.focus();
                                }}
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                aria-label="Удалить"
                                disabled={busy || retryPending}
                                title="Удалить"
                                onClick={() => void removeMessage(m)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          ) : (
                            <button
                              aria-label="Пожаловаться"
                              title="Пожаловаться"
                              onClick={() => {
                                const reason = window.prompt(
                                  "Причина жалобы (5–1000 символов)",
                                );
                                if (reason)
                                  void run(async () => {
                                    await rpc("report_message", {
                                      mid: m.id,
                                      report_reason: reason,
                                    });
                                    setNotice(
                                      "Жалоба сохранена для администратора проекта",
                                    );
                                  });
                              }}
                            >
                              <Flag size={14} />
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            <div className="composer-area">
              {retryPending && !busy && (
                <p className="retry-note" role="status">
                  Отправка не подтверждена. Нажмите отправить ещё раз — дубликат
                  не создастся.
                </p>
              )}
              {(reply || editing) && (
                <div className="reply-bar">
                  <Reply size={17} />
                  <span>
                    <strong>{editing ? "Редактирование" : "Ответ"}</strong>
                    <small>{(editing || reply)?.body || "Вложение"}</small>
                  </span>
                  <button
                    className="icon-button"
                    aria-label="Отменить"
                    onClick={() => {
                      setReply(null);
                      if (editing) setDraft("");
                      setEditing(null);
                    }}
                  >
                    <X size={17} />
                  </button>
                </div>
              )}
              {file && (
                <div className="reply-bar">
                  <Paperclip size={17} />
                  <span>{file.name}</span>
                  <button
                    aria-label="Убрать вложение"
                    disabled={attachmentPending || retryPending}
                    onClick={() => setFile(null)}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              {peerId &&
              current.kind === "direct" &&
              blocked.includes(peerId) ? (
                <div className="blocked-note">
                  Пользователь заблокирован. Разблокируйте его через меню чата.
                </div>
              ) : (
                <form className="composer" onSubmit={send}>
                  <label
                    className={`icon-button file-label ${editing ? "disabled" : ""}`}
                    title="Прикрепить файл"
                  >
                    <Paperclip size={21} />
                    <input
                      type="file"
                      aria-label="Прикрепить файл"
                      accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"
                      disabled={
                        !!editing || busy || attachmentPending || retryPending
                      }
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          try {
                            validateFile(f);
                            setFile(f);
                          } catch (err) {
                            setError(errorText(err));
                          }
                        }
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <textarea
                    ref={composerRef}
                    aria-label="Сообщение"
                    disabled={busy || retryPending}
                    placeholder="Напишите сообщение…"
                    value={draft}
                    maxLength={4000}
                    rows={1}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      if (Date.now() - lastTyping.current > 1500) {
                        lastTyping.current = Date.now();
                        void channelRef.current?.track({
                          typing: true,
                          at: Date.now(),
                        });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        e.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  <div className="emoji-wrap">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Эмодзи"
                      disabled={busy || retryPending}
                      aria-expanded={emojiOpen}
                      onClick={() => setEmojiOpen(!emojiOpen)}
                    >
                      <Smile size={21} />
                    </button>
                    {emojiOpen && (
                      <div className="emoji-picker">
                        {["😊", "💜", "👍", "🎉", "✨", "👋", "❤️", "😂"].map(
                          (emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => {
                                setDraft((x) => (x + emoji).slice(0, 4000));
                                setEmojiOpen(false);
                                composerRef.current?.focus();
                              }}
                            >
                              {emoji}
                            </button>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    className="send-button"
                    aria-label={
                      editing ? "Сохранить сообщение" : "Отправить сообщение"
                    }
                    disabled={busy || (!draft.trim() && !file)}
                  >
                    {busy ? (
                      <LoaderCircle size={20} className="spin" />
                    ) : (
                      <ArrowUp size={21} />
                    )}
                  </button>
                </form>
              )}
              <div className="composer-hint">
                Enter — отправить · Shift + Enter — новая строка
                <span>Вложения до 10 МБ</span>
              </div>
            </div>
          </>
        )}
      </section>
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <ModalFrame
            title={
              modal === "settings"
                ? "Ваш профиль"
                : modal === "group"
                  ? "О группе"
                  : "Новый разговор"
            }
            onClose={closeModal}
          >
            {modal === "settings" ? (
              <>
                <div className="settings-avatar">
                  <Avatar
                    name={profile?.display_name || "A"}
                    path={profile?.avatar_path}
                  />
                  <label className="text-button">
                    <ImagePlus size={17} /> Изменить аватар
                    <input
                      type="file"
                      aria-label="Аватар профиля"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void run(() => uploadAvatar(f));
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <form onSubmit={saveProfile}>
                  <label>
                    Отображаемое имя
                    <input
                      name="display_name"
                      defaultValue={profile?.display_name}
                      required
                      maxLength={60}
                    />
                  </label>
                  <label>
                    Юзернейм
                    <input
                      name="username"
                      defaultValue={profile?.username}
                      required
                      minLength={3}
                      maxLength={24}
                    />
                  </label>
                  <button className="primary" disabled={busy}>
                    Сохранить профиль
                  </button>
                </form>
                <div className="settings-divider" />
                <button
                  className="settings-action"
                  onClick={() => setLight(!light)}
                >
                  {light ? <Moon size={18} /> : <Sun size={18} />}{" "}
                  {light ? "Тёмная тема" : "Светлая тема"}
                </button>
                <button
                  className="settings-action"
                  onClick={() =>
                    void run(async () => {
                      const { error } = await client.auth.signOut({
                        scope: "local",
                      });
                      if (error) throw error;
                    })
                  }
                >
                  <LogOut size={18} /> Выйти на этом устройстве
                </button>
                <button
                  className="settings-action danger"
                  onClick={() =>
                    void run(async () => {
                      const { error } = await client.auth.signOut({
                        scope: "global",
                      });
                      if (error) throw error;
                    })
                  }
                >
                  Завершить все сессии
                </button>
                <small className="muted">
                  Уже выданный access token действует до своего истечения.
                  Используйте короткий срок JWT в Supabase.
                </small>
              </>
            ) : (
              <>
                {modal === "new" && (
                  <>
                    <p className="muted">
                      Найдите человека по точному юзернейму.
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(searchUser);
                      }}
                      className="user-search"
                    >
                      <input
                        autoFocus
                        aria-label="Юзернейм для поиска"
                        value={search}
                        onChange={(e) => {
                          setSearch(e.target.value);
                          setFound(null);
                        }}
                        placeholder="@username"
                        required
                        maxLength={25}
                      />
                      <button className="primary" disabled={busy}>
                        <Search size={18} />
                        <span className="sr-only">Найти</span>
                      </button>
                    </form>
                    {found && (
                      <div className="found-user">
                        <Avatar name={found.display_name} />
                        <span>
                          <strong>{found.display_name}</strong>
                          <small>@{found.username}</small>
                        </span>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => void run(() => startChat(found))}
                        >
                          Написать
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Добавить в новую группу"
                          onClick={() =>
                            setGroupPeople((p) =>
                              p.some((x) => x.id === found.id)
                                ? p
                                : [...p, found],
                            )
                          }
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                    )}
                    <div className="settings-divider" />
                    <h3>
                      <Users size={18} /> Или создайте группу
                    </h3>
                    <p className="muted small">
                      Участников можно добавить через поиск выше или пригласить
                      позже.
                    </p>
                    {groupPeople.map((p) => (
                      <div className="member-chip" key={p.id}>
                        @{p.username}
                        <button
                          aria-label={`Убрать ${p.username}`}
                          onClick={() =>
                            setGroupPeople((g) =>
                              g.filter((x) => x.id !== p.id),
                            )
                          }
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(async () => {
                          const cid = await rpc("create_group", {
                            group_title: groupTitle,
                            member_ids: groupPeople.map((p) => p.id),
                          });
                          await refresh();
                          setModal(null);
                          select(cid);
                        });
                      }}
                    >
                      <label>
                        Название группы
                        <input
                          value={groupTitle}
                          onChange={(e) => setGroupTitle(e.target.value)}
                          required
                          maxLength={80}
                          placeholder="Например, Близкий круг"
                        />
                      </label>
                      <button
                        className="primary"
                        disabled={busy || !groupTitle.trim()}
                      >
                        <Users size={17} /> Создать группу
                      </button>
                    </form>
                  </>
                )}
                {modal === "group" && current && (
                  <>
                    <div className="settings-avatar">
                      <Avatar
                        name={nameOf(current)}
                        path={current.avatar_path}
                        bucket="group-avatars"
                      />
                      {owner && (
                        <label className="text-button">
                          <ImagePlus size={17} /> Аватар группы
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            aria-label="Аватар группы"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void run(() => uploadAvatar(f, true));
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                    </div>
                    {owner && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void run(async () => {
                            await rpc("update_group", {
                              cid: selected,
                              group_title: groupTitle,
                              group_avatar: current.avatar_path,
                            });
                            await refresh();
                            setNotice("Группа обновлена");
                          });
                        }}
                      >
                        <label>
                          Название
                          <input
                            value={groupTitle}
                            onChange={(e) => setGroupTitle(e.target.value)}
                            required
                            maxLength={80}
                          />
                        </label>
                        <button className="primary" disabled={busy}>
                          Сохранить
                        </button>
                      </form>
                    )}
                    <h3>Участники · {currentMembers.length}/50</h3>
                    {currentMembers.map((m) => (
                      <div className="member-chip" key={m.user_id}>
                        {profiles.find((p) => p.id === m.user_id)
                          ?.display_name || "Участник"}
                        {m.role === "owner" && <small>владелец</small>}
                      </div>
                    ))}
                    {owner && (
                      <>
                        <form
                          className="user-search"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void run(searchUser);
                          }}
                        >
                          <input
                            aria-label="Юзернейм для приглашения"
                            placeholder="@username"
                            value={search}
                            onChange={(e) => {
                              setSearch(e.target.value);
                              setFound(null);
                            }}
                            required
                          />
                          <button className="primary" disabled={busy}>
                            <Search size={18} />
                            <span className="sr-only">Найти</span>
                          </button>
                        </form>
                        {found && (
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                await rpc("invite_member", {
                                  cid: selected,
                                  peer_id: found.id,
                                });
                                setFound(null);
                                await refresh();
                                setNotice("Участник добавлен");
                              })
                            }
                          >
                            Пригласить @{found.username}
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
              </>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="success">
                {notice}
              </p>
            )}
          </ModalFrame>
        </div>
      )}
    </main>
  );
}
function ModalFrame({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const container = ref.current;
    container?.querySelector<HTMLElement>("input, button")?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && container) {
        const nodes = Array.from(
          container.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled), a[href], textarea:not(:disabled)",
          ),
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal"
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <header>
        <h2 id="modal-title">{title}</h2>
        <button className="icon-button" aria-label="Закрыть" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      {children}
    </div>
  );
}
