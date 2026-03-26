use meshsocial_ffi::Core;
use meshsocial_protocol::Post;
use tempfile::tempdir;

#[test]
fn sqlite_core_persists_and_returns_local_posts_in_feed() {
    let temp_dir = tempdir().unwrap();
    let db_path = temp_dir.path().join("meshsocial.db");
    let core = Core::new_at_path(db_path.to_str().unwrap()).unwrap();

    let post_id = core.publish_post("local sqlite post").unwrap();
    let feed = core.get_feed(0).unwrap();

    assert_eq!(feed.len(), 1);
    assert_eq!(feed[0].id, post_id);
    assert_eq!(feed[0].body, "local sqlite post");
    assert_eq!(feed[0].author_pubkey, core.pubkey());
}

#[test]
fn sqlite_core_includes_followed_remote_posts_only() {
    let temp_dir = tempdir().unwrap();
    let db_path = temp_dir.path().join("meshsocial.db");
    let core = Core::new_at_path(db_path.to_str().unwrap()).unwrap();

    core.follow("followed-peer").unwrap();
    core.insert_remote_post_for_testing(Post {
        id: "remote-visible".into(),
        author_pubkey: "followed-peer".into(),
        created_at_ms: 10,
        body: "visible post".into(),
        sig_hex: "sig".into(),
    })
    .unwrap();
    core.insert_remote_post_for_testing(Post {
        id: "remote-hidden".into(),
        author_pubkey: "stranger-peer".into(),
        created_at_ms: 11,
        body: "hidden post".into(),
        sig_hex: "sig".into(),
    })
    .unwrap();

    let feed = core.get_feed(0).unwrap();

    assert_eq!(feed.len(), 1);
    assert_eq!(feed[0].id, "remote-visible");
    assert_eq!(feed[0].body, "visible post");
}
