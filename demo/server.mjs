import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHarness } from '../mock-tools.mjs';
import { initialState, MAX_ATTEMPTS } from '../contract.mjs';
import { handle } from '../workflow.mjs';

const demoDirectory = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const definitions = [
  {
    id: 'normal',
    name: 'Scenario A — normal',
    description: 'Unapproved send is blocked, approval enables one delivery, and replay is idempotent.',
    mode: 'success',
    events: ['LOAD_PROFILE', 'SEND', 'SEND', 'SEND'],
  },
  {
    id: 'uncertain_once',
    name: 'Scenario B — first response times out',
    description: 'The first send times out after delivery; an explicit retry returns the original receipt.',
    mode: 'commit_timeout_once',
    events: ['LOAD_PROFILE', 'SEND'],
  },
  {
    id: 'uncertain_twice',
    name: 'Scenario B — both responses time out',
    description: 'Both attempts time out; a final SEND is handled locally at the attempt limit.',
    mode: 'commit_timeout_always',
    events: ['LOAD_PROFILE', 'SEND', 'SEND'],
  },
];
const definitionById = new Map(definitions.map(item => [item.id, item]));
const runs = new Map();

function clone(value) {
  return structuredClone(value);
}

function createRun(definition) {
  const harness = createHarness({ mode: definition.mode });
  return {
    harness,
    state: initialState(),
    trace: [],
    cursor: 0,
    sequence: 0,
    toolCalls: [],
  };
}

function getRun(id) {
  const definition = definitionById.get(id);
  if (!definition) return null;
  if (!runs.has(id)) runs.set(id, createRun(definition));
  return { definition, run: runs.get(id) };
}

function counts(run) {
  const inspection = run.harness.inspect();
  return {
    notificationRequests: inspection.calls.length,
    actualDeliveries: inspection.deliveries.length,
  };
}

function getSnapshot(id) {
  const found = getRun(id);
  if (!found) return null;
  const { definition, run } = found;
  const nextEvent = definition.events[run.cursor] ?? null;
  const blockedForRetry = run.state.delivery.status === 'unknown' &&
    run.state.delivery.attempts < MAX_ATTEMPTS;
  const needsApproval = definition.id !== 'normal' &&
    nextEvent === 'SEND' &&
    run.state.pendingAction &&
    run.state.approvedActionId !== run.state.pendingAction.id;
  return {
    scenario: {
      id: definition.id,
      name: definition.name,
      description: definition.description,
    },
    state: clone(run.state),
    trace: clone(run.trace),
    ...counts(run),
    maxAttempts: MAX_ATTEMPTS,
    nextEvent,
    canNext: Boolean(nextEvent) && !blockedForRetry && !needsApproval,
    canApprove: Boolean(run.state.pendingAction) &&
      run.state.approvedActionId !== run.state.pendingAction.id,
    canRetry: run.state.delivery.status === 'unknown' &&
      run.state.delivery.attempts < MAX_ATTEMPTS,
  };
}

function wrapTools(run, stepToolCalls) {
  const wrapped = {};
  for (const name of ['readProtocol', 'draftClarification', 'notify']) {
    wrapped[name] = async (...args) => {
      const input = args.length === 1 ? clone(args[0]) : args.map(clone);
      const record = { sequence: run.toolCalls.length + 1, tool: name, input };
      try {
        const result = await run.harness.tools[name](...args);
        record.result = clone(result);
        run.toolCalls.push(record);
        stepToolCalls.push(clone(record));
        return result;
      } catch (error) {
        record.error = {
          message: error instanceof Error ? error.message : String(error),
          ...(error?.code ? { code: error.code } : {}),
        };
        run.toolCalls.push(record);
        stepToolCalls.push(clone(record));
        throw error;
      }
    };
  }
  return Object.freeze(wrapped);
}

