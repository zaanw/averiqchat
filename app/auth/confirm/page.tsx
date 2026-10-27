"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase } from "../../../lib/supabase";
import Brand from "../../../components/brand";
import { appPath } from "../../../lib/paths";
export default function Confirm() {
  const [message, setMessage] = useState("Подтверждаем вход…");
  useEffect(() => {
    const client = getSupabase();
    if (!client) {
      Promise.resolve().then(() => setMessage("Сначала подключите Supabase."));
      return;
    }
    client.auth.getSession().then(({ data, error }) => {
      if (error) setMessage(error.message);
      else if (data.session) location.replace(appPath());
      else
        setMessage(
          "Ссылка недействительна или истекла. Попробуйте войти или запросить новую ссылку восстановления.",
        );
    });
  }, []);
  return (
    <main className="center-screen">
      <Brand />
      <p role="status">{message}</p>
      <Link href="/">На страницу входа</Link>
    </main>
  );
}
