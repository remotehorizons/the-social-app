import { NativeModules } from "react-native";
import * as SQLite from "expo-sqlite";
import {
  ConversationPreview,
  DirectMessage,
  Identity,
  Post
} from "../types";

type MeshCore = {
  bootstrap(): Promise<void>;
  getIdentity(): Promise<Identity>;
  getFeedPage(page: number, pageSize: number): Promise<Post[]>;
  publishPost(body: string): Promise<string>;
  listConversations(): Promise<ConversationPreview[]>;
  getMessages(peerPubkey: string): Promise<DirectMessage[]>;
  sendMessage(peerPubkey: string, body: string): Promise<string>;
};

type NativeMeshSocialCoreModule = {
  bootstrap?(): Promise<void>;
  getIdentity?(): Promise<Identity>;
  getFeedPage?(page: number, pageSize: number): Promise<Post[]>;
  publishPost?(body: string): Promise<string>;
  listConversations?(): Promise<ConversationPreview[]>;
  getMessages?(peerPubkey: string): Promise<DirectMessage[]>;
  sendMessage?(peerPubkey: string, body: string): Promise<string>;
};

type ProfileRecord = Identity;

type PostRecord = {
  id: string;
  author_pubkey: string;
  display_name: string;
  handle: string;
  body: string;
  created_at_ms: number;
};

type ConversationRecord = {
  peer_pubkey: string;
  display_name: string;
  handle: string;
  last_message_body: string;
  last_message_at_ms: number;
  unread_count: number;
};

type MessageRecord = {
  id: string;
  conversation_id: string;
  sender_pubkey: string;
  recipient_pubkey: string;
  body: string;
  created_at_ms: number;
};

const DB_NAME = "meshsocial.db";

const localIdentity: Identity = {
  pubkey: "local-user-pubkey",
  handle: "@you",
  displayName: "You"
};

const seedProfiles: ProfileRecord[] = [
  localIdentity,
  { pubkey: "peer-atlas", handle: "@atlas", displayName: "Atlas" },
  { pubkey: "peer-noor", handle: "@noor", displayName: "Noor" },
  { pubkey: "peer-lin", handle: "@lin", displayName: "Lin" },
  { pubkey: "peer-rae", handle: "@rae", displayName: "Rae" }
];

const seedPosts = [
  {
    id: "seed-1",
    authorPubkey: "peer-atlas",
    body: "Moved to direct-peer sync. The feed feels quieter already.",
    createdAtMs: Date.UTC(2025, 1, 19, 8, 4)
  },
  {
    id: "seed-2",
    authorPubkey: "peer-noor",
    body: "Limited scroll beats endless pull. I know when I am done now.",
    createdAtMs: Date.UTC(2025, 1, 19, 8, 42)
  },
  {
    id: "seed-3",
    authorPubkey: "peer-lin",
    body: "Text-only packets are tiny. This is the right place to start.",
    createdAtMs: Date.UTC(2025, 1, 19, 9, 11)
  },
  {
    id: "seed-4",
    authorPubkey: "peer-rae",
    body: "Next up is signed replication. No server should own the timeline.",
    createdAtMs: Date.UTC(2025, 1, 19, 10, 25)
  }
];

const seedMessages = [
  {
    id: "msg-seed-1",
    senderPubkey: "peer-atlas",
    recipientPubkey: localIdentity.pubkey,
    body: "Testing direct messages over the local store.",
    createdAtMs: Date.UTC(2025, 1, 19, 11, 5)
  },
  {
    id: "msg-seed-2",
    senderPubkey: localIdentity.pubkey,
    recipientPubkey: "peer-atlas",
    body: "Looks good here. Next step is peer sync.",
    createdAtMs: Date.UTC(2025, 1, 19, 11, 12)
  },
  {
    id: "msg-seed-3",
    senderPubkey: "peer-noor",
    recipientPubkey: localIdentity.pubkey,
    body: "I like the hard stop after you catch up.",
    createdAtMs: Date.UTC(2025, 1, 19, 12, 1)
  }
];

class SqliteMeshCore implements MeshCore {
  private dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

