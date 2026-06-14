use rand::{RngCore, rngs::OsRng};
use sha2::{Digest, Sha256};

pub fn generate_api_key() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);

    format!("eos_live_{}", hex_encode(&bytes))
}

pub fn hash_api_key(api_key: &str, pepper: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(pepper.as_bytes());
    hasher.update(b":");
    hasher.update(api_key.as_bytes());

    hex_encode(&hasher.finalize())
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut encoded = String::with_capacity(bytes.len() * 2);

    for byte in bytes {
        encoded.push(HEX[(byte >> 4) as usize] as char);
        encoded.push(HEX[(byte & 0x0f) as usize] as char);
    }

    encoded
}

#[cfg(test)]
mod tests {
    use crate::secrets::{generate_api_key, hash_api_key};

    #[test]
    fn generated_api_keys_are_prefixed_and_long() {
        let key = generate_api_key();

        assert!(key.starts_with("eos_live_"));
        assert!(key.len() > 70);
    }

    #[test]
    fn hashes_depend_on_pepper() {
        let key = "eos_live_test";

        assert_ne!(hash_api_key(key, "pepper_1"), hash_api_key(key, "pepper_2"));
    }
}
