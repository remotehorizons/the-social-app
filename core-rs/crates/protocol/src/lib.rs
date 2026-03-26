use serde::{Deserialize, Serialize};
use thiserror::Error;

pub const MAX_POST_CHARS: usize = 280;
pub const MAX_POST_BYTES: usize = 560;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Post {
    pub id: String,
    pub author_pubkey: String,
    pub created_at_ms: i64,
    pub body: String,
    pub sig_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Follow {
    pub follower_pubkey: String,
    pub followee_pubkey: String,
    pub created_at_ms: i64,
    pub sig_hex: String,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ValidationError {
    #[error("post body cannot be empty")]
    EmptyPostBody,
    #[error("post body exceeds max chars: {0}")]
    TooManyChars(usize),
    #[error("post body exceeds max bytes: {0}")]
    TooManyBytes(usize),
}

pub fn validate_post_body(body: &str) -> Result<(), ValidationError> {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return Err(ValidationError::EmptyPostBody);
    }

    let chars = body.chars().count();
    if chars > MAX_POST_CHARS {
        return Err(ValidationError::TooManyChars(chars));
    }

    let bytes = body.len();
    if bytes > MAX_POST_BYTES {
        return Err(ValidationError::TooManyBytes(bytes));
    }

    Ok(())
}

pub fn canonical_post_signing_bytes(
    author_pubkey: &str,
    created_at_ms: i64,
    body: &str,
) -> Vec<u8> {
    format!("{}|{}|{}", author_pubkey, created_at_ms, body).into_bytes()
}

#[cfg(test)]
mod tests {
    use super::{validate_post_body, ValidationError, MAX_POST_CHARS};

    #[test]
    fn rejects_empty_body() {
        let err = validate_post_body("  ").unwrap_err();
        assert_eq!(err, ValidationError::EmptyPostBody);
    }

    #[test]
    fn rejects_over_char_limit() {
        let input = "a".repeat(MAX_POST_CHARS + 1);
        let err = validate_post_body(&input).unwrap_err();
        assert!(matches!(err, ValidationError::TooManyChars(_)));
    }

    #[test]
    fn accepts_valid_body() {
        assert!(validate_post_body("hello mesh").is_ok());
    }
}
