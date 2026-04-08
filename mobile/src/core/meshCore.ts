import { NativeModules } from "react-native";
import * as SQLite from "expo-sqlite";
import {
  AppStats,
  ConversationPreview,
  DirectMessage,
  Identity,
  NetworkPeer,
  Post
} from "../types";

type MeshCore = {
  bootstrap(): Promise<void>;
  getIdentity(): Promise<Identity>;
  updateProfile(displayName: string, bio: string): Promise<Identity>;
  getAppStats(): Promise<AppStats>;
  getFeedPage(page: number, pageSize: number): Promise<Post[]>;
  publishPost(body: string): Promise<string>;
  listPeers(): Promise<NetworkPeer[]>;
  followPeer(peerPubkey: string): Promise<void>;
  unfollowPeer(peerPubkey: string): Promise<void>;
  listConversations(): Promise<ConversationPreview[]>;
  getMessages(peerPubkey: string): Promise<DirectMessage[]>;
  markConversationRead(peerPubkey: string): Promise<void>;
  sendMessage(peerPubkey: string, body: string): Promise<string>;
};

type NativeMeshSocialCoreModule = {
  bootstrap?(): Promise<void>;
  getIdentity?(): Promise<Identity>;
  updateProfile?(displayName: string, bio: string): Promise<Identity>;
  getAppStats?(): Promise<AppStats>;
  getFeedPage?(page: number, pageSize: number): Promise<Post[]>;
  publishPost?(body: string): Promise<string>;
  listPeers?(): Promise<NetworkPeer[]>;
  followPeer?(peerPubkey: string): Promise<void>;
  unfollowPeer?(peerPubkey: string): Promise<void>;
  listConversations?(): Promise<ConversationPreview[]>;
  getMessages?(peerPubkey: string): Promise<DirectMessage[]>;
  markConversationRead?(peerPubkey: string): Promise<void>;
  sendMessage?(peerPubkey: string, body: string): Promise<string>;
};

type ProfileRecord = {
  pubkey: string;
  handle: string;
  display_name: string;
  bio: string | null;
};

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

type PeerRecord = {
  pubkey: string;
  handle: string;
  display_name: string;
  bio: string | null;
  is_following: number;
  post_count: number;
  last_post_at_ms: number | null;
};

const DB_NAME = "meshsocial.db";

const localIdentity: Identity = {
  pubkey: "local-user-pubkey",
  handle: "@you",
  displayName: "You",
  bio: "Building a calmer peer-to-peer social graph."
};

const defaultFriendIdentity: Identity = {
  pubkey: "peer-blue-penguin",
  handle: "@bluepenguin",
  displayName: "Blue Penguin",
  bio: "Default friend helping new installs feel alive."
};

const seedProfiles: Identity[] = [
  localIdentity,
  defaultFriendIdentity,
  {
    pubkey: "peer-atlas",
    handle: "@atlas",
    displayName: "Atlas",
    bio: "Quiet builder shipping local-first systems."
  },
  {
    pubkey: "peer-noor",
    handle: "@noor",
    displayName: "Noor",
    bio: "Writes short updates and disappears back into deep work."
  },
  {
    pubkey: "peer-lin",
    handle: "@lin",
    displayName: "Lin",
    bio: "Testing tiny packets, strict budgets, and humane UX."
  },
  {
    pubkey: "peer-rae",
    handle: "@rae",
    displayName: "Rae",
    bio: "Interested in trust, moderation, and community rituals."
  }
];

const defaultFollowPubkeys = [
  defaultFriendIdentity.pubkey,
  "peer-atlas"
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
  },
  {
    id: "seed-5",
    authorPubkey: defaultFriendIdentity.pubkey,
    body: "I am your starter connection. Follow more peers when you want a wider circle.",
    createdAtMs: Date.UTC(2025, 1, 19, 10, 43)
  }
];

