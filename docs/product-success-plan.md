# MeshSocial Product Success Plan

## Current repo assessment

The repo has a clear thesis: smaller graphs, direct peers, explicit stopping points, and local-first storage. That thesis is differentiated, but the product was still behaving like a technical demo:

- seeded content hid the real activation problem
- every install effectively started with a fake social graph
- profiles were static, so users had no way to present identity
- follows were not manageable in the app, so users could not shape relevance
- unread counts never cleared, which breaks trust in messaging

## Success strategy

MeshSocial should not chase generic growth tactics. The product can win by being the place for intentional, low-noise relationships.

The near-term loop is:

1. A new user understands the value in under a minute.
2. They set a profile that signals why they are worth following.
3. They follow a small number of relevant peers.
4. They publish a short useful post.
5. They get a direct reply or start a DM thread.
6. The app shows clear completion instead of endless scrolling.

## What was implemented

### Activation and trust

- added a first-session checklist in the feed
- added top-line product metrics for posts, follows, threads, and unread messages
- reduced default follows to a starter circle instead of auto-following everyone

### Identity and graph control

- added editable profile name and bio
- added a dedicated network tab
- added suggested connections and follow/unfollow controls
- added peer metadata so people can judge who to follow

### Messaging quality

- added read-state tracking for direct messages
- added explicit mark-as-read behavior when opening a conversation
- fixed unread counts so they reflect actual unread messages

## Next high-leverage steps

1. Replace seeded peers with invite-based peer import so the graph becomes real.
2. Add profile sharing or invite codes so users can grow trusted circles.
3. Add notifications for new direct replies and followed-peer posts.
4. Add mute/block controls before opening the graph further.
5. Wire the Rust core into the mobile experience so these flows survive beyond the local demo path.

## One-week market sprint

If the goal is shipping in one week, the top three missing pieces were:

1. Trust controls so users can shape noise and defend their graph.
2. A first-contact flow so followed peers can become real conversations fast.
3. An onboarding surface that turns the product thesis into concrete actions.

This pass implemented all three in the mobile app:

- mute and block controls now exist in the network view and affect feed/message visibility
- followed peers can now be messaged before a thread exists, with first-contact prompts
- the feed now includes a launch-readiness checklist with action-oriented tasks
