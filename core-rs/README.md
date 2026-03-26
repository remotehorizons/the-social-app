# core-rs (MeshSocial backend core)

Rust workspace scaffold for the text-only P2P backend.

## Crates
- `identity`: Ed25519 keys + sign/verify helpers
- `protocol`: data types + validation rules
- `store`: SQLite-backed event store and indexes
- `feed`: follow-only paginated feed logic
- `sync`: selective fetch planning with budget caps
- `ffi`: starter backend API surface for mobile bridge

## Install Rust (macOS)
Use rustup:
- `brew install rustup-init`
- `rustup-init`
- restart terminal

## Run checks
- `cd /Users/harrywaine/Documents/new-project/core-rs`
- `cargo test`
- `cargo fmt --all`
- `cargo clippy --workspace --all-targets`

## SQLite behavior
- Uses `rusqlite` with bundled SQLite.
- Initializes schema automatically on first open.
- Supports both in-memory and file-based stores via:
  - `SQLiteStore::new_in_memory()`
  - `SQLiteStore::new_at_path(...)`

## FFI/Core constructors
- `Core::new_in_memory()` for tests/dev.
- `Core::new_at_path("/path/to/meshsocial.db")` for persistent local storage.
