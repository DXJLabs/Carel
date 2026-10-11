function requireClient(client) {
  if (!client || typeof client.verifyAuthorization !== 'function')
    throw new Error('Canton adapter not configured; cryptographic verifier required');
}

export async function submitProposalToCanton({client, proposal, authorization}) {
  if (!authorization) throw new Error('participant authorization required');
  requireClient(client);
  if (!client || typeof client.submitProposal !== 'function')
    throw new Error('Canton adapter not configured; proposal command unavailable');
  if (!proposal || proposal.status !== 'proposed') throw new Error('invalid proposal state');
  const verified = client.verifyAuthorization({agreement: proposal, operation: 'propose', requiredParties: [proposal.proposer], authorization});
  return client.submitProposal({proposal, authorization: verified});
}

/** Submit only the Daml Proposal.Accept choice; never create SettlementAuthorization directly. */
export async function submitAgreementToCanton({client, agreement, authorization}) {
  if (!authorization) throw new Error('participant authorization required');
  requireClient(client);
  if (!client || typeof client.submitAgreement !== 'function')
    throw new Error('Canton adapter not configured; acceptance command unavailable');
  if (!agreement || !['awaiting-ledger-authorization', 'authorized-for-ledger'].includes(agreement.status) || !agreement.proposalContractId)
    throw new Error('invalid agreement state');
  const verified = client.verifyAuthorization({agreement, operation: 'accept', requiredParties: [agreement.proposer, agreement.counterparty], authorization});
  return client.submitAgreement({agreement, authorization: verified});
}
