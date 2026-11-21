# Optional bank connections

Bank connections are researched but are not enabled in this release. The shared ledger works without connecting a bank account or buying a subscription.

## Can Plaid fit a small family?

Possibly. Plaid's current Trial plan offers real bank data to eligible new US/Canada teams created on or after April 15, 2026. It includes Transactions and Transactions Refresh and permits 10 Production Items. An Item generally represents a login at a financial institution, which may cover several accounts.

The limit counts Items created over the trial's lifetime. Removing an Item does not restore a slot. Existing teams with Production applications or existing Production access may be ineligible. Sandbox testing is free. Paid pricing is shown during the Production application process; there is no universal public per-person price to quote.

Before enabling anything, check the actual team's eligibility, institution coverage, quota, and agreement in the Plaid dashboard. Do not upgrade automatically or assume the trial includes every add-on.

Sources checked November 21, 2026:

- [Plaid pricing and billing](https://plaid.com/docs/account/billing/)
- [Plaid plan eligibility](https://support.plaid.com/hc/en-us/articles/16110502116887-What-are-Plaid-s-prices-and-pricing-plans-and-how-do-they-differ)

## Architecture needed

GitHub Pages can serve the app interface. Bank connections also need a server component. Never put a Plaid secret or access token in a `VITE_` variable, static file, browser storage, GitHub repository, or client bundle.

The server authenticates the current Tabby user and creates a short-lived Link token. The user then connects their institution through Plaid Link. The server exchanges the returned public token for an access token and stores that token securely, associated with that user. It must never return the access token to the browser.

For import, the server calls Transactions Sync, stores its cursor, and handles added, modified, and removed records. Webhooks trigger later syncs. Webhook verification, retries, idempotency, reconnects, and deletion must be implemented before release. Client requests need user authorization checks; knowing another person's Item ID must never grant access.

Sources:

- [Plaid Quickstart: client and server flow](https://plaid.com/docs/quickstart/)
- [Transactions: sync and updates](https://plaid.com/docs/transactions/)
- [GitHub Pages overview](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

## Recommended Tabby behavior

These are product decisions for a future implementation, rather than claims that bank data proves a debt:

1. Each person explicitly opts in to connecting their own accounts.
2. Imported transactions first enter that person's private inbox.
3. The person selects a transaction and deliberately shares it to a circle, choosing the payer and shares.
4. Only the selected shared record enters the circle's ledger. Other banking activity remains private.
5. Incoming transfers can suggest a repayment match, but the recipient confirms it before a tab is reduced.
6. Pending transactions remain provisional. Replaced, modified, or removed transactions are reconciled without double posting.
7. Disconnecting revokes the connection and stops sync. Account-data deletion needs an explicit, documented policy.

A matching amount alone is insufficient: two payments may have the same value, a transfer can be reversed, and the bank feed may not identify who owes which share. Keep people in control of posting and confirming.

## Release gate for bank import

The next banking release needs a real provider account, approved/eligible live access, secure server credentials, encrypted token storage, a private inbox, verified webhook handling, consent and disconnect flows, and end-to-end tests against Sandbox. Testing a fake feed is not proof that live bank import is ready.