const seedMessages = [
  {
    id: "msg-seed-1",
    senderPubkey: "peer-atlas",
    recipientPubkey: localIdentity.pubkey,
    body: "Testing direct messages over the local store.",
    createdAtMs: Date.UTC(2025, 1, 19, 11, 5),
    readAtMs: Date.UTC(2025, 1, 19, 11, 7)
  },
  {
    id: "msg-seed-2",
    senderPubkey: localIdentity.pubkey,
    recipientPubkey: "peer-atlas",
    body: "Looks good here. Next step is peer sync.",
    createdAtMs: Date.UTC(2025, 1, 19, 11, 12),
    readAtMs: Date.UTC(2025, 1, 19, 11, 12)
  },
  {
    id: "msg-seed-3",
    senderPubkey: "peer-noor",
    recipientPubkey: localIdentity.pubkey,
    body: "I like the hard stop after you catch up.",
    createdAtMs: Date.UTC(2025, 1, 19, 12, 1),
    readAtMs: null
  },
  {
    id: "msg-seed-4",
    senderPubkey: defaultFriendIdentity.pubkey,
    recipientPubkey: localIdentity.pubkey,
    body: "Welcome in. Tight circles make introductions matter again.",
    createdAtMs: Date.UTC(2025, 1, 19, 12, 8),
    readAtMs: null
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
        display_name TEXT NOT NULL,
        bio TEXT NOT NULL DEFAULT ''
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
        created_at_ms INTEGER NOT NULL,
        read_at_ms INTEGER
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

    await ensureColumn(db, "profiles", "bio", "TEXT NOT NULL DEFAULT ''");
    await ensureColumn(db, "direct_messages", "read_at_ms", "INTEGER");

    for (const profile of seedProfiles) {
      await db.runAsync(
        `INSERT OR IGNORE INTO profiles (pubkey, handle, display_name, bio)
         VALUES (?, ?, ?, ?)`,
        profile.pubkey,
        profile.handle,
        profile.displayName,
        profile.bio
      );
    }

    for (const followeePubkey of defaultFollowPubkeys) {
      await db.runAsync(
        `INSERT OR IGNORE INTO follows (follower_pubkey, followee_pubkey, created_at_ms)
         VALUES (?, ?, ?)`,
        localIdentity.pubkey,
        followeePubkey,
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
           (id, conversation_id, sender_pubkey, recipient_pubkey, body, created_at_ms, read_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        message.id,
        conversationIdFor(message.senderPubkey, message.recipientPubkey),
        message.senderPubkey,
        message.recipientPubkey,
        message.body,
        message.createdAtMs,
        message.readAtMs
      );
    }
  }

  async getIdentity() {
    const db = await this.getDb();
    const row = await db.getFirstAsync<ProfileRecord>(
      `SELECT pubkey, handle, display_name, bio
       FROM profiles
       WHERE pubkey = ?`,
      localIdentity.pubkey
    );

    return mapIdentity(row);
  }

  async updateProfile(displayName: string, bio: string) {
    const nextDisplayName = displayName.trim();
    const nextBio = bio.trim();

    if (!nextDisplayName) {
      throw new Error("Display name cannot be empty.");
    }

    const db = await this.getDb();
    await db.runAsync(
      `UPDATE profiles
       SET display_name = ?, bio = ?
       WHERE pubkey = ?`,
      nextDisplayName,
      nextBio,
      localIdentity.pubkey
    );

    return this.getIdentity();
  }

  async getAppStats() {
    const db = await this.getDb();
    const [localPostsRow, followingRow, conversationsRow, unreadRow] = await Promise.all([
      db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) AS count
         FROM posts
         WHERE author_pubkey = ?`,
        localIdentity.pubkey
      ),
      db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) AS count
         FROM follows
         WHERE follower_pubkey = ?`,
        localIdentity.pubkey
      ),
      db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(DISTINCT conversation_id) AS count
         FROM direct_messages`
      ),
      db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) AS count
         FROM direct_messages
         WHERE recipient_pubkey = ?
           AND read_at_ms IS NULL`,
        localIdentity.pubkey
      )
    ]);

    return {
      localPostCount: localPostsRow?.count ?? 0,
      followingCount: followingRow?.count ?? 0,
      conversationCount: conversationsRow?.count ?? 0,
      unreadCount: unreadRow?.count ?? 0
    };
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

  async listPeers() {
    const db = await this.getDb();
    const rows = await db.getAllAsync<PeerRecord>(
      `SELECT
         profiles.pubkey,
         profiles.handle,
         profiles.display_name,
         profiles.bio,
         CASE
           WHEN follows.followee_pubkey IS NULL THEN 0
           ELSE 1
         END AS is_following,
         COUNT(posts.id) AS post_count,
         MAX(posts.created_at_ms) AS last_post_at_ms
       FROM profiles
       LEFT JOIN follows
         ON follows.followee_pubkey = profiles.pubkey
         AND follows.follower_pubkey = ?
       LEFT JOIN posts
         ON posts.author_pubkey = profiles.pubkey
       GROUP BY
         profiles.pubkey,
         profiles.handle,
         profiles.display_name,
         profiles.bio,
         is_following
       ORDER BY
         CASE WHEN profiles.pubkey = ? THEN 0 ELSE 1 END,
         is_following DESC,
         post_count DESC,
         profiles.display_name COLLATE NOCASE ASC`,
      localIdentity.pubkey,
      localIdentity.pubkey
    );

    return rows.map((row) => ({
      pubkey: row.pubkey,
      handle: row.handle,
      displayName: row.display_name,
      bio: row.bio ?? "",
      isSelf: row.pubkey === localIdentity.pubkey,
      isFollowing: row.is_following === 1,
      postCount: row.post_count,
      lastPostAtMs: row.last_post_at_ms,
      lastPostAt: row.last_post_at_ms ? formatTimestamp(row.last_post_at_ms) : null
    }));
  }

  async followPeer(peerPubkey: string) {
    if (peerPubkey === localIdentity.pubkey) {
      return;
    }

    const db = await this.getDb();
    await db.runAsync(
      `INSERT OR IGNORE INTO follows (follower_pubkey, followee_pubkey, created_at_ms)
       VALUES (?, ?, ?)`,
      localIdentity.pubkey,
      peerPubkey,
      Date.now()
    );
  }

  async unfollowPeer(peerPubkey: string) {
    const db = await this.getDb();
    await db.runAsync(
      `DELETE FROM follows
       WHERE follower_pubkey = ?
         AND followee_pubkey = ?`,
      localIdentity.pubkey,
      peerPubkey
    );
  }

  async listConversations() {
    const db = await this.getDb();
    const rows = await db.getAllAsync<ConversationRecord>(
      `SELECT
         peer.pubkey AS peer_pubkey,
         peer.display_name,
         peer.handle,
         latest.body AS last_message_body,
         latest.created_at_ms AS last_message_at_ms,
         SUM(
           CASE
             WHEN messages.recipient_pubkey = ?
               AND messages.sender_pubkey = peer.pubkey
               AND messages.read_at_ms IS NULL
               THEN 1
             ELSE 0
           END
         ) AS unread_count
       FROM direct_messages AS messages
       JOIN profiles AS peer ON peer.pubkey = CASE
         WHEN messages.sender_pubkey = ? THEN messages.recipient_pubkey
         ELSE messages.sender_pubkey
       END
       JOIN direct_messages AS latest
         ON latest.id = (
           SELECT direct_messages.id
           FROM direct_messages
           WHERE direct_messages.conversation_id = messages.conversation_id
           ORDER BY direct_messages.created_at_ms DESC, direct_messages.id DESC
           LIMIT 1
         )
       GROUP BY
         peer.pubkey,
         peer.display_name,
         peer.handle,
         latest.body,
         latest.created_at_ms
       ORDER BY last_message_at_ms DESC, peer.pubkey ASC`,
      localIdentity.pubkey,
      localIdentity.pubkey
    );

    return rows.map((row) => ({
      peerPubkey: row.peer_pubkey,
      peerHandle: row.handle,
      peerDisplayName: row.display_name,
      lastMessageBody: row.last_message_body,
      lastMessageAtMs: row.last_message_at_ms,
      lastMessageAt: formatTimestamp(row.last_message_at_ms),
      unreadCount: row.unread_count
    }));
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

  async markConversationRead(peerPubkey: string) {
    const db = await this.getDb();
    await db.runAsync(
      `UPDATE direct_messages
       SET read_at_ms = COALESCE(read_at_ms, ?)
       WHERE conversation_id = ?
         AND recipient_pubkey = ?
         AND sender_pubkey = ?
         AND read_at_ms IS NULL`,
      Date.now(),
      conversationIdFor(localIdentity.pubkey, peerPubkey),
      localIdentity.pubkey,
      peerPubkey
    );
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
         (id, conversation_id, sender_pubkey, recipient_pubkey, body, created_at_ms, read_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      conversationIdFor(localIdentity.pubkey, peerPubkey),
      localIdentity.pubkey,
      peerPubkey,
      trimmedBody,
      createdAtMs,
      createdAtMs
    );

    return id;
  }

  private async getDb() {
    if (!this.dbPromise) {
      this.dbPromise = SQLite.openDatabaseAsync(DB_NAME);
    }

    return this.dbPromise;
  }
}

