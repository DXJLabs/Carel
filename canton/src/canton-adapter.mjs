/** Fail-closed integration seam. This starter submits NOTHING to Canton. */
export async function submitAgreementToCanton({client, agreement, authorization}) {
  if (!authorization || authorization.status !== 'verified-by-wallet-or-participant')
    throw new Error('participant authorization required');
  if (!client || typeof client.submitAgreement !== 'function')
    throw new Error('Canton adapter not configured; no on-chain submission occurred');
  if (!agreement || agreement.status !== 'awaiting-ledger-authorization')
    throw new Error('invalid agreement state');
  return client.submitAgreement({agreement, authorization});
}
