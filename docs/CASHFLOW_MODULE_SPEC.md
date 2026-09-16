# Cashflow & Finance Module — Shulamit

Branch: `feature/cashflow-shulamit`

## Goal

Build a self-contained finance/cashflow module inside the existing `sales-crm` project without modifying `main` until the module is reviewed and approved.

The module should give Shulamit maximum operational flexibility while reusing existing CRM entities where possible.

## Non-negotiable business rules

### Monthly cashflow
Each month is independent.

There is:
- no opening balance
- no previous-month balance
- no current bank balance
- no accumulated carry-forward

For each month:

`expected cashflow = expected income - expected expenses`

`actual cashflow = actual income - actual expenses`

`difference = actual cashflow - expected cashflow`

### Expected vs actual
Expected values are grouped by their expected date.
Actual values are grouped by their actual payment date.

Example:
A payment expected in September but received in October:
- remains in September expected income
- appears in October actual income
- does not rewrite September history

### Overdue
Overdue is derived, not stored as a durable business status:

`expected_date < today && status === expected`

### Annual summary
Annual summary is secondary and appears at the bottom of the finance/dashboard experience.

## Client / student finance

Reuse existing CRM clients/products where practical.

Each client purchase should support:
- purchase/product
- purchase date
- list price
- discount
- final price
- service type
- general finance notes
- payment schedule

Each scheduled payment should support:
- expected date
- expected amount
- payment method
- status
- actual payment date
- actual amount
- actual payment method
- free-text notes

Financial notes are required both:
1. at the purchase/enrollment level
2. at each individual payment

## Installments

Given:
- final amount
- number of installments
- first payment date
- payment method

Generate the schedule automatically.
Rounding differences go into the final installment.

## Expenses

Support:
- one-time expenses
- recurring expenses
- categories
- vendor
- expected date / amount
- actual date / amount
- notes
- status

Recurring frequencies:
- monthly
- bimonthly
- quarterly
- semiannual
- annual

## Finance screen

Primary view:
- expected income
- actual income
- expected expenses
- actual expenses
- expected cashflow
- actual cashflow
- difference

Show 12 months and allow year switching.

Include:
- upcoming payments
- overdue payments
- expense management
- recurring expenses

## Dashboard integration

When this module is later approved for merge, expose only summary widgets to the main CRM dashboard.

Do not let finance implementation take over unrelated CRM modules.

## Architecture constraints

- Stay inside the existing React + TypeScript + Vite project.
- Reuse existing CRM client/product entities when safe.
- Keep finance logic isolated in dedicated files/modules.
- Avoid changing unrelated screens.
- No destructive database changes.
- No production migrations until reviewed.
- Main branch must remain untouched.
- All finance work stays on `feature/cashflow-shulamit` until explicit approval.

## Existing experimental branch

There is an older branch:
`claude/financial-dashboard-xIbGj`

It contains an early finance implementation using:
- `FinanceView`
- `FinanceTx`
- `FinanceCategory`
- `FinanceRecurring`

Treat it as reference material only. Do not merge it wholesale. The Shulamit module requires richer expected-vs-actual cashflow, installment schedules, client finance notes, and expense forecasting.
