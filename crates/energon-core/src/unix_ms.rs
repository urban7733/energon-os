//! Millisecond timestamps are `u128` in memory but always fit in a `u64`.
//! Deserializing them as `u64` keeps records loadable through
//! `#[serde(flatten)]`, whose internal buffer cannot hold 128-bit integers
//! (dream documents stored as JSONB failed to load otherwise).

use serde::{Deserialize, Deserializer};

pub fn deserialize<'de, D>(deserializer: D) -> Result<u128, D::Error>
where
    D: Deserializer<'de>,
{
    u64::deserialize(deserializer).map(u128::from)
}
