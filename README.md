# MeshSocial (Text-Only MVP)

A peer-to-peer social network with:
- no central timeline server
- text-only posts (small payloads)
- feed limited to direct connections (friends/follows)
- controlled scrolling and bandwidth budget

Repository:
- GitHub: `remotehorizons/the-social-app`

## 1) Core Product Rules

1. Text only
- Posts are UTF-8 text with strict size limit (for example: 280 chars).
- No images/video/attachments in MVP.

2. Connection-only feed
- You only receive posts from keys you explicitly follow.
- No global discovery feed.

3. Bounded timeline
- Show only the latest `N` posts per connection (for example `N=20`).
- Infinite scroll disabled.
- "Load older" is explicit and rate-limited.

4. Bandwidth budget
- App enforces per-peer and global daily budget.
- Gossip sync only exchanges missing post IDs first, then fetches selected posts.

## 2) Network Model

Use a P2P overlay with local-first data:
- Identity: Ed25519 keypair per user.
- Transport: libp2p (QUIC/WebRTC where available).
- Storage: local append-only log.
- Replication: pull-based from followed peers.

No central content host is required. Optional bootstrap relays can help peers discover each other, but they do not own timeline state.

## 3) Data Structures (minimal)

```txt
User
- pubkey
- profile_name
- bio (short text)

Post
- id = hash(author_pubkey + timestamp + body)
- author_pubkey
- timestamp
- body (<= 280 chars)
- sig

Follow
- follower_pubkey
- followee_pubkey
- sig
```

Validation:
- Reject unsigned/invalid signatures.
- Reject posts over size limit.
- Reject posts from non-followed users (unless explicitly viewing profile).

## 4) Feed Algorithm (bandwidth-first)

1. Keep `following_set` locally.
2. For each followed peer, request only a compact index:
- list of `(post_id, timestamp)` for recent posts.
3. Compare with local IDs.
4. Fetch only missing post bodies, capped by budget.
5. Merge + sort by timestamp.
6. Render max `FEED_MAX_ITEMS` (example: 100).

## 5) Anti-Scroll / Calm UX

- Home feed is paged, not infinite.
- Daily read cap (optional): example 300 posts/day.
- "You are caught up" hard stop.
- Compose-first UX: posting is always one tap away.

## 6) MVP Build Plan (4 phases)

Phase 1: Local app (no network)
- CLI or simple web app.
- Local identity + post + follow model.
- Feed filtered by follows.

Phase 2: Direct P2P sync
- Peer connection by invite code.
- Exchange recent post IDs and pull missing posts.

Phase 3: Budget controls
- Per-peer rate limit.
- Global bandwidth cap.
- Explicit older-page fetch.

Phase 4: Reliability
- Offline queue.
- Conflict handling (same timestamp tie-break by hash).
- Basic moderation controls (mute/block).

## 7) Suggested Tech Stack

- Runtime: Node.js + TypeScript
- P2P: libp2p
- Crypto: @noble/ed25519
- Local DB: SQLite (better-sqlite3) or LevelDB
- UI (optional later): React Native or web

## 8) What to Build First (this week)

1. Define exact JSON schemas for User/Post/Follow.
2. Implement signature + verification.
3. Build local feed logic with follow filter and pagination.
4. Add simple two-peer sync over local network.

---

If you want, next step I can scaffold a runnable TypeScript CLI MVP in this repo with:
- key generation
- `post` command
- `follow` command
- local feed command with hard caps
- basic two-node sync.

## React Native Starter (retro grayscale)

A text-first mobile starter now exists at:
- `mobile/App.tsx`
- `mobile/src/theme.ts`
- `mobile/src/components/PostCard.tsx`
- `mobile/src/core/meshCore.ts`

### Run

1. `cd mobile`
2. `npm install`
3. `npm run start`
4. Press `i` for iOS simulator or `a` for Android emulator

### Current behavior

- Compose and post local text updates (280-char limit)
- Retro grayscale timeline style
- Persistent SQLite-backed local timeline
- Feed includes your own posts plus directly followed peers
- Explicit paging (`LOAD OLDER`) instead of infinite scroll

### Backend integration status

- The mobile app now reads and writes through `mobile/src/core/meshCore.ts`.
- In Expo/JS runtime, it uses a SQLite adapter so the app is persistent and no longer depends on mock data.
- If a native module named `MeshSocialCore` is present later, the same app interface will switch to the Rust core path.

## Testing

Mobile app:
- `cd mobile`
- `npm test`
- `npm run typecheck`

Rust backend:
- `cd core-rs`
- `cargo test`
