import { z } from "zod";

export const chatPreferencesSchema = z.object({
  accent: z.enum(["blue", "violet", "green"]).default("blue"),
  fontSize: z.number().int().min(13).max(20).default(15),
  wallpaper: z.enum(["pattern", "plain"]).default("pattern"),
  compact: z.boolean().default(false),
  reduceMotion: z.boolean().default(false),
  showPreviews: z.boolean().default(true),
  sendShortcut: z.enum(["enter", "mod-enter"]).default("enter"),
  showTyping: z.boolean().default(true),
});
export type ChatPreferences = z.infer<typeof chatPreferencesSchema>;
export const DEFAULT_CHAT_PREFERENCES = chatPreferencesSchema.parse({});

export function parseChatPreferences(value: string | null): ChatPreferences {
  try {
    const parsed = chatPreferencesSchema.safeParse(JSON.parse(value || "{}"));
    return parsed.success ? parsed.data : DEFAULT_CHAT_PREFERENCES;
  } catch {
    return DEFAULT_CHAT_PREFERENCES;
  }
}
