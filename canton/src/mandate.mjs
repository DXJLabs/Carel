import {createPublicKey, verify as verifySignature} from 'node:crypto';

/** Prototype ONLY: off-chain mandate policy. Does not authorize on-chain transfers. */
export function requireNonempty(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} required`);
  return value.trim();
}
export function positiveUnits(units, name = 'amountUnits') {
  if (typeof units !== 'string' || !/^[1-9][0-9]*$/.test(units))
    throw new Error(`${name} must be positive integer base units`);
  return BigInt(units);
}
export function nonNegativeUnits(units, name) {
  if (typeof units !== 'string' || !/^(0|[1-9][0-9]*)$/.test(units))
    throw new Error(`${name} must be non-negative integer base units`);
  return BigInt(units);
}
export function validateMandate(mandate, now = Date.now()) {
  if (!mandate || typeof mandate !== 'object') throw new Error('mandate required');
  for (const k of ['id', 'owner', 'agentId']) requireNonempty(mandate[k], k);
  const max = positiveUnits(mandate.maxAmountUnits, 'maxAmountUnits');
  const maxTransactions = positiveUnits(mandate.maxTransactions ?? '1', 'maxTransactions');
  const transactionsUsed = nonNegativeUnits(mandate.transactionsUsed ?? '0', 'transactionsUsed');
  if (transactionsUsed > maxTransactions) throw new Error('transactionsUsed exceeds mandate limit');
  if (!Array.isArray(mandate.allowedAssets) || mandate.allowedAssets.length === 0 ||
      mandate.allowedAssets.some(x => typeof x !== 'string' || !x.trim()))
    throw new Error('allowedAssets must be nonempty');
  if (!Array.isArray(mandate.allowedCounterparties) || mandate.allowedCounterparties.length === 0)
    throw new Error('allowedCounterparties must be nonempty');
  if (!Array.isArray(mandate.allowedActions) || mandate.allowedActions.length === 0 ||
      mandate.allowedActions.some(x => !['propose','accept'].includes(x)))
    throw new Error('allowedActions must be propose/accept');
  if (!Number.isSafeInteger(mandate.expiresAt) || now >= mandate.expiresAt)
    throw new Error('mandate expired');
  return {
    ...mandate,
    maxAmountUnits: max.toString(),
    maxTransactions: maxTransactions.toString(),
    transactionsUsed: transactionsUsed.toString()
  };
}
export function assertAllowed({mandate, action, assetId, amountUnits, counterparty, now = Date.now()}) {
  const m = validateMandate(mandate, now);
  requireNonempty(assetId, 'assetId');requireNonempty(counterparty, 'counterparty');
  const amount = positiveUnits(amountUnits);
  if (!m.allowedActions.includes(action)) throw new Error('action not allowed by mandate');
  if (!m.allowedAssets.includes(assetId)) throw new Error('asset not allowed by mandate');
  if (!m.allowedCounterparties.includes(counterparty)) throw new Error('counterparty not allowed by mandate');
  if (counterparty === m.owner) throw new Error('self counterparty not allowed');
  if (amount > BigInt(m.maxAmountUnits)) throw new Error('amount exceeds mandate limit');
  if (BigInt(m.transactionsUsed) >= BigInt(m.maxTransactions))
    throw new Error('mandate transaction limit reached');
  return m;
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function authorizationMessage({authorization, agreement, operation, requiredParties}) {
  requireNonempty(operation, 'authorization operation');
  if (!agreement || typeof agreement !== 'object') throw new Error('agreement required for authorization');
  return canonicalize({
    domain: 'carel-canton-authorization-v1',
    operation,
    userId: authorization.userId,
    commandId: authorization.commandId,
    requiredParties: [...requiredParties].sort(),
    agreement: {
      proposalId: agreement.proposalId ?? null,
      proposalContractId: agreement.proposalContractId ?? null,
      mandateContractId: agreement.mandateContractId ?? null,
      proposer: agreement.proposer ?? null,
      counterparty: agreement.counterparty ?? null,
      assetId: agreement.assetId ?? null,
      amountUnits: agreement.amountUnits ?? null,
      nonce: agreement.nonce ?? null,
      expiresAt: agreement.expiresAt ?? null
    }
  });
}

function trustedKeyFor(trustedPublicKeys, party) {
  const encoded = trustedPublicKeys && typeof trustedPublicKeys === 'object' ? trustedPublicKeys[party] : undefined;
  if (typeof encoded !== 'string' || !encoded) throw new Error(`trusted public key required for party: ${party}`);
  try {
    return createPublicKey({key: Buffer.from(encoded, 'base64'), format: 'der', type: 'spki'});
  } catch {
    throw new Error(`invalid trusted public key for party: ${party}`);
  }
}

export function validateUserAuthorization(authorization, {agreement, operation, requiredParties, trustedPublicKeys} = {}) {
  if (!authorization || typeof authorization !== 'object') throw new Error('participant authorization required');
  if (!Array.isArray(requiredParties) || requiredParties.length === 0)
    throw new Error('required authorization parties missing');
  for (const field of ['userId', 'commandId']) requireNonempty(authorization[field], field);
  const parties = [...new Set(requiredParties)];
  if (parties.length !== requiredParties.length) throw new Error('duplicate required authorization party');
  if (!Array.isArray(authorization.approvals) || authorization.approvals.length !== parties.length)
    throw new Error('cryptographic approvals required for every party');
  if (authorization.actAs !== undefined &&
      (new Set(authorization.actAs).size !== parties.length || authorization.actAs.some(party => !parties.includes(party))))
    throw new Error('actAs must match cryptographically approved parties');
  if (authorization.status !== undefined && authorization.status !== 'verified-by-wallet-or-participant')
    throw new Error('unsupported authorization status');
  const message = Buffer.from(authorizationMessage({authorization, agreement, operation, requiredParties: parties}));
  const approvals = new Map();
  for (const approval of authorization.approvals) {
    requireNonempty(approval?.party, 'approval.party');
    requireNonempty(approval?.signature, 'approval.signature');
    if (!parties.includes(approval.party) || approvals.has(approval.party))
      throw new Error('cryptographic approvals do not match required parties');
    let valid = false;
    try {
      valid = verifySignature(null, message, trustedKeyFor(trustedPublicKeys, approval.party), Buffer.from(approval.signature, 'base64'));
    } catch (error) {
      if (error.message.startsWith('trusted public key') || error.message.startsWith('invalid trusted public key')) throw error;
    }
    if (!valid) throw new Error(`invalid authorization signature for party: ${approval.party}`);
    approvals.set(approval.party, approval.signature);
  }
  if (approvals.size !== parties.length) throw new Error('cryptographic approvals do not match required parties');
  return Object.freeze({
    userId: authorization.userId.trim(),
    commandId: authorization.commandId.trim(),
    actAs: parties,
    readAs: parties,
    approvals: parties.map(party => ({party, signature: approvals.get(party)})),
    operation
  });
}