async function ensureColumn(
  db: SQLite.SQLiteDatabase,
  tableName: string,
  columnName: string,
  definition: string
) {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
  const hasColumn = rows.some((row) => row.name === columnName);

  if (!hasColumn) {
    await db.execAsync(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function mapIdentity(row?: ProfileRecord | null): Identity {
  if (!row) {
    return localIdentity;
  }

  return {
    pubkey: row.pubkey,
    handle: row.handle,
    displayName: row.display_name,
    bio: row.bio ?? ""
  };
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
    typeof candidate?.updateProfile === "function" &&
    typeof candidate?.getAppStats === "function" &&
    typeof candidate?.getFeedPage === "function" &&
    typeof candidate?.publishPost === "function" &&
    typeof candidate?.listPeers === "function" &&
    typeof candidate?.followPeer === "function" &&
    typeof candidate?.unfollowPeer === "function" &&
    typeof candidate?.listConversations === "function" &&
    typeof candidate?.getMessages === "function" &&
    typeof candidate?.markConversationRead === "function" &&
    typeof candidate?.sendMessage === "function"
  );
}

export function createMeshCore(): MeshCore {
  const nativeModule = NativeModules.MeshSocialCore as NativeMeshSocialCoreModule;

  if (hasNativeMeshCore(nativeModule)) {
    return {
      bootstrap: () => nativeModule.bootstrap(),
      getIdentity: () => nativeModule.getIdentity(),
      updateProfile: (displayName, bio) => nativeModule.updateProfile(displayName, bio),
      getAppStats: () => nativeModule.getAppStats(),
      getFeedPage: (page, pageSize) => nativeModule.getFeedPage(page, pageSize),
      publishPost: (body) => nativeModule.publishPost(body),
      listPeers: () => nativeModule.listPeers(),
      followPeer: (peerPubkey) => nativeModule.followPeer(peerPubkey),
      unfollowPeer: (peerPubkey) => nativeModule.unfollowPeer(peerPubkey),
      listConversations: () => nativeModule.listConversations(),
      getMessages: (peerPubkey) => nativeModule.getMessages(peerPubkey),
      markConversationRead: (peerPubkey) => nativeModule.markConversationRead(peerPubkey),
      sendMessage: (peerPubkey, body) => nativeModule.sendMessage(peerPubkey, body)
    };
  }

  return new SqliteMeshCore();
}

export type { MeshCore };
