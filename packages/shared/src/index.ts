export type UserRole = "owner" | "admin" | "supervisor" | "seller";

export type Channel = "whatsapp" | "instagram" | "messenger";

export type MessageDirection = "inbound" | "outbound";

export type MessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "interactive";

export interface NormalizedMessage {
  organizationId: string;
  channel: Channel;
  externalConversationId: string;
  externalMessageId: string;
  senderExternalId: string;
  contactExternalId: string;
  direction: MessageDirection;
  type: MessageType;
  text?: string;
  attachments?: MessageAttachment[];
  timestamp: string;
  rawPayload: unknown;
}

export interface MessageAttachment {
  url: string;
  mimeType?: string;
  fileName?: string;
  sizeBytes?: number;
}
