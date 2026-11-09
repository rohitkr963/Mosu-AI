# MOSU: reliable clarification workflow

## Purpose

Complete a small AI-assisted workflow with explicit state, human approval and honest failure handling. The supplied drafting tool stands in for an LLM. This is a synthetic exercise, not MOSU production work.

AI assistants, documentation and ordinary development tools are allowed. We want to see what you can explain, verify and adapt. You do not need a paid model account, network access, deployment, a database or a real MCP server.

## Time and terms

- Initial work: stop after **two hours** of active work. Submit partial work and describe what is incomplete.
- A later, separately supplied change: up to **30 additional minutes**. Do not implement it speculatively now.
- Agree payment, schedule, submission deadline and any accessibility needs with MOSU **before starting**. This kit does not itself establish payment or an employment offer.
- Setup trouble should be reported separately. Tell MOSU promptly rather than spending the timebox fighting the environment.

## Run it

Use an installed supported Node.js release with ES modules and `structuredClone` (Node 20+ is sufficient for this kit). No `npm install` or other dependencies are required.

From this extracted folder:

```sh
node smoke.mjs
node run.mjs
```

The smoke check should report `SETUP PASS` even for the intentionally broken starter. The behavior checks initially fail: that is expected.

Edit **workflow.mjs**. Keep the `handle(state, event, tools)` export and the public contract. Do not edit the checker, mocks or helpers to obtain passes.

To save your run report:

```sh
node run.mjs --json > results.json
```

Exit code 0 means all behavior checks passed, 1 means some failed, and 2 means setup/import failed. The console report is also a small state viewer: it shows each event, version, issues, approval, delivery status, attempts, actual service calls and actual deliveries.

## What to read

1. **CONTRACT.md**: the rules, event/state/tool shapes and expected behavior.
2. **GLOSSARY.md**: a short explanation of the systems concepts.
3. **workflow.mjs**: the broken starter to repair.
4. **cases.mjs** and **mock-tools.mjs**: the published checks and services. You may read them.

Five core cases cover new versions, untrusted reference text, wrong approval, approved replay, and a delivery whose response is lost. An additional published limit check covers two uncertain attempts and then stopping. Evaluators may change synthetic IDs, versions, numeric values and which required field is missing or has the wrong unit. The rules will remain the same; no undisclosed framework knowledge is required.

The later change brief will add one explicit requirement and acceptance criteria. It is not graded against the initial submission before you receive it.

## Submit

- Your **workflow.mjs**, plus any explanation of changes. Prefer editing only this file; disclose any additional standard-library-only code you need.
- **results.json** from the provided runner, including failures if any.
- A decision note using **DECISION_NOTE.md**, no more than **400 words**.

Be ready to show the unknown-delivery/retry case during a **15-minute walkthrough**. No prepared recording is required; screenshots or a recording are optional supporting material.

In the walkthrough, explain what is known after the timeout, what remains unknown and why the retry is safe. Identify your contribution and your AI-assisted work honestly. Full AI chat histories are not requested.

## Limits

Passing the checks does not prove authorship, production security, deployment experience or hiring suitability. It establishes a narrow set of observable behaviors. MOSU will discuss your decisions and ask you to apply a small change. Partial completion and a clear explanation are useful evidence; do not disguise incomplete behavior.
# Mosu-AI
