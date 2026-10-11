import {validateUserAuthorization} from './mandate.mjs';

/**
 * Submit only an already accepted agreement with explicit participant approval.
 * The client is the real JSON Ledger API client from canton-ledger-api.mjs.
 */
export async function submitAgreementToCanton({client, agreement, authorization}) {
  if (!authorization || authorization.status !== 'verified-by-wallet-or-participant')
    throw new Error('participant authorization required');
  if (!client || typeof client.submitAgreement !== 'function')
    throw new Error('Canton adapter not configured; no on-chain submission occurred');
  if (!agreement || !['awaiting-ledger-authorization', 'authorized-for-ledger'].includes(agreement.status))
    throw new Error('invalid agreement state');
  validateUserAuthorization(authorization, [agreement.proposer, agreement.counterparty]);
  return client.submitAgreement({agreement, authorization});
}
