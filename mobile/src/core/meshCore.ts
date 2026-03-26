import { NativeModules } from "react-native";
import * as SQLite from "expo-sqlite";
import { Identity, Post } from "../types";

type MeshCore = {
  bootstrap(): Promise<void>;
  getIdentity(): Promise<Identity>;
  getFeedPage(page: number, pageSize: number): Promise<Post[]>;
  publishPost(body: string): Promise<string>;
};

type NativeMeshSocialCoreModule = {
  bootstrap?(): Promise<void>;
  getIdentity?(): Promise<Identity>;
  getFeedPage?(page: number, pageSize: number): Promise<Post[]>;
  publishPost?(body: string): Promise<string>;
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
      CREATE INDEX IF NOT EXISTS idx_posts_created_at
        ON posts (created_at_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_posts_author_created_at
        ON posts (author_pubkey, created_at_ms DESC);
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

function hasNativeMeshCore(
  candidate: NativeMeshSocialCoreModule
): candidate is Required<NativeMeshSocialCoreModule> {
  return (
    typeof candidate?.bootstrap === "function" &&
    typeof candidate?.getIdentity === "function" &&
    typeof candidate?.getFeedPage === "function" &&
    typeof candidate?.publishPost === "function"
  );
}

export function createMeshCore(): MeshCore {
  const nativeModule = NativeModules.MeshSocialCore as NativeMeshSocialCoreModule;

  if (hasNativeMeshCore(nativeModule)) {
    return {
      bootstrap: () => nativeModule.bootstrap(),
      getIdentity: () => nativeModule.getIdentity(),
      getFeedPage: (page, pageSize) => nativeModule.getFeedPage(page, pageSize),
      publishPost: (body) => nativeModule.publishPost(body)
    };
  }

  return new SqliteMeshCore();
}

export type { MeshCore };
