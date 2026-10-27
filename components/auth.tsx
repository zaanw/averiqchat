"use client";
import { useState } from "react";
import { ArrowLeft, LockKeyhole, LoaderCircle } from "lucide-react";
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
      <header className="auth-header">
        <Brand />
      </header>
      <section className="auth-form-section">
        <form onSubmit={submit} className="auth-card">
          <h1>
            {mode === "login"
              ? "Вход"
              : mode === "signup"
                ? "Регистрация"
                : "Сброс пароля"}
          </h1>
          <p className="muted">
            {mode === "login"
              ? "Войдите в Averiq Chat."
              : mode === "signup"
                ? "Укажите email и выберите юзернейм."
                : "Отправим ссылку на ваш email."}
          </p>
          {!client && (
            <div className="setup-notice">
              <strong>Подключите Supabase</strong>
              <p>
                Для входа нужен настроенный сервер. Инструкция подключения — в
                README.
              </p>
            </div>
          )}
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              maxLength={254}
            />
          </label>
          {mode === "signup" && (
            <label>
              Юзернейм
              <input
                name="username"
                aria-label="Юзернейм"
                autoComplete="username"
                placeholder="username"
                required
                pattern="[A-Za-z][A-Za-z0-9_]{2,23}"
                minLength={3}
                maxLength={24}
              />
              <small>3–24 символа: латиница, цифры и _</small>
            </label>
          )}
          {mode !== "reset" && (
            <label>
              Пароль
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                required
                minLength={mode === "signup" ? 12 : 1}
                maxLength={128}
              />
              {mode === "signup" && <small>Не менее 12 символов</small>}
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
              <>
                <LoaderCircle className="spin" size={16} />
                <span>Подождите…</span>
              </>
            ) : mode === "login" ? (
              "Войти"
            ) : mode === "signup" ? (
              "Создать аккаунт"
            ) : (
              "Отправить ссылку"
            )}
          </button>
          <div className="auth-switch">
            {mode === "login" ? (
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
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError("");
                  setNotice("");
                }}
              >
                <ArrowLeft size={14} />
                Вернуться ко входу
              </button>
            )}
          </div>
          <details className="privacy-note">
            <summary>
              <LockKeyhole size={12} />О приватности
            </summary>
            <p>Личные чаты доступны их участникам. Сквозного шифрования нет.</p>
          </details>
        </form>
      </section>
    </main>
  );
}
