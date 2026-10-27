"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase } from "../../lib/supabase";
import { passwordSchema } from "../../lib/validation";
import Brand from "../../components/brand";
export default function Reset() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const client = getSupabase();
    if (!client) {
      Promise.resolve().then(() => setError("Supabase не подключён"));
      return;
    }
    client.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      else if (!data.session)
        setError(
          "Откройте ссылку из письма в том же браузере, где запрашивали сброс.",
        );
      else setReady(true);
    });
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const password = passwordSchema.parse(data.get("password"));
      if (password !== data.get("confirm"))
        throw new Error("Пароли не совпадают");
      const { error } = await getSupabase()!.auth.updateUser({ password });
      if (error) throw error;
      const { error: signOutError } = await getSupabase()!.auth.signOut({
        scope: "global",
      });
      if (signOutError) throw signOutError;
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось обновить пароль");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="center-screen">
      <Brand />
      <form className="reset-card" onSubmit={submit}>
        <h1>Новый пароль</h1>
        {done ? (
          <p role="status">Пароль изменён. Войдите с новым паролем.</p>
        ) : (
          <>
            <label>
              Пароль
              <input
                name="password"
                type="password"
                minLength={12}
                maxLength={128}
                required
                autoComplete="new-password"
              />
            </label>
            <label>
              Повторите пароль
              <input
                name="confirm"
                type="password"
                minLength={12}
                maxLength={128}
                required
                autoComplete="new-password"
              />
            </label>
            <button className="primary" disabled={!ready || busy}>
              Сохранить пароль
            </button>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <Link href="/">Вернуться ко входу</Link>
      </form>
    </main>
  );
}