async function execute(run, event) {
  const before = clone(run.state);
  const beforeCounts = counts(run);
  const toolCalls = [];
  const entry = {
    sequence: ++run.sequence,
    event: clone(event),
    before,
    tools: toolCalls,
    after: null,
    requestsBefore: beforeCounts.notificationRequests,
    deliveriesBefore: beforeCounts.actualDeliveries,
  };

  try {
    run.state = await handle(clone(run.state), clone(event), wrapTools(run, toolCalls));
    entry.after = clone(run.state);
  } catch (error) {
    entry.after = clone(before);
    entry.error = error instanceof Error ? error.message : String(error);
    const afterCounts = counts(run);
    entry.requestsAfter = afterCounts.notificationRequests;
    entry.deliveriesAfter = afterCounts.actualDeliveries;
    run.trace.push(entry);
    throw error;
  }

  const afterCounts = counts(run);
  entry.requestsAfter = afterCounts.notificationRequests;
  entry.deliveriesAfter = afterCounts.actualDeliveries;
  run.trace.push(entry);
  return entry;
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 32_768) throw new Error('Request body is too large.');
  }
  return body ? JSON.parse(body) : {};
}

async function serveStatic(pathname, response) {
  const files = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/index.html': ['index.html', 'text/html; charset=utf-8'],
    '/style.css': ['style.css', 'text/css; charset=utf-8'],
    '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  };
  const file = files[pathname];
  if (!file) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  const content = await readFile(resolve(demoDirectory, file[0]));
  response.writeHead(200, { 'content-type': file[1] });
  response.end(content);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  try {
    if (request.method === 'GET' && url.pathname === '/api/scenarios') {
      sendJson(response, 200, definitions.map(({ id, name, description }) => ({ id, name, description })));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/state') {
      const snapshot = getSnapshot(url.searchParams.get('scenario') ?? 'normal');
      if (!snapshot) {
        sendJson(response, 400, { error: 'Unknown scenario.' });
        return;
      }
      sendJson(response, 200, snapshot);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/reset') {
      const body = await readJson(request);
      const definition = definitionById.get(body.scenario);
      if (!definition) {
        sendJson(response, 400, { error: 'Unknown scenario.' });
        return;
      }
      runs.set(definition.id, createRun(definition));
      sendJson(response, 200, getSnapshot(definition.id));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/step') {
      const body = await readJson(request);
      const found = getRun(body.scenario);
      if (!found) {
        sendJson(response, 400, { error: 'Unknown scenario.' });
        return;
      }
      const { definition, run } = found;

      if (body.action === 'approve') {
        if (!run.state.pendingAction) {
          sendJson(response, 409, { error: 'There is no pending action to approve.' });
          return;
        }
        await execute(run, { type: 'APPROVE_ACTION', actionId: run.state.pendingAction.id });
      } else if (body.action === 'retry') {
        const snapshot = getSnapshot(definition.id);
        if (!snapshot.canRetry) {
          sendJson(response, 409, { error: 'Retry is available only while delivery is unknown and attempts remain.' });
          return;
        }
        if (!run.state.pendingAction || run.state.approvedActionId !== run.state.pendingAction.id) {
          sendJson(response, 409, { error: 'The exact pending action must be approved before retrying.' });
          return;
        }
        await execute(run, { type: 'SEND' });
      } else if (body.action === 'next') {
        const snapshot = getSnapshot(definition.id);
        if (!snapshot.nextEvent) {
          sendJson(response, 409, { error: 'There are no more steps in this scenario.' });
          return;
        }
        if (!snapshot.canNext) {
          sendJson(response, 409, {
            error: snapshot.canRetry
              ? 'Delivery is unknown. Use the explicit Retry send control.'
              : 'Approve the exact action before continuing this scenario.',
          });
          return;
        }
        await execute(run, {
          type: snapshot.nextEvent,
          ...(snapshot.nextEvent === 'LOAD_PROFILE' ? { profile: clone(run.harness.profile) } : {}),
        });
        run.cursor += 1;
      } else {
        sendJson(response, 400, { error: 'Action must be "next", "approve", or "retry".' });
        return;
      }

      sendJson(response, 200, getSnapshot(definition.id));
      return;
    }

    if (request.method === 'GET') {
      await serveStatic(url.pathname, response);
      return;
    }

    response.writeHead(405, { allow: 'GET, POST' });
    response.end('Method not allowed');
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, () => {
  console.log(`MOSU demo listening at http://localhost:${port}`);
});

server.on('error', error => {
  console.error(`Could not start demo server: ${error.message}`);
  process.exitCode = 1;
});
