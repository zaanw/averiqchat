"use client";
import { useState } from "react";
import { SmilePlus } from "lucide-react";
import type { MessageReaction } from "../lib/types";
const EMOJI = ["👍", "❤️", "😂", "🎉", "😮", "😢"];
export default function MessageReactions({
  items,
  userId,
  busy,
  onReact,
}: {
  items: MessageReaction[];
  userId: string;
  busy: boolean;
  onReact: (emoji: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const mine = items.find((item) => item.user_id === userId)?.emoji;
  function choose(emoji: string) {
    setOpen(false);
    onReact(mine === emoji ? null : emoji);
  }
  return (
    <div className="message-reactions">
      <div className="reaction-counts">
        {EMOJI.filter((emoji) =>
          items.some((item) => item.emoji === emoji),
        ).map((emoji) => {
          const count = items.filter((item) => item.emoji === emoji).length;
          return (
            <button
              key={emoji}
              aria-label={`Реакция ${emoji}: ${count}`}
              aria-pressed={mine === emoji}
              disabled={busy}
              onClick={() => choose(emoji)}
            >
              {emoji}
              <span>{count}</span>
            </button>
          );
        })}
        <button
          className="add-reaction"
          aria-label="Добавить реакцию"
          aria-expanded={open}
          disabled={busy}
          onClick={() => setOpen((value) => !value)}
        >
          <SmilePlus size={15} />
        </button>
      </div>
      {open && (
        <div
          className="reaction-choices"
          role="group"
          aria-label="Выбор реакции"
        >
          {EMOJI.map((emoji) => (
            <button
              key={emoji}
              aria-label={`Поставить ${emoji}`}
              aria-pressed={mine === emoji}
              disabled={busy}
              onClick={() => choose(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
