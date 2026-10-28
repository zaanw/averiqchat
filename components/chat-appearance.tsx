"use client";
import { Moon, Sun } from "lucide-react";
import type { ChatPreferences } from "../lib/chat-preferences";

export default function ChatAppearance({
  preferences,
  updatePreferences,
  resetPreferences,
  light,
  toggleTheme,
  storageAvailable,
}: {
  preferences: ChatPreferences;
  updatePreferences: (patch: Partial<ChatPreferences>) => void;
  resetPreferences: () => void;
  light: boolean;
  toggleTheme: () => void;
  storageAvailable: boolean;
}) {
  return (
    <div className="appearance-settings">
      <p className="settings-caption">
        {storageAvailable
          ? "Изменения сохраняются автоматически для вашего аккаунта в этом браузере."
          : "Браузер не разрешает сохранять настройки. Изменения действуют до перезагрузки страницы."}
      </p>
      <h3>Оформление</h3>
      <button
        className="settings-row"
        aria-label={light ? "Тёмная тема" : "Светлая тема"}
        onClick={toggleTheme}
      >
        <span>
          {light ? <Moon size={19} /> : <Sun size={19} />}
          {light ? "Тёмная тема" : "Светлая тема"}
        </span>
        <span className="muted">
          {light ? "Сейчас светлая" : "Сейчас тёмная"}
        </span>
      </button>
      <fieldset className="preference-field">
        <legend>Цвет акцента</legend>
        <div className="accent-options">
          {(
            [
              { value: "blue", label: "Синий" },
              { value: "violet", label: "Фиолетовый" },
              { value: "green", label: "Зелёный" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              className={`accent-option ${option.value}`}
              aria-label={option.label}
              aria-pressed={preferences.accent === option.value}
              onClick={() => updatePreferences({ accent: option.value })}
            >
              <span />
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="preference-field font-control">
        <span>
          Размер текста сообщений <output>{preferences.fontSize} px</output>
        </span>
        <input
          type="range"
          min="13"
          max="20"
          step="1"
          value={preferences.fontSize}
          onChange={(event) =>
            updatePreferences({ fontSize: Number(event.target.value) })
          }
        />
      </label>
      <label className="settings-row">
        Фон переписки
        <select
          value={preferences.wallpaper}
          onChange={(event) =>
            updatePreferences({
              wallpaper: event.target.value as ChatPreferences["wallpaper"],
            })
          }
        >
          <option value="pattern">С рисунком</option>
          <option value="plain">Однотонный</option>
        </select>
      </label>
      <label className="settings-row switch-row">
        <span>
          Компактный список чатов
          <small>Меньше отступов, больше разговоров</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={preferences.compact}
          onChange={(event) =>
            updatePreferences({ compact: event.target.checked })
          }
        />
      </label>
      <h3>Сообщения</h3>
      <label className="settings-row">
        Отправка сообщения
        <select
          value={preferences.sendShortcut}
          onChange={(event) =>
            updatePreferences({
              sendShortcut: event.target
                .value as ChatPreferences["sendShortcut"],
            })
          }
        >
          <option value="enter">Enter</option>
          <option value="mod-enter">Ctrl / ⌘ + Enter</option>
        </select>
      </label>
      <p className="settings-caption">
        {preferences.sendShortcut === "enter"
          ? "Shift + Enter — новая строка."
          : "Enter — новая строка."}{" "}
        Кнопка отправки работает всегда.
      </p>
      <label className="settings-row switch-row">
        <span>
          Уменьшить анимации
          <small>Без плавной прокрутки и анимаций переходов</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={preferences.reduceMotion}
          onChange={(event) =>
            updatePreferences({ reduceMotion: event.target.checked })
          }
        />
      </label>
      <p className="settings-caption">
        Индикатор набора и текст превью настраиваются в разделе «Приватность».
      </p>
      <button
        className="text-button reset-preferences"
        onClick={resetPreferences}
      >
        Сбросить настройки чатов
      </button>
    </div>
  );
}
