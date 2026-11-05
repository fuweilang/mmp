# Spec: enterprise AI coin billing

## Requirements

### Requirement: Platform billing defaults

The platform SHALL maintain a single billing config with `sellPriceMultiplier` (Admin 估算/对账) and `aiCoinsPerYuan` (充值兑换). `tokensPerAiCoin` MAY remain in storage for API compatibility but MUST NOT affect wallet debit (fixed 1:1).

#### Scenario: Default values

- **WHEN** config row is missing
- **THEN** system persists defaults including `sellPriceMultiplier=1.5` and `aiCoinsPerYuan=1000`

#### Scenario: Admin updates config

- **WHEN** a platform admin PUTs valid multiplier (>0) and aiCoinsPerYuan (>=1)
- **THEN** recharge uses aiCoinsPerYuan; chat debit remains 1 AI币 = 1 token (multiplier not applied to debit)

### Requirement: Enterprise wallet

Each non-platform enterprise tenant SHALL have exactly one AI coin wallet.

#### Scenario: Auto-create on enterprise create

- **WHEN** admin creates an enterprise
- **THEN** a wallet with `balanceCoins=0` exists for that tenant

#### Scenario: Manual adjust

- **WHEN** platform admin posts adjust with positive or negative delta and idempotency key
- **THEN** balance changes by delta (not below 0 on debit) and a ledger row is written once

### Requirement: Token-based chat charge

Cloud chat completions SHALL debit the acting user's current tenant wallet by `floor(tokens)` (1 AI币 = 1 token). Sell-price multiplier MUST NOT multiply into the debit.

#### Scenario: Insufficient balance blocks chat

- **WHEN** tenant balance is 0 (or precheck fails)
- **THEN** cloud chat completions returns an error and does not call the vendor

#### Scenario: Successful charge after usage

- **WHEN** upstream returns usage with total_tokens=T>0 and balance is sufficient
- **THEN** wallet decreases by chargeCoins and a `chat_consume` ledger row exists

#### Scenario: Platform admin exempt

- **WHEN** actor is platform admin or session has no tenantId
- **THEN** precheck and charge are no-ops (ok without debit)

### Requirement: Idempotent charge

#### Scenario: Retry same key

- **WHEN** charge is called twice with the same idempotencyKey
- **THEN** balance changes only once and both responses refer to the same ledger id
