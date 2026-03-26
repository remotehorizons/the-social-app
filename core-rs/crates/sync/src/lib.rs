use std::collections::HashSet;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct IndexEntry {
    pub post_id: String,
    pub timestamp_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SyncPlan {
    pub missing_ids: Vec<String>,
    pub skipped_for_budget: usize,
}

pub fn plan_selective_fetch(
    local_ids: &HashSet<String>,
    remote_recent_index: &[IndexEntry],
    max_fetch: usize,
) -> SyncPlan {
    let mut missing: Vec<String> = remote_recent_index
        .iter()
        .filter(|entry| !local_ids.contains(&entry.post_id))
        .map(|entry| entry.post_id.clone())
        .collect();

    let skipped_for_budget = missing.len().saturating_sub(max_fetch);
    missing.truncate(max_fetch);

    SyncPlan {
        missing_ids: missing,
        skipped_for_budget,
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use crate::{plan_selective_fetch, IndexEntry};

    #[test]
    fn only_requests_missing_posts() {
        let local = HashSet::from(["p1".to_string()]);
        let remote = vec![
            IndexEntry {
                post_id: "p1".into(),
                timestamp_ms: 1,
            },
            IndexEntry {
                post_id: "p2".into(),
                timestamp_ms: 2,
            },
            IndexEntry {
                post_id: "p3".into(),
                timestamp_ms: 3,
            },
        ];

        let plan = plan_selective_fetch(&local, &remote, 10);
        assert_eq!(plan.missing_ids, vec!["p2".to_string(), "p3".to_string()]);
        assert_eq!(plan.skipped_for_budget, 0);
    }

    #[test]
    fn enforces_budget_cap() {
        let local = HashSet::new();
        let remote = vec![
            IndexEntry {
                post_id: "p1".into(),
                timestamp_ms: 1,
            },
            IndexEntry {
                post_id: "p2".into(),
                timestamp_ms: 2,
            },
            IndexEntry {
                post_id: "p3".into(),
                timestamp_ms: 3,
            },
        ];

        let plan = plan_selective_fetch(&local, &remote, 2);
        assert_eq!(plan.missing_ids.len(), 2);
        assert_eq!(plan.skipped_for_budget, 1);
    }
}
