# One-page systems glossary

**State:** explicit information that tells the workflow what has happened and what may happen next. Here it includes the profile version, pending action, approval, attempt count and delivery outcome.

**Action-bound approval:** permission to perform a particular action with particular arguments. Approval to send draft A about version 3 does not authorize draft B or version 4.

**Idempotency key:** a stable identifier the receiving service uses to recognize a retry of the same logical action. The key must stay the same when retrying an uncertain request. The service must actually support deduplication; a client-generated key alone cannot guarantee it.

**Timeout:** a response did not arrive in time. It does not prove that the receiving service did nothing. The truthful state may be unknown until a receipt or reconciliation establishes the result.

**Reconciliation:** checking an uncertain outcome against authoritative service records. The exercise exposes the need for reconciliation after two uncertain attempts; it does not require implementing a new reconciliation service.

**Harness:** the surrounding code and tools that give a model context, boundaries, state, logging and evaluation. In this kit, the runner and mocks expose failures and observable results.

**Workflow graph:** states and allowed transitions. You can represent this small workflow with ordinary conditional code; adding a graph framework is optional and earns no points by itself.

**Memory:** information retained for later work. Workflow state, conversation history, retrieved reference material and authoritative customer records have different purposes. Saving a chat is not sufficient to establish reliable long-term knowledge.

**MCP:** a protocol for connecting model-facing clients with tools/resources exposed by servers. This exercise uses local functions instead. A real MCP adapter would still need clear schemas, access controls and failure handling; implementing one is outside the baseline.

**Evaluation:** checking actual behavior against expected results, including failure cases. A polished explanation or a self-reported success message is weaker evidence than the mock service's own request and delivery records.
