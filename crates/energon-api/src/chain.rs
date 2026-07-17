use std::env;

use k256::ecdsa::{RecoveryId, Signature, VerifyingKey};
use serde::Deserialize;
use serde_json::json;
use sha3::{Digest, Keccak256};

use crate::{errors::ApiError, x402::X402Config};

const ERC20_TRANSFER_TOPIC: &str =
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

#[derive(Debug, Clone)]
pub struct BaseCheckoutConfig {
    pub network: String,
    pub chain_id: u64,
    pub asset: String,
    pub pay_to: String,
    pub rpc_url: String,
    pub explorer_base_url: String,
    client: reqwest::Client,
}

#[derive(Debug, Clone)]
pub struct VerifiedTransfer {
    pub payer: String,
}

impl BaseCheckoutConfig {
    pub fn from_env(x402: &X402Config) -> Result<Option<Self>, String> {
        let Some(pay_to) = x402.pay_to.as_deref() else {
            return Ok(None);
        };
        let Some(rpc_url) = env::var("ENERGON_BASE_RPC_URL")
            .ok()
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty())
        else {
            return Ok(None);
        };

        let network = env::var("ENERGON_BILLING_NETWORK").unwrap_or_else(|_| x402.network.clone());
        let chain_id = match network.as_str() {
            "eip155:8453" => 8453,
            "eip155:84532" => 84532,
            _ => {
                return Err(
                    "ENERGON_BILLING_NETWORK must be Base mainnet or Base Sepolia".to_owned(),
                );
            }
        };
        let asset = env::var("ENERGON_BILLING_ASSET").unwrap_or_else(|_| x402.asset.clone());

        Ok(Some(Self {
            network,
            chain_id,
            asset: normalize_address(&asset).map_err(|error| error.to_string())?,
            pay_to: normalize_address(pay_to).map_err(|error| error.to_string())?,
            rpc_url,
            explorer_base_url: if chain_id == 8453 {
                "https://basescan.org/tx/".to_owned()
            } else {
                "https://sepolia.basescan.org/tx/".to_owned()
            },
            client: reqwest::Client::new(),
        }))
    }

    pub async fn verify_usdc_transfer(
        &self,
        tx_hash: &str,
        expected_payer: &str,
        expected_amount_usdc_micro: i64,
    ) -> Result<VerifiedTransfer, ApiError> {
        if !is_hash(tx_hash) {
            return Err(ApiError::BadRequest("invalid transaction hash".to_owned()));
        }

        let chain_id = self.rpc_result("eth_chainId", json!([])).await?;
        let chain_id = chain_id.as_str().and_then(parse_hex_u64).ok_or_else(|| {
            ApiError::PaymentUnavailable("Base RPC returned an invalid chain id".to_owned())
        })?;
        if chain_id != self.chain_id {
            return Err(ApiError::PaymentUnavailable(
                "Base RPC network does not match the configured billing network".to_owned(),
            ));
        }

        let receipt = self
            .rpc_result("eth_getTransactionReceipt", json!([tx_hash]))
            .await?;
        let receipt: TransactionReceipt = serde_json::from_value(receipt).map_err(|error| {
            ApiError::PaymentUnavailable(format!("Base RPC returned an invalid receipt: {error}"))
        })?;
        if receipt.status.as_deref() != Some("0x1") {
            return Err(ApiError::BadRequest(
                "transaction is not confirmed successfully on Base yet".to_owned(),
            ));
        }

        let expected_payer = normalize_address(expected_payer)
            .map_err(|error| ApiError::BadRequest(error.to_string()))?;
        let expected_amount: u128 = expected_amount_usdc_micro
            .try_into()
            .map_err(|_| ApiError::Internal("invalid plan amount configuration".to_owned()))?;

        for log in receipt.logs {
            let Ok(asset) = normalize_address(&log.address) else {
                continue;
            };
            if asset != self.asset
                || log.topics.len() != 3
                || !log.topics[0].eq_ignore_ascii_case(ERC20_TRANSFER_TOPIC)
            {
                continue;
            }

            let Ok(payer) = address_from_topic(&log.topics[1]) else {
                continue;
            };
            let Ok(pay_to) = address_from_topic(&log.topics[2]) else {
                continue;
            };
            let Some(amount) = parse_hex_u128(&log.data) else {
                continue;
            };

            if payer == expected_payer && pay_to == self.pay_to && amount >= expected_amount {
                return Ok(VerifiedTransfer { payer });
            }
        }

        Err(ApiError::BadRequest(
            "transaction does not contain the required USDC transfer".to_owned(),
        ))
    }

    async fn rpc_result(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, ApiError> {
        let response = self
            .client
            .post(&self.rpc_url)
            .json(&json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params }))
            .send()
            .await
            .map_err(|error| {
                ApiError::PaymentUnavailable(format!("Base RPC request failed: {error}"))
            })?;
        let body: RpcResponse = response.json().await.map_err(|error| {
            ApiError::PaymentUnavailable(format!("Base RPC returned invalid JSON: {error}"))
        })?;
        if let Some(error) = body.error {
            return Err(ApiError::PaymentUnavailable(format!(
                "Base RPC error: {error}"
            )));
        }
        body.result
            .ok_or_else(|| ApiError::PaymentUnavailable("Base RPC returned no result".to_owned()))
    }
}

pub fn checkout_authorization_message(
    intent_id: &str,
    org_id: &str,
    plan_id: &str,
    amount_usdc_micro: i64,
    tx_hash: &str,
) -> String {
    format!(
        "Energon OS checkout\nintent: {intent_id}\norganization: {org_id}\nplan: {plan_id}\namount_usdc_micro: {amount_usdc_micro}\ntransaction: {tx_hash}"
    )
}

