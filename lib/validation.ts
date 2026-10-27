import { z } from "zod";
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z][a-z0-9_]{2,23}$/,
    "3–24 символа: латинские буквы, цифры и _, первый символ — буква",
  );
export const passwordSchema = z
  .string()
  .min(12, "Минимум 12 символов")
  .max(128);
export const messageSchema = z
  .string()
  .trim()
  .min(1, "Введите сообщение")
  .max(4000, "Не более 4000 символов");
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const allowedTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
];
export function validateFile(
  file: Pick<File, "size" | "type">,
  avatar = false,
) {
  if (file.size <= 0 || file.size > (avatar ? 2 * 1024 * 1024 : MAX_FILE_SIZE))
    throw new Error(avatar ? "Аватар: до 2 МБ" : "Файл: от 1 байта до 10 МБ");
  if (!(avatar ? allowedTypes.slice(0, 3) : allowedTypes).includes(file.type))
    throw new Error(
      "Разрешены JPG, PNG, WebP, PDF и TXT; для аватара — только изображения",
    );
}
