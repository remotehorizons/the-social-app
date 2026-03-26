# MeshSocial Backend Implementation Plan (Text-Only P2P)

## 1. Goals
- No central timeline server.
- Text-only payloads with strict size limits.
- Feed scoped to direct follows only.
- Bandwidth-aware replication and bounded timeline reads.
- Mobile-first runtime via a shared Rust core exposed to React Native.

## 2. Backend Scope (Rust Core)
- Identity and cryptography:
  - Ed25519 key generation, signing, verification.
  - Device-scoped key storage via platform secure storage bridge.
- Local data layer:
  - Append-only event log.
  - Indexed views for posts, follows, mutes, blocks.
  - SQLite with WAL mode for durability and fast reads.
- Replication engine:
  - Peer handshake and capability exchange.
  - Pull-based sync (index first, then selective fetch).
  - Per-peer and global bandwidth budgets.
- Feed service:
  - Follow-filtered timeline query.
  - Pagination only (no infinite cursor stream).
  - Hard caps by connection and total feed size.
- Policy and moderation:
  - Local mute/block lists.
  - Signature and schema validation pipeline.

## 3. Suggested Repo Layout
```txt
/mobile                 React Native app
/core-rs
  /crates
    /identity          keys + signatures
    /protocol          schemas + wire format
    /store             sqlite + indexes
    /sync              replication + budget controls
    /feed              query + pagination
    /ffi               RN-facing API surface
/docs
  /diagrams            draw.io architecture diagrams
```

## 4. Protocol and Data Contracts
- Post:
  - id, author_pubkey, created_at, body, sig
  - body <= 280 chars (UTF-8 byte cap also enforced)
- Follow:
  - follower_pubkey, followee_pubkey, created_at, sig
- Control:
  - Mute, Block
- Sync messages:
  - Hello, RecentIndex, FetchRequest, FetchResponse, Ack, BudgetState

## 5. Implementation Phases
1. Foundation (Week 1)
- Create Rust workspace and crates.
- Add schema validation and canonical serialization.
- Implement signing and verification test vectors.

2. Local-first backend (Week 2)
- SQLite schema and migrations.
- Insert/query API for posts/follows.
- Feed query with fixed pagination and caps.

3. P2P replication (Week 3)
- Peer session manager and handshake.
- RecentIndex diff logic and missing-item fetch.
- Retry/backoff and idempotent apply.

4. Bandwidth and anti-scroll controls (Week 4)
- Token-bucket per peer and global quota.
- Daily fetch budget and explicit older-page request gate.
- Expose counters to UI.

5. Hardening (Week 5)
- Property/fuzz tests for parser and signatures.
- Crash recovery and replay checks.
- Observability counters and debug logging.

## 6. SQLite Schema (Initial)
- events(id PRIMARY KEY, author, kind, created_at, payload, sig, hash, inserted_at)
- follows(follower, followee, created_at, active, PRIMARY KEY(follower, followee))
- mutes(owner, target, created_at, PRIMARY KEY(owner, target))
- blocks(owner, target, created_at, PRIMARY KEY(owner, target))
- posts(id PRIMARY KEY, author, created_at, body, hash)
- sync_state(peer, last_index_ts, bytes_in_today, bytes_out_today, updated_at, PRIMARY KEY(peer))

## 7. API Surface to React Native (FFI)
- create_identity() -> pubkey
- publish_post(body) -> post_id
- follow(pubkey) -> ok
- mute(pubkey) -> ok
- block(pubkey) -> ok
- get_feed(page, page_size) -> Post[]
- connect_peer(invite) -> session_id
- sync_now(peer?) -> summary
- get_budget_status() -> {global, per_peer}

## 8. Non-Functional Targets
- Post publish p95: under 80ms local.
- Feed query p95: under 120ms for first page.
- Sync overhead: index exchange <= 5KB typical.
- Background battery: bounded by configurable sync window.

## 9. Risks and Mitigations
- NAT traversal complexity:
  - Start LAN + relay-assisted mode, then expand.
- Clock skew impacts ordering:
  - Tie-break with deterministic hash ordering.
- Spam from known peers:
  - Local mute/block + per-peer budget throttling.

## 10. Immediate Next Build Steps
1. Scaffold /core-rs workspace and crates.
2. Lock canonical message format (CBOR or protobuf).
3. Implement identity and store crates first.
4. Wire ffi.get_feed and ffi.publish_post into /mobile.
