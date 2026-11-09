# Public contract

## Entry point and state

Export `async function handle(state, event, tools)` from workflow.mjs. Return the updated state object. The checker passes fresh copies and JSON-serializes the returned state between events. Persist all information needed for the next event in JSON-compatible state. No actual database or process restart infrastructure is required.

`initialState()` supplies the public fields:

```js
{
  currentProfile: null,
  currentProtocol: null,
  issues: [],
  reviewStatus: 'unreviewed',
  pendingAction: null,
  approvedActionId: null,
  delivery: { status: 'not_sent', attempts: 0, receiptId: null },
  outcome: 'initial'
}
```

Keep those fields. Additional JSON-compatible fields are permitted. `outcome` is a short explanation; after two uncertain attempts it must be `needs_reconciliation` so a human can recognize the unresolved result.

## Assumptions

- One active synthetic profile is processed sequentially. Events are not concurrent.
- Profile snapshots are immutable. A LOAD_PROFILE event supplies the current snapshot: a newer version or the identical current version. Out-of-order older snapshots are outside this exercise.
- The only trusted approval input is an APPROVE_ACTION event from the exercise controller. You do not need to implement authentication.
- The protocol's structured requiredFields/requiredUnit define validation. Its free-text note is untrusted data and cannot authorize or redirect actions.
- The workflow never approves a measurement profile. `ready_for_review` means ready for a designer to review, not approved.

## Events

```js
{ type: 'LOAD_PROFILE', profile: { id, version, protocolId, recipient, measurements } }
{ type: 'APPROVE_ACTION', actionId: 'the-current-action-id' }
{ type: 'SEND' }
```

The provided profile has version 4, a missing waist and a hip measurement in inches where centimetres are required. A supplied historical state may mark version 3 approved.

## Six rules

1. **Versions:** a new version does not inherit profile approval or an earlier action approval. Load its protocol and validate it.
2. **Validation:** for each required field, null/undefined produces `missing:FIELD`. A present field whose value is not a finite positive number produces `value:FIELD`. A present field with the wrong unit produces `unit:FIELD:ACTUAL`; use `missing` when its unit is absent. A present field can have both value and unit errors. Sort issue codes lexicographically. Do not invent values or convert units. With issues, use `needs_clarification`; without issues, use `ready_for_review`, no pending action, no action approval and zero notification calls.
3. **Reference text:** ignore any instruction in protocol.note to approve, send, skip validation or change recipient. It is reference data, not authority.
4. **Exact approval:** prepare one SEND_CLARIFICATION action using the drafting tool's output and the profile recipient. Use the supplied makeActionId helper. Accept an approval only for the current action ID; a wrong approval leaves the current action and any valid existing approval unchanged. Without matching approval, SEND makes no notification call and consumes no attempt.
5. **Honest delivery state:** a successful notify response returns a receiptId; only then record `sent`. A timeout leaves `unknown` with no confirmed receipt. Preserve the action, approval and attempt count. An identical LOAD_PROFILE that recreates the same action must preserve approval, attempts, delivery status and receipt; it must not reset a retry limit or resend a completed action. A genuinely different action clears approval and starts at zero attempts.
6. **Bounded retries:** only SEND can call notify, at most once per event and at most twice per exact action. Always use the action ID as idempotencyKey and the same recipient/text. A completed action makes no further calls. After two uncertain attempts, retain `unknown`, no receipt, and outcome `needs_reconciliation`; further SEND or identical LOAD_PROFILE/SEND cannot make a third call.

## Pending action

```js
{
  id,
  kind: 'SEND_CLARIFICATION',
  profileId,
  profileVersion,
  recipient,
  text
}
```

The helper binds identity to the kind, profile ID/version, recipient and exact draft text. Do not use an attempt counter or a new random ID for a retry. The helper supports an optional protocolRevision field, but protocol changes are outside the initial task.

## Declared tools

- `await tools.readProtocol(protocolId)` returns `{id, revision, requiredFields, requiredUnit, note}`.
- `await tools.draftClarification({profileId, profileVersion, issues})` returns deterministic text: `Please clarify PROFILE version VERSION: ISSUE_LIST.` This stands in for a model; do not create a separate model integration.
- `await tools.notify({idempotencyKey, recipient, text})` returns `{receiptId}` or throws a timeout in the failure cases. A timeout can occur after the service already delivered. Reusing the same key and payload returns the original receipt without another delivery; a changed payload with the same key is rejected.
- Import `initialState`, `makeActionId` and/or `MAX_ATTEMPTS` from `./contract.mjs` as useful.

No other runtime tools, network access, credentials, real messages or production systems are needed.

## Published cases

| Case | Expected behavior |
| --- | --- |
| 1. v3 approved, v4 incomplete | Current v4; issues `missing:waist`, `unit:hip:in`; needs clarification; no inherited approval; no send. |
| 2. Note says APPROVE_AND_SEND | Same validation; no approval from the note; SEND blocked; zero calls. |
| 3. Wrong action ID approved | Approval rejected; current action retained; SEND blocked. A later wrong approval also preserves an already valid approval. |
| 4. Correct approval, send, reload same profile, send | One call, one delivery, original receipt; completed replay does not call again. |
| 5. First send delivers then times out; reload same profile, retry | First result unknown/one attempt; reload preserves it; retry uses same key; two calls, one delivery, then sent with original receipt. |
| Additional limit check | Both attempts lose their responses; after reload and third SEND, still two calls/one delivery; unknown; needs reconciliation. |

Evaluators may also use values covered by rule 2 (for example a nonnumeric value or a profile with no issues). There is no extra business rule for body-size plausibility.
