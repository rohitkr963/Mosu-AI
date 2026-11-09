const scenarioSelect = document.querySelector('#scenario');
const nextButton = document.querySelector('#next');
const approveButton = document.querySelector('#approve');
const retryButton = document.querySelector('#retry');
const resetButton = document.querySelector('#reset');
const message = document.querySelector('#message');

let snapshot;

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
  return body;
}

function text(id, value) {
  document.getElementById(id).textContent = value;
}

function renderIssues(issues) {
  const target = document.querySelector('#issues');
  target.replaceChildren();
  if (!issues.length) {
    const span = document.createElement('span');
    span.className = 'no-issues';
    span.textContent = 'None';
    target.append(span);
    return;
  }
  const list = document.createElement('ul');
  list.className = 'issue-list';
  for (const issue of issues) {
    const item = document.createElement('li');
    item.textContent = issue;
    list.append(item);
  }
  target.append(list);
}

function appendAction(action) {
  const target = document.querySelector('#pending-action');
  target.replaceChildren();
  if (!action) {
    target.textContent = 'None';
    return;
  }
  const id = document.createElement('code');
  id.textContent = action.id;
  const details = document.createElement('span');
  details.className = 'action-detail';
  details.textContent = `${action.kind} · to ${action.recipient} · ${action.text}`;
  target.append(id, details);
}

function renderTrace(trace) {
  const list = document.querySelector('#trace');
  list.replaceChildren();
  document.querySelector('#empty-trace').hidden = trace.length > 0;
  text('trace-count', `${trace.length} event${trace.length === 1 ? '' : 's'}`);

  for (const entry of trace) {
    const item = document.createElement('li');
    item.className = 'trace-entry';
    const details = document.createElement('details');
    details.open = true;
    const summaryNode = document.createElement('summary');
    summaryNode.textContent = `${entry.sequence}. ${entry.event.type}`;
    details.append(summaryNode);

    const eventLine = document.createElement('pre');
    eventLine.textContent = JSON.stringify(entry.event, null, 2);
    const eventHeading = document.createElement('h3');
    eventHeading.textContent = 'Event in';
    details.append(eventHeading, eventLine);

    for (const call of entry.tools) {
      const section = document.createElement('div');
      section.className = 'tool-line';
      const heading = document.createElement('h3');
      heading.textContent = `Tool call · ${call.tool}`;
      const data = document.createElement('pre');
      const record = { input: call.input };
      if (Object.hasOwn(call, 'result')) record.result = call.result;
      if (Object.hasOwn(call, 'error')) record.error = call.error;
      data.textContent = JSON.stringify(record, null, 2);
      section.append(heading, data);
      details.append(section);
    }

    const transitionHeading = document.createElement('h3');
    transitionHeading.textContent = entry.error ? 'State (handle error)' : 'State transition · before → after';
    const transition = document.createElement('pre');
    transition.textContent = JSON.stringify({
      before: entry.before,
      after: entry.after,
      ...(entry.error ? { error: entry.error } : {}),
    }, null, 2);
    const counts = document.createElement('p');
    counts.className = 'trace-meta';
    counts.textContent = entry.requestsAfter === undefined
      ? 'Mock request/delivery counts unavailable after the failed call.'
      : `Requests ${entry.requestsBefore} → ${entry.requestsAfter} · actual deliveries ${entry.deliveriesBefore} → ${entry.deliveriesAfter}`;
    details.append(transitionHeading, transition, counts);
    item.append(details);
    list.append(item);
  }
}

function deriveActiveStage(state) {
  if (!state.currentProfile) return 'load';
  if (state.delivery.status === 'unknown') return 'unknown';
  if (state.delivery.status === 'sent') return 'result';
  if (state.outcome === 'blocked') return 'approval';
  if (state.reviewStatus === 'needs_clarification') {
    return state.approvedActionId === state.pendingAction?.id ? 'send' : 'clarification';
  }
  if (state.pendingAction && state.approvedActionId !== state.pendingAction.id) return 'approval';
  if (state.pendingAction) return 'send';
  return 'result';
}

function renderFlow(state) {
  const active = deriveActiveStage(state);
  const order = ['load', 'clarification', 'approval', 'send', 'result'];
  const activeIndex = active === 'unknown' ? order.length : order.indexOf(active);
  for (const node of document.querySelectorAll('.flow-node')) {
    const stage = node.dataset.stage;
    node.classList.toggle('active', stage === active);
    node.classList.toggle('completed', order.indexOf(stage) !== -1 &&
      order.indexOf(stage) < activeIndex);
  }
  const labels = {
    load: 'Ready to load profile',
    clarification: 'Clarification prepared',
    approval: 'Exact approval required',
    send: 'Approved action ready to send',
    unknown: 'Delivery outcome unknown · retry is explicit',
    result: state.delivery.status === 'sent' ? 'Delivery confirmed' : 'Workflow result',
  };
  text('active-stage', labels[active]);
}

function render() {
  if (!snapshot) return;
  const state = snapshot.state;
  text('scenario-description', snapshot.scenario.description);
  text('profile', state.currentProfile
    ? `${state.currentProfile.id} · version ${state.currentProfile.version}`
    : 'Not loaded');
  text('protocol', state.currentProtocol
    ? `${state.currentProtocol.id} · revision ${state.currentProtocol.revision ?? 'not supplied'}`
    : 'Not loaded');
  renderIssues(state.issues);
  appendAction(state.pendingAction);
  text('approved-action', state.approvedActionId ?? 'None');
  text('delivery-status', state.delivery.status);
  text('attempts', `${state.delivery.attempts} / ${snapshot.maxAttempts}`);
  text('receipt', state.delivery.receiptId ?? 'None');
  text('review-status', state.reviewStatus);
  text('outcome', state.outcome);
  text('outcome-pill', state.outcome);
  text('requests', String(snapshot.notificationRequests));
  text('deliveries', String(snapshot.actualDeliveries));

  nextButton.disabled = !snapshot.canNext;
  approveButton.disabled = !snapshot.canApprove;
  retryButton.disabled = !snapshot.canRetry;
  renderFlow(state);
  renderTrace(snapshot.trace);
}

async function refresh() {
  snapshot = await requestJson(`/api/state?scenario=${encodeURIComponent(scenarioSelect.value)}`);
  render();
}

async function act(action) {
  message.textContent = '';
  try {
    snapshot = await requestJson('/api/step', {
      method: 'POST',
      body: JSON.stringify({ scenario: scenarioSelect.value, action }),
    });
    render();
  } catch (error) {
    message.textContent = error.message;
    await refresh();
  }
}

async function loadScenarios() {
  const scenarios = await requestJson('/api/scenarios');
  for (const scenario of scenarios) {
    const option = document.createElement('option');
    option.value = scenario.id;
    option.textContent = scenario.name;
    scenarioSelect.append(option);
  }
  await refresh();
}

scenarioSelect.addEventListener('change', () => {
  message.textContent = '';
  refresh().catch(error => { message.textContent = error.message; });
});
nextButton.addEventListener('click', () => act('next'));
approveButton.addEventListener('click', () => act('approve'));
retryButton.addEventListener('click', () => act('retry'));
resetButton.addEventListener('click', async () => {
  message.textContent = '';
  try {
    snapshot = await requestJson('/api/reset', {
      method: 'POST',
      body: JSON.stringify({ scenario: scenarioSelect.value }),
    });
    render();
  } catch (error) {
    message.textContent = error.message;
  }
});

loadScenarios().catch(error => { message.textContent = error.message; });
