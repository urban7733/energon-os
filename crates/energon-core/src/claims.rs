#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClaimDecision {
    Accepted,
    Contested,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClaimResolution {
    SameValue,
    NewClaimWins,
    Contested,
}

/// A semantic claim is only promoted automatically when its server-derived
/// authority and agent-supplied confidence exceed the incumbent by 10%.
/// Narrow margins stay contested for a validator or operator to resolve.
pub fn compare_claims(
    same_value: bool,
    incumbent_score: Option<i64>,
    challenger_score: i64,
) -> ClaimResolution {
    if same_value {
        return ClaimResolution::SameValue;
    }

    let Some(incumbent_score) = incumbent_score else {
        return ClaimResolution::NewClaimWins;
    };

    if challenger_score.saturating_mul(10_000) >= incumbent_score.saturating_mul(11_000) {
        ClaimResolution::NewClaimWins
    } else {
        ClaimResolution::Contested
    }
}

pub fn decision_for_resolution(resolution: ClaimResolution) -> ClaimDecision {
    match resolution {
        ClaimResolution::SameValue | ClaimResolution::NewClaimWins => ClaimDecision::Accepted,
        ClaimResolution::Contested => ClaimDecision::Contested,
    }
}

#[cfg(test)]
mod tests {
    use super::{ClaimResolution, compare_claims};

    #[test]
    fn close_competing_scores_stay_contested() {
        assert_eq!(
            compare_claims(false, Some(8_000), 8_400),
            ClaimResolution::Contested
        );
    }

    #[test]
    fn clear_authority_margin_replaces_incumbent() {
        assert_eq!(
            compare_claims(false, Some(8_000), 8_800),
            ClaimResolution::NewClaimWins
        );
    }
}
