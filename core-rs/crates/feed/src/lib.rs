use std::collections::HashSet;

use meshsocial_protocol::Post;

#[derive(Debug, Clone, Copy)]
pub struct FeedConfig {
    pub page_size: usize,
    pub max_items: usize,
}

impl Default for FeedConfig {
    fn default() -> Self {
        Self {
            page_size: 20,
            max_items: 100,
        }
    }
}

pub fn build_feed_page(
    posts: &[Post],
    viewer_pubkey: &str,
    following: &HashSet<String>,
    page: usize,
    config: FeedConfig,
) -> Vec<Post> {
    let mut filtered: Vec<Post> = posts
        .iter()
        .filter(|post| {
            post.author_pubkey == viewer_pubkey || following.contains(&post.author_pubkey)
        })
        .cloned()
        .collect();

    filtered.sort_by(|a, b| {
        b.created_at_ms
            .cmp(&a.created_at_ms)
            .then_with(|| a.id.cmp(&b.id))
    });

    let bounded = filtered.into_iter().take(config.max_items);
    let start = page.saturating_mul(config.page_size);

    bounded.skip(start).take(config.page_size).collect()
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use meshsocial_protocol::Post;

    use crate::{build_feed_page, FeedConfig};

    #[test]
    fn feed_only_contains_followed_authors() {
        let posts = vec![
            Post {
                id: "a".into(),
                author_pubkey: "k1".into(),
                created_at_ms: 1,
                body: "x".into(),
                sig_hex: "s".into(),
            },
            Post {
                id: "b".into(),
                author_pubkey: "k2".into(),
                created_at_ms: 2,
                body: "y".into(),
                sig_hex: "s".into(),
            },
        ];
        let following = HashSet::from(["k2".to_string()]);
        let page = build_feed_page(
            &posts,
            "viewer",
            &following,
            0,
            FeedConfig {
                page_size: 10,
                max_items: 10,
            },
        );

        assert_eq!(page.len(), 1);
        assert_eq!(page[0].author_pubkey, "k2");
    }

    #[test]
    fn feed_is_paginated() {
        let posts: Vec<Post> = (0..30)
            .map(|n| Post {
                id: format!("{n}"),
                author_pubkey: "k1".into(),
                created_at_ms: n,
                body: "z".into(),
                sig_hex: "s".into(),
            })
            .collect();

        let following = HashSet::from(["k1".to_string()]);
        let first = build_feed_page(
            &posts,
            "viewer",
            &following,
            0,
            FeedConfig {
                page_size: 10,
                max_items: 100,
            },
        );
        let second = build_feed_page(
            &posts,
            "viewer",
            &following,
            1,
            FeedConfig {
                page_size: 10,
                max_items: 100,
            },
        );

        assert_eq!(first.len(), 10);
        assert_eq!(second.len(), 10);
        assert_ne!(first[0].id, second[0].id);
    }

    #[test]
    fn feed_includes_local_author_posts() {
        let posts = vec![
            Post {
                id: "self-post".into(),
                author_pubkey: "viewer".into(),
                created_at_ms: 3,
                body: "mine".into(),
                sig_hex: "s".into(),
            },
            Post {
                id: "remote-post".into(),
                author_pubkey: "not-followed".into(),
                created_at_ms: 2,
                body: "hidden".into(),
                sig_hex: "s".into(),
            },
        ];
        let following = HashSet::new();

        let page = build_feed_page(
            &posts,
            "viewer",
            &following,
            0,
            FeedConfig {
                page_size: 10,
                max_items: 10,
            },
        );

        assert_eq!(page.len(), 1);
        assert_eq!(page[0].id, "self-post");
    }
}
