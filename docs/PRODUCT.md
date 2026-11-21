# Tabby user guide

Tabby keeps a shared record of little tabs between people you know. It tracks who owes whom, what the expense was for, and whether a repayment has been received. It does not move money.

## Start with a circle

Use a circle for people who should share one ledger. A family circle can include your parents and siblings. Make a separate circle for you and Gia, or for a trip with friends.

Every member of a circle can see that circle's people, expenses, notes, repayments, and recurring bills. A person in your family circle cannot see your other circles unless they join them too. Keep personal banking details, card numbers, and other private information out of shared notes.

In a live account, create your circle and add the people you want to track. An added person starts as a placeholder, so you can record a tab before that person has signed up. The circle owner can create an invitation for that specific person. Share the invitation privately: whoever accepts the unused link claims that person's place in the circle. Invitation links expire after seven days and can only be accepted once. Creating a new invitation for the same person replaces older unused invitations.

## Add an expense

Enter a short description, the total, who paid, who should share the expense, and its date. Add a vendor, category, or note when helpful. Equal splits distribute any leftover cents consistently; custom shares must add up to the exact total.

For example, if Mom buys $60 of groceries for you and Julia, choose Mom as the payer and assign $30 to each of you. Tabby records that you each owe Mom $30. If Mom also shares the purchase, include her share too; nobody owes themselves money.

Balances come from confirmed entries. Tabby keeps relationships separate, so money Julia owes Mom does not quietly become a debt to you.

## Record a repayment

Pay the other person using cash, Venmo, a bank transfer, or whatever you both prefer. Then record that payment in Tabby.

In live mode, the person sending the money records the payment. It stays pending until the recipient confirms receipt. A pending payment does not reduce the balance. This avoids marking a tab settled just because someone says they sent the money.

Use the payment date and notes to explain partial repayments or the payment method. Tabby records the payment; it never sends a bank transfer or charges a card.

## Plan recurring bills

Create a recurring template for a phone plan, streaming subscription, or other regular shared expense. Set its usual amount, payer, shares, and monthly due day.

Upcoming occurrences are estimates. They appear in the app for review without changing anybody's actual balance. When the bill arrives, review its amount and shares, then post that occurrence as an expense. If a particular month's bill changes, update that occurrence before posting it. A recurring occurrence can have only one active posted expense. If it needs correcting, remove the incorrect record and review that occurrence again.

Monthly dates that do not exist in a short month fall on that month's last day. Unreviewed past occurrences stay available for review rather than disappearing when their due date passes. Pausing a template stops its forecast. Removing a posted occurrence restores it for review, while its original record stays in the history.

Reminders are displayed inside Tabby when you open it. This release does not send background emails, texts, or push notifications.

## Correct a record

The person who created an entry, or the circle owner, can void an incorrect entry so it no longer affects the balance, then add its replacement. Keeping the original entry makes the correction understandable. A voided record remains visible in the history rather than disappearing.

## Search and export

Use Activity to find entries by their description or vendor and filter expenses and payments. Export the ledger as CSV when you want a spreadsheet copy. Amounts are stored as whole cents in USD, avoiding fractional-cent rounding errors.

## Try it safely

Demo mode uses fictional examples saved only in the current browser. Demo people, tabs, and changes are not shared with anyone and are not copied into a live account. Use sign-in to access your actual shared circles. A live account begins with an empty ledger. Family self-signup and account recovery also depend on the installation’s email-delivery and redirect settings; those settings must be verified before inviting everyone.

A demo persona switch is for exploring the example only. Live account permissions always come from the authenticated account.

## What this release does not do

- Transfer money or issue payment requests through Venmo.
- Connect a bank account or automatically import transactions.
- Automatically decide that an incoming bank transaction settles a tab.
- Send background reminders while the app is closed.
- Convert between currencies.

See [bank connection planning](BANK-CONNECTIONS.md) for the researched path to an optional future bank inbox.
