use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand::rngs::OsRng;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum IdentityError {
    #[error("invalid public key encoding")]
    InvalidPublicKey,
    #[error("invalid signature encoding")]
    InvalidSignatureEncoding,
    #[error("signature verification failed")]
    VerificationFailed,
}

pub struct SigningIdentity {
    signing_key: SigningKey,
}

impl SigningIdentity {
    pub fn generate() -> Self {
        let mut rng = OsRng;
        let signing_key = SigningKey::generate(&mut rng);
        Self { signing_key }
    }

    pub fn from_seed32(seed: [u8; 32]) -> Self {
        Self {
            signing_key: SigningKey::from_bytes(&seed),
        }
    }

    pub fn public_key_hex(&self) -> String {
        hex::encode(self.signing_key.verifying_key().to_bytes())
    }

    pub fn sign_message_hex(&self, message: &[u8]) -> String {
        let sig = self.signing_key.sign(message);
        hex::encode(sig.to_bytes())
    }
}

pub fn verify_message_hex(
    public_key_hex: &str,
    message: &[u8],
    signature_hex: &str,
) -> Result<(), IdentityError> {
    let pk_bytes = hex::decode(public_key_hex).map_err(|_| IdentityError::InvalidPublicKey)?;
    let sig_bytes =
        hex::decode(signature_hex).map_err(|_| IdentityError::InvalidSignatureEncoding)?;

    let pk_array: [u8; 32] = pk_bytes
        .as_slice()
        .try_into()
        .map_err(|_| IdentityError::InvalidPublicKey)?;
    let sig_array: [u8; 64] = sig_bytes
        .as_slice()
        .try_into()
        .map_err(|_| IdentityError::InvalidSignatureEncoding)?;

    let verifying_key =
        VerifyingKey::from_bytes(&pk_array).map_err(|_| IdentityError::InvalidPublicKey)?;
    let signature = Signature::from_bytes(&sig_array);

    verifying_key
        .verify(message, &signature)
        .map_err(|_| IdentityError::VerificationFailed)
}

#[cfg(test)]
mod tests {
    use super::{verify_message_hex, SigningIdentity};

    #[test]
    fn sign_and_verify_roundtrip() {
        let identity = SigningIdentity::from_seed32([7u8; 32]);
        let msg = b"mesh social test payload";
        let sig = identity.sign_message_hex(msg);
        let pubkey = identity.public_key_hex();

        let result = verify_message_hex(&pubkey, msg, &sig);
        assert!(result.is_ok());
    }

    #[test]
    fn verify_rejects_tampered_payload() {
        let identity = SigningIdentity::from_seed32([9u8; 32]);
        let sig = identity.sign_message_hex(b"original");
        let pubkey = identity.public_key_hex();

        let result = verify_message_hex(&pubkey, b"tampered", &sig);
        assert!(result.is_err());
    }
}
