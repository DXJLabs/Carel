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
export function validateMandate(mandate, now = Date.now()) {
  if (!mandate || typeof mandate !== 'object') throw new Error('mandate required');
  for (const k of ['id', 'owner', 'agentId']) requireNonempty(mandate[k], k);
  const max = positiveUnits(mandate.maxAmountUnits, 'maxAmountUnits');
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
  return {...mandate, maxAmountUnits: max.toString()};
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
  return m;
}
