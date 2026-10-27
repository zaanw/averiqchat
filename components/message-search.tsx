"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, Reply, Search, X } from "lucide-react";
import { getSupabase } from "../lib/supabase";
import { errorText } from "../lib/errors";
import type { Message, Profile } from "../lib/types";

export default function MessageSearch({
  conversationId,
  profiles,
  onReply,
  onClose,
}: {
  conversationId: string;
  profiles: Profile[];
  onReply: (message: Message) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Message[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose]);
  async function search(more = false) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    const last = more ? results.at(-1) : undefined;
    try {
      const { data, error } = await getSupabase()!
        .rpc("search_messages", {
          cid: conversationId,
          query_text: query.trim(),
          before_created: last?.created_at || null,
          before_id: last?.id || null,
        })
        .abortSignal(controller.signal);
      if (controller.signal.aborted) return;
      if (error) throw error;
      const rows = (data || []) as Message[];
      setResults((previous) => (more ? [...previous, ...rows] : rows));
      setHasMore(rows.length === 50);
      setSearched(true);
    } catch (error) {
      if (!controller.signal.aborted) setError(errorText(error));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void search();
  }
  return (
    <section className="message-search" aria-label="Поиск по истории">
      <header>
        <h3>Поиск в чате</h3>
        <button
          className="icon-button"
          aria-label="Закрыть поиск"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <form onSubmit={submit}>
        <input
          autoFocus
          aria-label="Текст для поиска"
          placeholder="Найти сообщение…"
          minLength={2}
          maxLength={100}
          required
          value={query}
          onChange={(event) => {
            request.current?.abort();
            setQuery(event.target.value);
            setResults([]);
            setSearched(false);
            setHasMore(false);
            setLoading(false);
            setError("");
          }}
        />
        <button
          className="icon-button"
          aria-label="Найти сообщения"
          disabled={loading || query.trim().length < 2}
        >
          {loading ? (
            <LoaderCircle size={19} className="spin" />
          ) : (
            <Search size={19} />
          )}
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="search-results" aria-live="polite" aria-busy={loading}>
        {!searched && !loading && (
          <p className="search-hint">
            Поиск по всей текстовой истории этого чата. Введите не меньше двух
            символов.
          </p>
        )}
        {searched && !results.length && (
          <p className="search-hint">Сообщений не найдено</p>
        )}
        {results.map((message) => (
          <article className="search-result" key={message.id}>
            <div>
              <strong>
                {profiles.find((profile) => profile.id === message.sender_id)
                  ?.display_name || "Участник"}
              </strong>
              <time dateTime={message.created_at}>
                {new Date(message.created_at).toLocaleString("ru", {
                  day: "numeric",
                  year: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
            <p>{message.body}</p>
            <button className="text-button" onClick={() => onReply(message)}>
              <Reply size={14} />
              Ответить
            </button>
          </article>
        ))}
        {hasMore && (
          <button
            className="text-button search-more"
            disabled={loading}
            onClick={() => void search(true)}
          >
            {loading ? "Загружаем…" : "Более ранние результаты"}
          </button>
        )}
      </div>
    </section>
  );
}
