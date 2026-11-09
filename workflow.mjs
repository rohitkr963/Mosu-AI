import { initialState, makeActionId, MAX_ATTEMPTS } from './contract.mjs';

function validateProfile(profile, protocol) {
  const issues = [];
  for (const field of protocol.requiredFields) {
    const measurement = profile.measurements?.[field];
    if (measurement === null || measurement === undefined) {
      issues.push(`missing:${field}`);
      continue;
    }

    if (typeof measurement.value !== 'number' ||
        !Number.isFinite(measurement.value) || measurement.value <= 0) {
      issues.push(`value:${field}`);
    }

    const actualUnit = measurement.unit;
    if (actualUnit !== protocol.requiredUnit) {
      issues.push(`unit:${field}:${actualUnit === null || actualUnit === undefined ? 'missing' : actualUnit}`);
    }
  }
  return issues.sort();
}

export async function handle(previous, event, tools) {
  const state = structuredClone(previous ?? initialState());

  if (event.type === 'LOAD_PROFILE') {
    const profile = structuredClone(event.profile);
    const protocol = await tools.readProtocol(profile.protocolId);
    const issues = validateProfile(profile, protocol);
    state.currentProfile = profile;
    state.currentProtocol = structuredClone(protocol);
    state.issues = issues;
    state.reviewStatus = issues.length > 0 ? 'needs_clarification' : 'ready_for_review';
    state.outcome = 'loaded';

    if (issues.length === 0) {
      state.pendingAction = null;
      state.approvedActionId = null;
      state.delivery = { status: 'not_sent', attempts: 0, receiptId: null };
      return state;
    }

    const text = await tools.draftClarification({
      profileId: profile.id,
      profileVersion: profile.version,
      issues,
    });
    const action = {
      kind: 'SEND_CLARIFICATION',
      profileId: profile.id,
      profileVersion: profile.version,
      recipient: profile.recipient,
      text,
    };
    action.id = makeActionId(action);

    if (state.pendingAction?.id !== action.id) {
      state.pendingAction = action;
      state.approvedActionId = null;
      state.delivery = { status: 'not_sent', attempts: 0, receiptId: null };
    } else {
      state.pendingAction = structuredClone(state.pendingAction);
      if (state.delivery.status === 'sent') {
        state.outcome = 'sent';
      } else if (state.delivery.attempts >= MAX_ATTEMPTS) {
        state.outcome = 'needs_reconciliation';
      }
    }
    return state;
  }

  if (event.type === 'APPROVE_ACTION') {
    if (state.pendingAction?.id === event.actionId) {
      state.approvedActionId = event.actionId;
      state.outcome = 'approval accepted';
    } else {
      state.outcome = 'approval rejected';
    }
    return state;
  }

  if (event.type === 'SEND') {
    const action = state.pendingAction;
    if (!action || state.approvedActionId !== action.id) {
      state.outcome = 'blocked';
      return state;
    }
    if (state.delivery.status === 'sent') {
      state.outcome = 'already sent';
      return state;
    }
    if (state.delivery.attempts >= MAX_ATTEMPTS) {
      state.delivery.status = 'unknown';
      state.outcome = 'needs_reconciliation';
      return state;
    }

    state.delivery.attempts += 1;
    try {
      const result = await tools.notify({
        idempotencyKey: action.id,
        recipient: action.recipient,
        text: action.text,
      });
      if (result?.receiptId) {
        state.delivery.status = 'sent';
        state.delivery.receiptId = result.receiptId;
        state.outcome = 'sent';
      } else {
        state.delivery.status = 'unknown';
        state.outcome = state.delivery.attempts >= MAX_ATTEMPTS
          ? 'needs_reconciliation' : 'request attempted';
      }
    } catch (error) {
      state.delivery.status = 'unknown';
      state.delivery.receiptId = null;
      state.outcome = state.delivery.attempts >= MAX_ATTEMPTS
        ? 'needs_reconciliation' : 'request attempted';
    }
    return state;
  }

  throw new Error(`Unknown event: ${event.type}`);
}
