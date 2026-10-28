export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
};
export type Conversation = {
  id: string;
  kind: "direct" | "group";
  title: string | null;
  avatar_path: string | null;
  created_at: string;
};
export type Member = {
  conversation_id: string;
  user_id: string;
  role: "owner" | "member";
  last_read_at: string;
};
export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  reply_to: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};
export type Attachment = {
  id: string;
  conversation_id: string;
  message_id: string | null;
  uploader_id: string;
  path: string;
  name: string;
  mime_type: string;
  size: number;
};

export type ConversationPreference = {
  user_id: string;
  conversation_id: string;
  pinned: boolean;
  folder: string | null;
};

export type MessageReaction = {
  message_id: string;
  conversation_id: string;
  user_id: string;
  emoji: string;
};
