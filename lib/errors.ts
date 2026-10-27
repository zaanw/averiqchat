import { ZodError } from "zod";
export function errorText(error: unknown): string {
  if (error instanceof ZodError)
    return error.issues.map((issue) => issue.message).join(". ");
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "Не удалось выполнить запрос. Проверьте соединение.";
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";
  if (code === "23505")
    return "Это значение уже используется. Выберите другой юзернейм или проверьте, не отправляли ли вы жалобу ранее.";
  if (message === "Invalid login credentials")
    return "Неверный email или пароль.";
  if (message === "Email not confirmed")
    return "Сначала подтвердите email по ссылке из письма.";
  if (message.includes("Failed to fetch") || message.includes("NetworkError"))
    return "Нет соединения с сервером. Проверьте сеть и повторите попытку.";
  return message;
}
