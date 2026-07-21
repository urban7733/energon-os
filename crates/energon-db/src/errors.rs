use thiserror::Error;

#[derive(Debug, Error)]
pub enum DbError {
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
    #[error("agent id is already registered to another organization: {0}")]
    AgentIdAlreadyInUse(String),
    #[error("invalid memory scope in database: {0}")]
    InvalidMemoryScope(String),
    #[error("database integer is out of range for field: {0}")]
    IntegerOutOfRange(&'static str),
}

pub fn i64_to_u128(value: i64, field: &'static str) -> Result<u128, DbError> {
    value
        .try_into()
        .map_err(|_| DbError::IntegerOutOfRange(field))
}

pub fn usize_to_i32(value: usize, field: &'static str) -> Result<i32, DbError> {
    value
        .try_into()
        .map_err(|_| DbError::IntegerOutOfRange(field))
}
