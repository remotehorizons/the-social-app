use std::collections::HashSet;
use std::path::Path;

use meshsocial_protocol::{Follow, Post};
use rusqlite::{params, Connection, Error as SqlError, ErrorCode};
use thiserror::Error;

#[derive(Debug, Clone)]
pub enum Event {
    Post(Post),
    Follow(Follow),
}

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("duplicate post id")]
    DuplicatePost,
    #[error("sqlite error: {0}")]
    Sqlite(#[from] SqlError),
}

pub struct SQLiteStore {
    conn: Connection,
}

impl SQLiteStore {
    pub fn new_in_memory() -> Result<Self, StoreError> {
        let conn = Connection::open_in_memory()?;
        Self::init_schema(&conn)?;
        Ok(Self { conn })
    }

    pub fn new_at_path(path: impl AsRef<Path>) -> Result<Self, StoreError> {
        let conn = Connection::open(path)?;
        Self::init_schema(&conn)?;
        Ok(Self { conn })
    }

    pub fn append_event(&self, event: Event) -> Result<(), StoreError> {
        match event {
            Event::Post(post) => {
                let insert_result = self.conn.execute(
                    "INSERT INTO posts (id, author_pubkey, created_at_ms, body, sig_hex) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![post.id, post.author_pubkey, post.created_at_ms, post.body, post.sig_hex],
                );

                match insert_result {
                    Ok(_) => Ok(()),
                    Err(err) if is_unique_violation(&err) => Err(StoreError::DuplicatePost),
                    Err(err) => Err(StoreError::Sqlite(err)),
                }
            }
            Event::Follow(follow) => {
                self.conn.execute(
                    "INSERT INTO follows (follower_pubkey, followee_pubkey, created_at_ms, sig_hex) VALUES (?1, ?2, ?3, ?4)",
                    params![follow.follower_pubkey, follow.followee_pubkey, follow.created_at_ms, follow.sig_hex],
                )?;
                Ok(())
            }
        }
    }

    pub fn list_posts(&self) -> Result<Vec<Post>, StoreError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, author_pubkey, created_at_ms, body, sig_hex FROM posts",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(Post {
                id: row.get(0)?,
                author_pubkey: row.get(1)?,
                created_at_ms: row.get(2)?,
                body: row.get(3)?,
                sig_hex: row.get(4)?,
            })
        })?;

        rows.collect::<Result<Vec<_>, _>>().map_err(StoreError::from)
    }

    pub fn follows_for(&self, follower_pubkey: &str) -> Result<HashSet<String>, StoreError> {
        let mut stmt = self.conn.prepare(
            "SELECT followee_pubkey FROM follows WHERE follower_pubkey = ?1",
        )?;

        let rows = stmt.query_map([follower_pubkey], |row| row.get::<_, String>(0))?;
        let followees = rows.collect::<Result<HashSet<_>, _>>()?;
        Ok(followees)
    }

    fn init_schema(conn: &Connection) -> Result<(), StoreError> {
        conn.execute_batch(
            "
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS posts (
                id TEXT PRIMARY KEY,
                author_pubkey TEXT NOT NULL,
                created_at_ms INTEGER NOT NULL,
                body TEXT NOT NULL,
                sig_hex TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS follows (
                follower_pubkey TEXT NOT NULL,
                followee_pubkey TEXT NOT NULL,
                created_at_ms INTEGER NOT NULL,
                sig_hex TEXT NOT NULL,
                PRIMARY KEY (follower_pubkey, followee_pubkey)
            );
            CREATE INDEX IF NOT EXISTS idx_posts_author_time
                ON posts (author_pubkey, created_at_ms DESC);
            CREATE INDEX IF NOT EXISTS idx_posts_time
                ON posts (created_at_ms DESC);
            ",
        )?;
        Ok(())
    }
}

fn is_unique_violation(err: &SqlError) -> bool {
    match err {
        SqlError::SqliteFailure(info, _) => info.code == ErrorCode::ConstraintViolation,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use meshsocial_protocol::{Follow, Post};

    use crate::{Event, SQLiteStore, StoreError};

    #[test]
    fn rejects_duplicate_post_ids() {
        let post = Post {
            id: "p1".into(),
            author_pubkey: "k1".into(),
            created_at_ms: 1,
            body: "hello".into(),
            sig_hex: "sig".into(),
        };

        let store = SQLiteStore::new_in_memory().unwrap();
        assert!(store.append_event(Event::Post(post.clone())).is_ok());

        let duplicate = store.append_event(Event::Post(post));
        assert!(matches!(duplicate, Err(StoreError::DuplicatePost)));
    }

    #[test]
    fn returns_followees_for_user() {
        let store = SQLiteStore::new_in_memory().unwrap();
        store
            .append_event(Event::Follow(Follow {
                follower_pubkey: "me".into(),
                followee_pubkey: "alice".into(),
                created_at_ms: 1,
                sig_hex: "sig".into(),
            }))
            .unwrap();

        let follows = store.follows_for("me").unwrap();
        assert!(follows.contains("alice"));
    }
}
