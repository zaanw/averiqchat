"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  chatPreferencesSchema,
  DEFAULT_CHAT_PREFERENCES,
  parseChatPreferences,
  type ChatPreferences,
} from "./chat-preferences";

export function useChatPreferences(userId: string) {
  const key = `averiq-chat-preferences:${userId}`;
  const [preferences, setPreferences] = useState(DEFAULT_CHAT_PREFERENCES);
  const current = useRef(preferences);
  const [storageAvailable, setStorageAvailable] = useState(true);
  useEffect(() => {
    let active = true;
    let saved = DEFAULT_CHAT_PREFERENCES;
    let available = true;
    try {
      saved = parseChatPreferences(localStorage.getItem(key));
    } catch {
      available = false;
    }
    Promise.resolve().then(() => {
      if (!active) return;
      current.current = saved;
      setPreferences(saved);
      setStorageAvailable(available);
    });
    const sync = (event: StorageEvent) => {
      if (event.key !== key && event.key !== null) return;
      try {
        if (event.storageArea !== localStorage) return;
      } catch {
        return;
      }
      const next = parseChatPreferences(
        event.key === null ? null : event.newValue,
      );
      current.current = next;
      setPreferences(next);
    };
    window.addEventListener("storage", sync);
    return () => {
      active = false;
      window.removeEventListener("storage", sync);
    };
  }, [key]);

  const updatePreferences = useCallback(
    (patch: Partial<ChatPreferences>) => {
      const next = chatPreferencesSchema.parse({
        ...current.current,
        ...patch,
      });
      current.current = next;
      setPreferences(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
        setStorageAvailable(true);
      } catch {
        setStorageAvailable(false);
      }
    },
    [key],
  );
  const resetPreferences = useCallback(() => {
    updatePreferences({
      ...DEFAULT_CHAT_PREFERENCES,
      showTyping: current.current.showTyping,
      showPreviews: current.current.showPreviews,
    });
  }, [updatePreferences]);
  return { preferences, updatePreferences, resetPreferences, storageAvailable };
}
