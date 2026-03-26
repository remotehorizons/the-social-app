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
