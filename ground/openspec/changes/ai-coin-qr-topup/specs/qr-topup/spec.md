# Spec: AI coin QR top-up

## Requirement: Create recharge order

Enterprise org admin SHALL create a pending order with CNY amount and computed AI coins.

#### Scenario: Convert yuan to coins

- **WHEN** admin creates order with amountYuan=10 and aiCoinsPerYuan=1000
- **THEN** order.aiCoins=10000 and status=pending

## Requirement: Pay QR

#### Scenario: Mock pay local

- **WHEN** PAY_PROVIDER=mock and channel=mock
- **THEN** order becomes confirmed and wallet increases by aiCoins once

#### Scenario: Insufficient channel config

- **WHEN** wechat/alipay env incomplete and channel is that provider
- **THEN** API returns Chinese error that channel is not configured

## Requirement: Settle once

#### Scenario: Notify and poll

- **WHEN** the same paid outTradeNo is settled via notify then status poll
- **THEN** wallet credits only once (idempotency key recharge:{orderNo}:confirm)
