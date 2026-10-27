"use client";
export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return (
    <main className="center-screen">
      <h1>Не удалось открыть Averiq</h1>
      <p role="alert">Проверьте подключение и настройки приложения.</p>
      <button className="primary" onClick={reset}>
        Попробовать снова
      </button>
      <button className="text-button" onClick={() => location.reload()}>
        Перезагрузить страницу
      </button>
    </main>
  );
}
