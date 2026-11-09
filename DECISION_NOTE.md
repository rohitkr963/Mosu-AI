# Decision note

Name or applicant identifier: Rohit Kumar

Active time spent (including setup, shown separately): approx. 2 h active work (setup: approx. 15 min)

## One design decision

I treat any failed notify call as `unknown`, not `failed` or `sent`. The alternative was to mark a failure as "not sent" and retry freely. I rejected it because a timeout does not prove the message was not delivered, so a blind retry could message the customer twice.

The idempotency key is the exact action ID, with no attempt suffix, so every retry carries the same key. `sent` is recorded only when a receipt comes back. After two attempts without a receipt the outcome is `needs_reconciliation`, and no further calls are made.

## One failure you found and corrected

The starter recorded `sent` after a timeout and created a new key on each retry, which could deliver duplicates. In `results.json`, check 5 now shows the first send as `unknown` with no receipt, and the retry ends as `sent` with 2 notification calls but only 1 delivery. The limit check stops at `needs_reconciliation` after 2 calls. I also deleted a leftover `throw` at line 117 of the starter `workflow.mjs`.

A packaging problem: PowerShell's `>` wrote `results.json` in UTF-16, and `JSON.parse` failed. Claude suggested `cmd /c`; I ran `cmd /c "node run.mjs --json > results.json"` and confirmed the file parses and shows 6/6 passed.

## Remaining limitation or incomplete work

- Because of the 120-minute limit, I did not build a reconciliation process. The workflow only flags `needs_reconciliation` for a human.
- A clean service rejection also counts as `unknown` and uses an attempt. This is conservative, but it can send a case to a human unnecessarily.
- A measurement that is entirely `null` or absent gives only `missing:FIELD` and skips the unit check. `{ value: null, unit: 'in' }` gives `value:FIELD`, plus a unit issue if the unit is wrong. This was my choice where the contract is not explicit.

## AI assistance and verification

I used Claude to write the `workflow.mjs` fix and a first draft of this note. I accepted its choice to treat every notify failure as `unknown` and checked it against the published checks: all 6 pass in `results.json`. I compared the six protected kit files with the original zip by hash (all SAME), and I regenerated and parsed `results.json` myself. I edited this note before submitting.