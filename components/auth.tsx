"use client";
import { useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Mail,
  LockKeyhole,
  AtSign,
  LoaderCircle,
} from "lucide-react";
import { getSupabase } from "../lib/supabase";
import { passwordSchema, usernameSchema } from "../lib/validation";
import Brand from "./brand";
import { appPath } from "../lib/paths";
import { errorText } from "../lib/errors";
export default function Auth() {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const client = getSupabase();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!client) return;
    setBusy(true);
    setError("");
    setNotice("");
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email")).trim();
    const password = String(data.get("password") || "");
    try {
      if (mode === "signup") {
        passwordSchema.parse(password);
        const username = usernameSchema.parse(data.get("username"));
        const { error } = await client.auth.signUp({
          email,
          password,
          options: {
            data: { username, display_name: username },
            emailRedirectTo: `${location.origin}${appPath("/auth/confirm")}`,
          },
        });
        if (error) throw error;
        setNotice(
          "Проверьте почту и подтвердите email. Затем войдите в аккаунт.",
        );
      } else if (mode === "reset") {
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}${appPath("/reset-password")}`,
        });
        if (error) throw error;
        setNotice(
          "Если аккаунт существует, на почту отправлена ссылка для сброса пароля.",
        );
      } else {
        const { error } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Brand />
        <div className="story-content">
          <span className="eyebrow">БЛИЖЕ, ДАЖЕ НА РАССТОЯНИИ</span>
          <h1>
            Хорошие разговоры
            <br />
            начинаются <em>здесь.</em>
          </h1>
          <p>
            Ваши люди. Ваше пространство.
            <br />
            Ничего лишнего между вами.
          </p>
          <div className="orbit-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orb orb-main">
              <svg viewBox="0 0 80 80">
                <path
                  d="M18 20h44v31H39L25 64V51h-7Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinejoin="round"
                />
                <circle cx="30" cy="35" r="2" />
                <circle cx="40" cy="35" r="2" />
                <circle cx="50" cy="35" r="2" />
              </svg>
            </div>
            <span className="orb orb-small">✦</span>
            <span className="orbit-dot" />
          </div>
        </div>
        <span className="story-footer">Меньше шума. Больше смысла.</span>
      </section>
      <section className="auth-form-section">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        <form onSubmit={submit} className="auth-card">
          <span className="eyebrow">ВАШЕ ЛИЧНОЕ ПРОСТРАНСТВО</span>
          <h2>
            {mode === "login"
              ? "С возвращением"
              : mode === "signup"
                ? "Давайте знакомиться"
                : "Забыли пароль?"}
          </h2>
          <p className="muted">
            {mode === "login"
              ? "Войдите, чтобы продолжить разговор."
              : mode === "signup"
                ? "Создайте аккаунт и найдите своих людей."
                : "Пришлём ссылку для восстановления доступа."}
          </p>
          {!client && (
            <div className="setup-notice">
              <strong>Подключите Supabase</strong>
              <p>
                Для настоящей переписки нужны настройки сервера. Добавьте
                NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY в
                .env.local по инструкции README.
              </p>
              <span>Демо-аккаунтов и вымышленных чатов здесь нет.</span>
            </div>
          )}
          <label>
            Email
            <div className="input-icon">
              <Mail size={18} />
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                maxLength={254}
              />
            </div>
          </label>
          {mode === "signup" && (
            <label>
              Юзернейм
              <div className="input-icon">
                <AtSign size={18} />
                <input
                  name="username"
                  aria-label="Юзернейм"
                  autoComplete="username"
                  placeholder="your_name"
                  required
                  pattern="[A-Za-z][A-Za-z0-9_]{2,23}"
                  minLength={3}
                  maxLength={24}
                />
              </div>
              <small>Латинские буквы, цифры и _, от 3 до 24 символов</small>
            </label>
          )}
          {mode !== "reset" && (
            <label>
              Пароль
              <div className="input-icon">
                <LockKeyhole size={18} />
                <input
                  name="password"
                  type="password"
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  placeholder={
                    mode === "signup"
                      ? "Не менее 12 символов"
                      : "Введите пароль"
                  }
                  required
                  minLength={mode === "signup" ? 12 : 1}
                  maxLength={128}
                />
              </div>
            </label>
          )}
          {mode === "login" && (
            <button
              type="button"
              className="text-button forgot"
              onClick={() => {
                setMode("reset");
                setError("");
                setNotice("");
              }}
            >
              Забыли пароль?
            </button>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="success" role="status">
              {notice}
            </p>
          )}
          <button className="primary auth-submit" disabled={busy || !client}>
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <>
                {mode === "login"
                  ? "Войти"
                  : mode === "signup"
                    ? "Создать аккаунт"
                    : "Отправить ссылку"}
                <ArrowRight size={18} />
              </>
            )}
          </button>
          <div className="auth-switch">
            {mode === "login" ? (
              <>
                Ещё нет аккаунта?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setError("");
                    setNotice("");
                  }}
                >
                  Зарегистрироваться
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError("");
                  setNotice("");
                }}
              >
                <ArrowLeft size={14} /> Вернуться ко входу
              </button>
            )}
          </div>
          <div className="privacy-note">
            <LockKeyhole size={14} />
            <span>
              Личные чаты доступны только их участникам.
              <br />
              Сквозное шифрование не реализовано.
            </span>
          </div>
        </form>
        <span className="auth-copyright">
          © {new Date().getFullYear()} Averiq Chat
        </span>
      </section>
    </main>
  );
}
