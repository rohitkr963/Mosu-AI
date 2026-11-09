# MOSU clarification workflow demo

## 1. Overview

This local page runs `workflow.mjs` with the supplied mock tools.
It shows workflow state, calls, and changes. No real messages are sent.

## 2. How to run

Checked on Node.js v22.18.0; no packages needed.
From the project folder, run:

```sh
node demo/server.mjs
```

Open http://localhost:3000. To run the checks, use another terminal:

```sh
node run.mjs
```

## 3. What the demo shows

### Scenario A: normal send

1. Select the scenario, click **Reset**, then **Next step**. Profile loads with `missing:waist` and `unit:hip:in`. Counts: 0 requests, 0 deliveries.
2. Click **Next step**. The unapproved send is blocked. Counts stay at 0 and 0.
3. Click **Approve exact action**. The action is approved; counts stay at 0 and 0.
4. Click **Next step**. A receipt is returned. Status is `sent`; counts are 1 request and 1 delivery.
5. Click **Next step** again. Replay makes no new notify call; counts stay at 1 and 1.

### Scenario B: first response times out

1. Select the scenario, click **Reset**, then **Next step**. The same issues appear; counts are 0 and 0.
2. Click **Approve exact action**, then **Next step**. The mock harness records a delivery but times out before returning the receipt. Status is `unknown`; counts are 1 request and 1 delivery.
3. Click **Retry send**. It uses the same action ID and gets the existing receipt. Status becomes `sent`; counts are 2 requests and 1 delivery.

For the both-timeouts option, load the profile and approve it. Click **Next step**, then **Retry send**. Both attempts time out. Status is `unknown`, outcome is `needs_reconciliation`, and counts are 2 requests and 1 delivery. A final **Next step** makes no third notify call.

Requests count calls to `notify`, including timeouts. Deliveries count the harness delivery log. A timeout can happen after delivery, so two requests can still mean one delivery.

## 4. Recording guide

Rough estimates for Scenario B with one timeout.

| Time (approx) | What I click | What the viewer should notice |
|---|---|---|
| 0:00–0:15 | Choose “Scenario B — first response times out”; **Reset** | State is initial; both counts are zero. |
| 0:15–0:40 | **Next step** | Diagram highlights clarification. State panel shows issues and action; trace shows the event and tool results. |
| 0:40–0:50 | **Approve exact action** | Approved ID matches pending action ID. Counts are still zero. |
| 0:50–1:10 | **Next step** | Diagram shows unknown. State shows one attempt and no receipt; trace shows the timeout. Counts are 1 and 1. |
| 1:10–1:30 | **Retry send** | State becomes sent with a receipt. Trace shows the retry; counts are 2 requests and 1 delivery. |

Keep the diagram, state panel, and trace visible. Section 3 covers two timeouts.

## 5. How the workflow is modelled

Delivery status is `not_sent`, `sent`, or `unknown`. Review status is `unreviewed`, `needs_clarification`, or `ready_for_review`.

| Event or result | What `handle()` does |
|---|---|
| `LOAD_PROFILE` | Reads the protocol and validates required measurements. It sorts issues and prepares an action if needed. With no issues, it sets `ready_for_review` and clears the action. |
| `APPROVE_ACTION` | Accepts only the current action ID. Outcome is `approval accepted` or `approval rejected`. |
| `SEND` without approval | Makes no notify call; outcome is `blocked`. |
| Notify returns a receipt | Sets status to `sent` and saves the receipt. Replay outcome is `already sent`. |
| Notify returns no receipt or throws | Sets status to `unknown` and clears the receipt. Outcome is `request attempted`, or `needs_reconciliation` at the limit. |
| Send after two uncertain attempts | Makes no notify call. Status stays `unknown`; outcome is `needs_reconciliation`. |

## 6. Loops, retries and what stops them

`MAX_ATTEMPTS` is 2. Nothing retries automatically. **Retry send** is enabled only for `unknown` while attempts remain. Each retry uses the same action ID as the idempotency key and keeps the same recipient and text. A `sent` action is not sent again. At the limit, no more notify calls are made.

## 7. Execution harness and permission boundary

`handle()` blocks `SEND` unless the approved ID matches the pending action ID. **Approve exact action** asks the server to send an approval event for that ID. It is not a real identity check.

The server creates a harness per scenario, calls `handle()`, logs tool inputs/results/errors, and records each state transition. `handle()` validates, prepares actions, checks approval/attempts, and calls tools.

## 8. Authoritative state vs AI/contextual information

The workflow state and tool results are the recorded outputs. Structured profile and protocol fields are used for validation. `workflow.mjs` does not use `protocol.note` to make decisions.

Draft text becomes the pending action text. It does not decide whether the profile is valid or whether sending is allowed.

## 9. Where AI could help and what must stay deterministic

AI could suggest wording or summarize a trace. Drafting here is a fixed mock. Validation, action IDs, approval, recipient, idempotency, retry limits, and sending stay deterministic.

## 10. Where an MCP/tool adapter would fit

An adapter could connect to protocol, drafting, or notification services. It is not implemented. Approval and idempotency checks must come first.

## 11. Implemented vs simulated

| Implemented | Simulated or not implemented |
|---|---|
| Local server/page, real `handle()` calls, state and trace, tool logs, counts, approval and retry checks. | Profile, protocol, drafting, provider, delivery, and timeout use the supplied mock harness. No real messages. |
| Scenario controls. | Designer review and production handoff are page concepts, not workflow events. |

## 12. What if the profile or protocol changes after approval but before send?

`makeActionId()` includes action kind, profile ID and version, recipient, and draft text. It supports a protocol revision, but `handle()` does not pass one. So protocol revision is not part of this action ID. The protocol is read at `LOAD_PROFILE`, not again at `SEND`.

Loading a new profile version creates a different action when clarification is needed. It clears approval and resets delivery for that action. Loading the same action preserves approval and delivery state. A protocol change after approval is not detected. A profile change that leaves the ID inputs and draft unchanged may also keep the same ID.

For production, include protocol ID/revision and key profile data in the action ID. Re-check before sending; if changed, require new approval.

## 13. One important trade-off and remaining limitations

Every `notify()` error becomes `unknown`, not just timeouts. This avoids claiming success without a receipt, but also treats definite errors as uncertain. There is no reconciliation event.

Protocol revision is not bound to approval. State is in memory and is lost on restart. There is no authentication, user isolation, durable storage, or real provider. Scenarios use fixed profiles and event plans.

## 14. Personal sections

### Total active time spent

2 hours

### AI tools used

Cloud

### One important result I personally verified

During the live demo, I verified that Scenario B ended with 2 notification requests and 1 mock delivery after the retry.

## Not verified from code

Times are estimates. Complete the personal sections yourself. Real delivery, authenticated approval, and a production adapter are not implemented or verified.
