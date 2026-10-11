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

export function validateUserAuthorization(authorization, requiredParties = []) {
  if (!authorization || authorization.status !== 'verified-by-wallet-or-participant')
    throw new Error('participant authorization required');
  for (const field of ['userId', 'commandId']) requireNonempty(authorization[field], field);
  if (!Array.isArray(authorization.actAs) || authorization.actAs.length === 0)
    throw new Error('participant authorization must include actAs parties');
  if (new Set(authorization.actAs).size !== authorization.actAs.length)
    throw new Error('participant authorization contains duplicate actAs party');
  for (const party of requiredParties) {
    if (!authorization.actAs.includes(party))
      throw new Error(`participant authorization missing required party: ${party}`);
  }
  for (const forbidden of ['privateKey', 'private_key', 'mnemonic', 'seed', 'secretKey']) {
    if (Object.hasOwn(authorization, forbidden))
      throw new Error('private-key material is not accepted by the agent');
  }
  return Object.freeze({
    status: authorization.status,
    userId: authorization.userId.trim(),
    commandId: authorization.commandId.trim(),
    actAs: [...authorization.actAs],
    readAs: Array.isArray(authorization.readAs) ? [...authorization.readAs] : [],
    templateId: typeof authorization.templateId === 'string' ? authorization.templateId.trim() : undefined
  });
}
