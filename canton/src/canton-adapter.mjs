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
  const result = await client.submitProposal({proposal, authorization: verified});
  if (!result?.proposalContractId) throw new Error('Canton proposal response missing created Proposal CID');
  return result;
}

/** Submit only the Daml Proposal.Accept choice; never create SettlementAuthorization directly. */
export async function submitAgreementToCanton({client, agreement, authorization}) {
  if (!authorization) throw new Error('participant authorization required');
  requireClient(client);
  if (!client || typeof client.submitAgreement !== 'function')
    throw new Error('Canton adapter not configured; acceptance command unavailable');
  if (!agreement || !['awaiting-ledger-authorization', 'authorized-for-ledger'].includes(agreement.status) || !agreement.proposalContractId || !agreement.mandateContractId)
    throw new Error('invalid agreement state');
  const verified = client.verifyAuthorization({agreement, operation: 'accept', requiredParties: [agreement.proposer, agreement.counterparty], authorization});
  const result = await client.submitAgreement({agreement, authorization: verified});
  if (!result?.nextMandateContractId) throw new Error('Canton acceptance response missing replacement Mandate CID');
  return result;
}