  async bootstrap() {
    const db = await this.getDb();

    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS profiles (
        pubkey TEXT PRIMARY KEY NOT NULL,
        handle TEXT NOT NULL,
        display_name TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS follows (
        follower_pubkey TEXT NOT NULL,
        followee_pubkey TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        PRIMARY KEY (follower_pubkey, followee_pubkey)
      );
      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY NOT NULL,
        author_pubkey TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS direct_messages (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL,
        sender_pubkey TEXT NOT NULL,
        recipient_pubkey TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_posts_created_at
        ON posts (created_at_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_posts_author_created_at
        ON posts (author_pubkey, created_at_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation_created_at
        ON direct_messages (conversation_id, created_at_ms ASC);
      CREATE INDEX IF NOT EXISTS idx_direct_messages_created_at
        ON direct_messages (created_at_ms DESC);
    `);

    for (const profile of seedProfiles) {
      await db.runAsync(
        `INSERT OR IGNORE INTO profiles (pubkey, handle, display_name)
         VALUES (?, ?, ?)`,
        profile.pubkey,
        profile.handle,
        profile.displayName
      );
    }

    for (const profile of seedProfiles) {
      if (profile.pubkey === localIdentity.pubkey) {
        continue;
      }

      await db.runAsync(
        `INSERT OR IGNORE INTO follows (follower_pubkey, followee_pubkey, created_at_ms)
         VALUES (?, ?, ?)`,
        localIdentity.pubkey,
        profile.pubkey,
        Date.now()
      );
    }

    for (const post of seedPosts) {
      await db.runAsync(
        `INSERT OR IGNORE INTO posts (id, author_pubkey, body, created_at_ms)
         VALUES (?, ?, ?, ?)`,
        post.id,
        post.authorPubkey,
        post.body,
        post.createdAtMs
      );
    }

    for (const message of seedMessages) {
      await db.runAsync(
        `INSERT OR IGNORE INTO direct_messages
           (id, conversation_id, sender_pubkey, recipient_pubkey, body, created_at_ms)
         VALUES (?, ?, ?, ?, ?, ?)`,
        message.id,
        conversationIdFor(message.senderPubkey, message.recipientPubkey),
        message.senderPubkey,
        message.recipientPubkey,
        message.body,
        message.createdAtMs
      );
    }
  }

  async getIdentity() {
    return localIdentity;
  }

  async getFeedPage(page: number, pageSize: number) {
    const db = await this.getDb();
    const offset = page * pageSize;

    const rows = await db.getAllAsync<PostRecord>(
      `SELECT
         posts.id,
         posts.author_pubkey,
         profiles.display_name,
         profiles.handle,
         posts.body,
         posts.created_at_ms
       FROM posts
       JOIN profiles ON profiles.pubkey = posts.author_pubkey
       WHERE posts.author_pubkey = ?
         OR posts.author_pubkey IN (
           SELECT followee_pubkey
           FROM follows
           WHERE follower_pubkey = ?
         )
       ORDER BY posts.created_at_ms DESC, posts.id ASC
       LIMIT ? OFFSET ?`,
      localIdentity.pubkey,
      localIdentity.pubkey,
      pageSize,
      offset
    );

    return rows.map((row) => ({
      id: row.id,
      authorPubkey: row.author_pubkey,
      authorHandle: row.handle,
      displayName: row.display_name,
      body: row.body,
      createdAtMs: row.created_at_ms,
      createdAt: formatTimestamp(row.created_at_ms),
      isLocalAuthor: row.author_pubkey === localIdentity.pubkey
    }));
  }

  async publishPost(body: string) {
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      throw new Error("Post body cannot be empty.");
    }

    const db = await this.getDb();
    const createdAtMs = Date.now();
    const id = `local-${createdAtMs}-${Math.random().toString(36).slice(2, 8)}`;

    await db.runAsync(
      `INSERT INTO posts (id, author_pubkey, body, created_at_ms)
       VALUES (?, ?, ?, ?)`,
      id,
      localIdentity.pubkey,
      trimmedBody,
      createdAtMs
    );

    return id;
  }

  async listConversations() {
    const db = await this.getDb();
    const rows = await db.getAllAsync<ConversationRecord>(
      `SELECT
         peer.pubkey AS peer_pubkey,
         peer.display_name,
         peer.handle,
         messages.body AS last_message_body,
         messages.created_at_ms AS last_message_at_ms,
         SUM(
           CASE
             WHEN messages.recipient_pubkey = ? AND messages.sender_pubkey = peer.pubkey
               THEN 1
             ELSE 0
           END
         ) AS unread_count
       FROM direct_messages AS messages
       JOIN profiles AS peer ON peer.pubkey = CASE
         WHEN messages.sender_pubkey = ? THEN messages.recipient_pubkey
         ELSE messages.sender_pubkey
       END
       WHERE messages.id IN (
         SELECT latest.id
         FROM direct_messages AS latest
         WHERE latest.conversation_id = messages.conversation_id
         ORDER BY latest.created_at_ms DESC, latest.id DESC
         LIMIT 1
       )
       GROUP BY peer.pubkey, peer.display_name, peer.handle, messages.body, messages.created_at_ms
       ORDER BY last_message_at_ms DESC, peer.pubkey ASC`,
      localIdentity.pubkey,
      localIdentity.pubkey
    );

    return Promise.all(
      rows.map(async (row) => ({
        peerPubkey: row.peer_pubkey,
        peerHandle: row.handle,
        peerDisplayName: row.display_name,
        lastMessageBody: row.last_message_body,
        lastMessageAtMs: row.last_message_at_ms,
        lastMessageAt: formatTimestamp(row.last_message_at_ms),
        unreadCount: await this.countUnread(row.peer_pubkey)
      }))
    );
  }

  async getMessages(peerPubkey: string) {
    const db = await this.getDb();
    const rows = await db.getAllAsync<MessageRecord>(
      `SELECT
         id,
         conversation_id,
         sender_pubkey,
         recipient_pubkey,
         body,
         created_at_ms
       FROM direct_messages
       WHERE conversation_id = ?
       ORDER BY created_at_ms ASC, id ASC`,
      conversationIdFor(localIdentity.pubkey, peerPubkey)
    );

    return rows.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      senderPubkey: row.sender_pubkey,
      recipientPubkey: row.recipient_pubkey,
      body: row.body,
      createdAtMs: row.created_at_ms,
      createdAt: formatTimestamp(row.created_at_ms),
      isLocalAuthor: row.sender_pubkey === localIdentity.pubkey
    }));
  }

  async sendMessage(peerPubkey: string, body: string) {
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      throw new Error("Message body cannot be empty.");
    }

    const db = await this.getDb();
    const createdAtMs = Date.now();
    const id = `msg-${createdAtMs}-${Math.random().toString(36).slice(2, 8)}`;

    await db.runAsync(
      `INSERT INTO direct_messages
         (id, conversation_id, sender_pubkey, recipient_pubkey, body, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id,
      conversationIdFor(localIdentity.pubkey, peerPubkey),
      localIdentity.pubkey,
      peerPubkey,
      trimmedBody,
      createdAtMs
    );

    return id;
  }

  private async countUnread(peerPubkey: string) {
    const db = await this.getDb();
    const row = await db.getFirstAsync<{ unread_count: number }>(
      `SELECT COUNT(*) AS unread_count
       FROM direct_messages
       WHERE sender_pubkey = ?
         AND recipient_pubkey = ?`,
      peerPubkey,
      localIdentity.pubkey
    );

    return row?.unread_count ?? 0;
  }

  private async getDb() {
    if (!this.dbPromise) {
      this.dbPromise = SQLite.openDatabaseAsync(DB_NAME);
    }

    return this.dbPromise;
  }
}

function formatTimestamp(createdAtMs: number) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(createdAtMs));
}

function conversationIdFor(firstPubkey: string, secondPubkey: string) {
  return [firstPubkey, secondPubkey].sort().join(":");
}

function hasNativeMeshCore(
  candidate: NativeMeshSocialCoreModule
): candidate is Required<NativeMeshSocialCoreModule> {
  return (
    typeof candidate?.bootstrap === "function" &&
    typeof candidate?.getIdentity === "function" &&
    typeof candidate?.getFeedPage === "function" &&
    typeof candidate?.publishPost === "function" &&
    typeof candidate?.listConversations === "function" &&
    typeof candidate?.getMessages === "function" &&
    typeof candidate?.sendMessage === "function"
  );
}

export function createMeshCore(): MeshCore {
  const nativeModule = NativeModules.MeshSocialCore as NativeMeshSocialCoreModule;

  if (hasNativeMeshCore(nativeModule)) {
    return {
      bootstrap: () => nativeModule.bootstrap(),
      getIdentity: () => nativeModule.getIdentity(),
      getFeedPage: (page, pageSize) => nativeModule.getFeedPage(page, pageSize),
      publishPost: (body) => nativeModule.publishPost(body),
      listConversations: () => nativeModule.listConversations(),
      getMessages: (peerPubkey) => nativeModule.getMessages(peerPubkey),
      sendMessage: (peerPubkey, body) => nativeModule.sendMessage(peerPubkey, body)
    };
  }

  return new SqliteMeshCore();
}

export type { MeshCore };
