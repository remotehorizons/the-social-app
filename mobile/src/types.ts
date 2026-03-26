export type Post = {
  id: string;
  authorPubkey: string;
  authorHandle: string;
  displayName: string;
  body: string;
  createdAtMs: number;
  createdAt: string;
  isLocalAuthor: boolean;
};

export type Identity = {
  pubkey: string;
  handle: string;
  displayName: string;
};

export type ConversationPreview = {
  peerPubkey: string;
  peerHandle: string;
  peerDisplayName: string;
  lastMessageBody: string;
  lastMessageAtMs: number;
  lastMessageAt: string;
  unreadCount: number;
};

export type DirectMessage = {
  id: string;
  conversationId: string;
  senderPubkey: string;
  recipientPubkey: string;
  body: string;
  createdAtMs: number;
  createdAt: string;
  isLocalAuthor: boolean;
};
