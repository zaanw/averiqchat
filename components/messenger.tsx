"use client";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { LoaderCircle } from "lucide-react";
import { getSupabase } from "../lib/supabase";
import Auth from "./auth";
import Chat from "./chat";
export default function Messenger() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const client = getSupabase();
    if (!client) {
      Promise.resolve().then(() => setLoading(false));
      return;
    }
    let active = true;
    client.auth.getSession().then(({ data, error }) => {
      if (active) {
        setSession(data.session);
        setLoading(false);
        if (error) setError(error.message);
      }
    });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, next) => {
      if (active) {
        setSession(next);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  if (loading)
    return (
      <main className="center-screen" role="status">
        <LoaderCircle className="spin" /> Загрузка Averiq…
      </main>
    );
  if (error)
    return (
      <main className="center-screen">
        <p role="alert">{error}</p>
        <button onClick={() => location.reload()}>Повторить подключение</button>
      </main>
    );
  return session ? (
    <Chat key={session.user.id} userId={session.user.id} />
  ) : (
    <Auth />
  );
}
