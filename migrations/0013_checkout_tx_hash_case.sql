-- Ethereum transaction hashes are case-insensitive hex. The original UNIQUE
-- constraint compared them byte-for-byte, so `0xAB..` and `0xab..` counted as
-- different payments and one transfer could unlock several checkouts. The API
-- now stores lowercase hashes; this index enforces it for every writer.
UPDATE billing_checkout_intents
SET tx_hash = lower(tx_hash)
WHERE tx_hash IS NOT NULL AND tx_hash <> lower(tx_hash);

CREATE UNIQUE INDEX IF NOT EXISTS billing_checkout_intents_tx_hash_lower_idx
    ON billing_checkout_intents (lower(tx_hash))
    WHERE tx_hash IS NOT NULL;
