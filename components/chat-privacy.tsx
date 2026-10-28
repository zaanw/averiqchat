"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, ShieldBan } from "lucide-react";
import { getSupabase } from "../lib/supabase";
import { errorText } from "../lib/errors";
import type { ChatPreferences } from "../lib/chat-preferences";
type Privacy = { read_receipts: boolean; discoverable: boolean };
type BlockedUser = { id: string; username: string; display_name: string };
export default function ChatPrivacy({
  userId,
  preferences,
  updatePreferences,
  onBlocksChanged,
  storageAvailable,
}: {
  userId: string;
  storageAvailable: boolean;
  preferences: ChatPreferences;
  updatePreferences: (patch: Partial<ChatPreferences>) => void;
  onBlocksChanged: () => Promise<void>;
}) {
  const [privacy, setPrivacy] = useState<Privacy | null>(null);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    async function load() {
      setError("");
      const client = getSupabase()!;
      const [settings, users] = await Promise.all([
        client
          .from("privacy_settings")
          .select("read_receipts,discoverable")
          .eq("user_id", userId)
          .abortSignal(controller.signal)
          .maybeSingle(),
        client.rpc("list_blocked_users", {}).abortSignal(controller.signal),
      ]);
      if (controller.signal.aborted) return;
      if (settings.error || users.error) {
        setError(errorText(settings.error || users.error));
        return;
      }
      setPrivacy(settings.data || { read_receipts: true, discoverable: true });
      setBlocked(users.data || []);
      setHasMore(users.data?.length === 50);
    }
    void load().catch((error) => {
      if (!controller.signal.aborted) setError(errorText(error));
    });
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, [userId, retry]);
  async function save(patch: Partial<Privacy>) {
    const previous = privacy;
    const next = { ...privacy!, ...patch };
    setPrivacy(next);
    setBusy(true);
    setError("");
    try {
      const { error } = await getSupabase()!.rpc("set_privacy_settings", {
        share_read_receipts: patch.read_receipts ?? null,
        allow_discovery: patch.discoverable ?? null,
      });
      if (error) throw error;
      if (alive.current) setPrivacy(next);
    } catch (error) {
      if (alive.current) {
        setPrivacy(previous);
        setError(errorText(error));
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function unblock(id: string) {
    setBusy(true);
    setError("");
    try {
      const { error } = await getSupabase()!.rpc("set_block", {
        peer_id: id,
        blocked: false,
      });
      if (error) throw error;
      if (alive.current)
        setBlocked((previous) => previous.filter((user) => user.id !== id));
      await onBlocksChanged();
    } catch (error) {
      if (alive.current) setError(errorText(error));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function more() {
    setBusy(true);
    setError("");
    try {
      const { data, error } = await getSupabase()!.rpc("list_blocked_users", {
        after_username: blocked.at(-1)?.username,
      });
      if (error) throw error;
      if (!alive.current) return;
      setBlocked((previous) => [
        ...previous,
        ...(data || []).filter(
          (user: BlockedUser) => !previous.some((item) => item.id === user.id),
        ),
      ]);
      setHasMore(data?.length === 50);
    } catch (error) {
      if (alive.current) setError(errorText(error));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <div className="privacy-settings">
      {error && (
        <div className="settings-error" role="alert">
          <p>{error}</p>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setRetry((value) => value + 1)}
          >
            Повторить загрузку
          </button>
        </div>
      )}
      {!privacy && !error && (
        <p className="loading-line">
          <LoaderCircle className="spin" size={18} />
          Загружаем настройки…
        </p>
      )}
      {privacy && (
        <>
          <p className="settings-caption">
            Эти настройки действуют для аккаунта на всех устройствах и
            проверяются сервером.
          </p>
          <label className="settings-row switch-row">
            <span>
              Поиск по юзернейму
              <small>
                Разрешать людям без общего чата находить меня по @username
              </small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={privacy.discoverable}
              disabled={busy}
              onChange={(event) =>
                void save({ discoverable: event.target.checked })
              }
            />
          </label>
          <label className="settings-row switch-row">
            <span>
              Отчёты о прочтении
              <small>Сообщать участникам чата, что я прочитал сообщения</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={privacy.read_receipts}
              disabled={busy}
              onChange={(event) =>
                void save({ read_receipts: event.target.checked })
              }
            />
          </label>
          <p className="settings-caption">
            Уже отправленные отметки о прочтении сохранятся. В общих чатах ваше
            имя и юзернейм остаются видны участникам.
          </p>
          {busy && (
            <p className="settings-caption" role="status">
              Сохраняем изменения…
            </p>
          )}
          <h3>На этом устройстве</h3>
          <p className="settings-caption">
            {storageAvailable
              ? "Эти параметры сохраняются только в этом браузере."
              : "Браузер запрещает сохранение: эти параметры действуют до перезагрузки страницы."}
          </p>
          <label className="settings-row switch-row">
            <span>
              Показывать, что я печатаю
              <small>Собеседники видят индикатор набора</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={preferences.showTyping}
              onChange={(event) =>
                updatePreferences({ showTyping: event.target.checked })
              }
            />
          </label>
          <label className="settings-row switch-row">
            <span>
              Текст сообщений в списке чатов
              <small>
                Отключите, чтобы рядом с именем не показывался текст переписки
              </small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={preferences.showPreviews}
              onChange={(event) =>
                updatePreferences({ showPreviews: event.target.checked })
              }
            />
          </label>
          <h3>
            <ShieldBan size={18} />
            Заблокированные{" "}
            <span className="settings-count">
              {blocked.length}
              {hasMore ? "+" : ""}
            </span>
          </h3>
          {!blocked.length && (
            <p className="settings-caption">
              Вы никого не заблокировали. Заблокировать человека можно в меню
              личного чата.
            </p>
          )}
          {blocked.map((user) => (
            <div className="blocked-user" key={user.id}>
              <span>
                <strong>{user.display_name}</strong>
                <small>@{user.username}</small>
              </span>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void unblock(user.id)}
              >
                Разблокировать<span className="sr-only"> @{user.username}</span>
              </button>
            </div>
          ))}
          {hasMore && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void more()}
            >
              Показать ещё
            </button>
          )}
          <p className="settings-caption">
            Блокировка запрещает новые личные сообщения в обе стороны. В общих
            группах вы по-прежнему видите сообщения друг друга.
          </p>
        </>
      )}
    </div>
  );
}