pub fn verify_wallet_signature(
    message: &str,
    signature: &str,
    expected_payer: &str,
) -> Result<(), ApiError> {
    let bytes = decode_hex(signature)
        .map_err(|error| ApiError::BadRequest(format!("invalid wallet signature: {error}")))?;
    if bytes.len() != 65 {
        return Err(ApiError::BadRequest(
            "wallet signature must be 65 bytes".to_owned(),
        ));
    }

    let recovery_byte = match bytes[64] {
        value @ 0..=3 => value,
        value @ 27..=30 => value - 27,
        _ => {
            return Err(ApiError::BadRequest(
                "wallet signature has an invalid recovery byte".to_owned(),
            ));
        }
    };
    let recovery_id = RecoveryId::from_byte(recovery_byte).ok_or_else(|| {
        ApiError::BadRequest("wallet signature has an invalid recovery id".to_owned())
    })?;
    let signature = Signature::from_slice(&bytes[..64])
        .map_err(|error| ApiError::BadRequest(format!("wallet signature is malformed: {error}")))?;
    let payload = format!("\x19Ethereum Signed Message:\n{}{}", message.len(), message);
    let key = VerifyingKey::recover_from_digest(
        Keccak256::new_with_prefix(payload.as_bytes()),
        &signature,
        recovery_id,
    )
    .map_err(|_| ApiError::BadRequest("wallet signature could not be verified".to_owned()))?;
    let encoded = key.to_encoded_point(false);
    let hash = Keccak256::digest(&encoded.as_bytes()[1..]);
    let recovered = format!("0x{}", hex_encode(&hash[12..]));
    let expected = normalize_address(expected_payer)
        .map_err(|error| ApiError::BadRequest(error.to_string()))?;
    if recovered != expected {
        return Err(ApiError::Forbidden(
            "wallet signature does not belong to the USDC payer".to_owned(),
        ));
    }

    Ok(())
}

#[derive(Debug, Deserialize)]
struct RpcResponse {
    result: Option<serde_json::Value>,
    error: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct TransactionReceipt {
    status: Option<String>,
    logs: Vec<TransferLog>,
}

#[derive(Debug, Deserialize)]
struct TransferLog {
    address: String,
    topics: Vec<String>,
    data: String,
}

fn normalize_address(value: &str) -> Result<String, &'static str> {
    let value = value.trim();
    if value.len() != 42
        || !value.starts_with("0x")
        || !value[2..].bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("address must be a 20-byte 0x-prefixed hex value");
    }
    Ok(value.to_ascii_lowercase())
}

fn address_from_topic(topic: &str) -> Result<String, &'static str> {
    if topic.len() != 66
        || !topic.starts_with("0x")
        || !topic[2..].bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("transfer topic is invalid");
    }
    normalize_address(&format!("0x{}", &topic[26..]))
}

fn is_hash(value: &str) -> bool {
    value.len() == 66
        && value.starts_with("0x")
        && value[2..].bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn parse_hex_u64(value: &str) -> Option<u64> {
    u64::from_str_radix(value.strip_prefix("0x")?, 16).ok()
}

fn parse_hex_u128(value: &str) -> Option<u128> {
    u128::from_str_radix(value.strip_prefix("0x")?, 16).ok()
}

fn decode_hex(value: &str) -> Result<Vec<u8>, &'static str> {
    let value = value.strip_prefix("0x").ok_or("missing 0x prefix")?;
    if value.len() % 2 != 0 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("invalid hex");
    }
    (0..value.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(&value[index..index + 2], 16).map_err(|_| "invalid hex"))
        .collect()
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use k256::ecdsa::SigningKey;
    use sha3::{Digest, Keccak256};

    use super::{checkout_authorization_message, hex_encode, verify_wallet_signature};

    fn eip191_digest(message: &str) -> Keccak256 {
        let payload = format!("\x19Ethereum Signed Message:\n{}{}", message.len(), message);
        Keccak256::new_with_prefix(payload.as_bytes())
    }

    fn address_for(key: &SigningKey) -> String {
        let encoded = key.verifying_key().to_encoded_point(false);
        let hash = Keccak256::digest(&encoded.as_bytes()[1..]);
        format!("0x{}", hex_encode(&hash[12..]))
    }

    #[test]
    fn checkout_signature_must_belong_to_the_transfer_payer_and_exact_intent() {
        let key = SigningKey::from_bytes((&[7_u8; 32]).into()).expect("valid test key");
        let payer = address_for(&key);
        let message = checkout_authorization_message(
            "checkout_123",
            "org_123",
            "developer",
            99_000_000,
            "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        );
        let (signature, recovery_id) = key
            .sign_digest_recoverable(eip191_digest(&message))
            .expect("test signature");
        let signature = format!(
            "0x{}{:02x}",
            hex_encode(signature.to_bytes().as_ref()),
            u8::from(recovery_id) + 27
        );

        verify_wallet_signature(&message, &signature, &payer).expect("payer should verify");

        let tampered_message = checkout_authorization_message(
            "checkout_123",
            "org_123",
            "developer",
            99_000_000,
            "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        );
        assert!(verify_wallet_signature(&tampered_message, &signature, &payer).is_err());
        assert!(
            verify_wallet_signature(
                &message,
                &signature,
                "0x1111111111111111111111111111111111111111"
            )
            .is_err()
        );
    }
}
