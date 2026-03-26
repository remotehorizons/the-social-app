use std::time::{SystemTime, UNIX_EPOCH};

use meshsocial_feed::{build_feed_page, FeedConfig};
use meshsocial_identity::SigningIdentity;
use meshsocial_protocol::{canonical_post_signing_bytes, validate_post_body, Follow, Post};
use meshsocial_store::{Event, SQLiteStore, StoreError};
use sha2::{Digest, Sha256};

#[derive(Debug)]
pub enum CoreError {
    Validation(String),
    Store(String),
    Time(String),
}

impl From<StoreError> for CoreError {
    fn from(err: StoreError) -> Self {
        Self::Store(err.to_string())
    }
}

pub struct Core {
    identity: SigningIdentity,
    store: SQLiteStore,
    feed_config: FeedConfig,
}

impl Default for Core {
    fn default() -> Self {
        Self::new_in_memory().expect("core should initialize in-memory sqlite")
    }
}

impl Core {
    pub fn new_in_memory() -> Result<Self, CoreError> {
        Ok(Self {
            identity: SigningIdentity::generate(),
            store: SQLiteStore::new_in_memory()?,
            feed_config: FeedConfig::default(),
        })
    }

    pub fn new_at_path(path: &str) -> Result<Self, CoreError> {
        Ok(Self {
            identity: SigningIdentity::generate(),
            store: SQLiteStore::new_at_path(path)?,
            feed_config: FeedConfig::default(),
        })
    }

    pub fn pubkey(&self) -> String {
        self.identity.public_key_hex()
    }

    pub fn follow(&self, followee_pubkey: &str) -> Result<(), CoreError> {
        let created_at_ms = now_ms()?;
        let follower_pubkey = self.identity.public_key_hex();
        let sign_bytes =
            format!("{}|{}|{}", follower_pubkey, followee_pubkey, created_at_ms).into_bytes();
        let sig_hex = self.identity.sign_message_hex(&sign_bytes);

        self.store.append_event(Event::Follow(Follow {
            follower_pubkey,
            followee_pubkey: followee_pubkey.to_string(),
            created_at_ms,
            sig_hex,
        }))?;
        Ok(())
    }

    pub fn publish_post(&self, body: &str) -> Result<String, CoreError> {
        validate_post_body(body).map_err(|e| CoreError::Validation(e.to_string()))?;

        let author_pubkey = self.identity.public_key_hex();
        let created_at_ms = now_ms()?;
        let sign_bytes = canonical_post_signing_bytes(&author_pubkey, created_at_ms, body);
        let sig_hex = self.identity.sign_message_hex(&sign_bytes);
        let id = post_id(&author_pubkey, created_at_ms, body);

        self.store.append_event(Event::Post(Post {
            id: id.clone(),
            author_pubkey,
            created_at_ms,
            body: body.to_string(),
            sig_hex,
        }))?;

        Ok(id)
    }

    pub fn get_feed(&self, page: usize) -> Result<Vec<Post>, CoreError> {
        let me = self.identity.public_key_hex();
        let following = self.store.follows_for(&me)?;
        let posts = self.store.list_posts()?;
        Ok(build_feed_page(
            &posts,
            &me,
            &following,
            page,
            self.feed_config,
        ))
    }

    pub fn insert_remote_post_for_testing(&self, post: Post) -> Result<(), CoreError> {
        self.store.append_event(Event::Post(post))?;
        Ok(())
    }
}

fn now_ms() -> Result<i64, CoreError> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| CoreError::Time(e.to_string()))?;
    Ok(duration.as_millis() as i64)
}

fn post_id(author_pubkey: &str, created_at_ms: i64, body: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(author_pubkey.as_bytes());
    hasher.update(b"|");
    hasher.update(created_at_ms.to_string().as_bytes());
    hasher.update(b"|");
    hasher.update(body.as_bytes());
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::Core;
    use meshsocial_protocol::Post;

    #[test]
    fn feed_returns_only_followed_remote_posts() {
        let core = Core::new_in_memory().unwrap();
        let remote = "peer_pubkey_1".to_string();
        core.follow(&remote).unwrap();

        core.insert_remote_post_for_testing(Post {
            id: "1".into(),
            author_pubkey: remote.clone(),
            created_at_ms: 10,
            body: "visible".into(),
            sig_hex: "sig".into(),
        })
        .unwrap();

        core.insert_remote_post_for_testing(Post {
            id: "2".into(),
            author_pubkey: "not_followed".into(),
            created_at_ms: 11,
            body: "hidden".into(),
            sig_hex: "sig".into(),
        })
        .unwrap();

        let feed = core.get_feed(0).unwrap();
        assert_eq!(feed.len(), 1);
        assert_eq!(feed[0].author_pubkey, remote);
    }
}
