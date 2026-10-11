import {createHash} from 'node:crypto';
import {assertAllowed, requireNonempty, validateUserAuthorization} from './mandate.mjs';

export class InMemoryProposalBook {
  #usedNonces = new Set();
  #accepted = new Set();
  #mandates = new Map();
  #transactions = new Map();
  #authorizedCommands = new Set();
  create({mandate, assetId, amountUnits, counterparty, nonce, now = Date.now()}) {
    const m = assertAllowed({mandate, action:'propose', assetId, amountUnits, counterparty, now});
    requireNonempty(nonce, 'nonce');
    const key = `${m.owner}:${nonce}`;
    if (this.#usedNonces.has(key)) throw new Error('duplicate proposal nonce');
    this.#usedNonces.add(key);
    this.#mandates.set(m.id, m);
    const id = createHash('sha256').update(JSON.stringify([m.id, m.owner, counterparty, assetId, amountUnits, nonce])).digest('hex');
    return Object.freeze({
      id,
      mandateId:m.id,
      proposer:m.owner,
      proposerAgent:m.agentId,
      counterparty,
      assetId,
      amountUnits,
      nonce,
      expiresAt:m.expiresAt,
      status:'proposed'
    });
  }
  accept({proposal, mandate, now = Date.now()}) {
    if (!proposal || typeof proposal !== 'object') throw new Error('proposal required');
    if (this.#accepted.has(proposal.id)) throw new Error('proposal already accepted');
    if (proposal.status !== 'proposed' || now >= proposal.expiresAt) throw new Error('proposal invalid or expired');
    const m = assertAllowed({mandate, action:'accept', assetId:proposal.assetId, amountUnits:proposal.amountUnits, counterparty:proposal.proposer, now});
    if (m.owner !== proposal.counterparty) throw new Error('wrong counterparty mandate');
    const proposerMandate = this.#mandates.get(proposal.mandateId);
    if (!proposerMandate) throw new Error('proposal mandate not found');
    const usage = [
      [proposerMandate.id, BigInt(proposerMandate.maxTransactions)],
      [m.id, BigInt(m.maxTransactions)]
    ];
    for (const [mandateId, limit] of usage) {
      const used = BigInt(this.#transactions.get(mandateId) ?? '0');
      if (used >= limit) throw new Error('mandate transaction limit reached');
    }
    for (const [mandateId] of usage)
      this.#transactions.set(mandateId, (BigInt(this.#transactions.get(mandateId) ?? '0') + 1n).toString());
    this.#accepted.add(proposal.id);
    return Object.freeze({proposalId:proposal.id, proposer:proposal.proposer, counterparty:proposal.counterparty,
      proposerAgent:proposal.proposerAgent, assetId:proposal.assetId, amountUnits:proposal.amountUnits,
      nonce:proposal.nonce, expiresAt:proposal.expiresAt, proposerMandateId:proposal.mandateId,
      acceptorMandateId:m.id, status:'awaiting-ledger-authorization'});
  }
  authorize({agreement, authorization, now = Date.now()}) {
    if (!agreement || !['awaiting-ledger-authorization', 'authorized-for-ledger'].includes(agreement.status))
      throw new Error('agreement invalid or already authorized');
    if (Number.isSafeInteger(agreement.expiresAt) && now >= agreement.expiresAt)
      throw new Error('agreement expired');
    const proof = validateUserAuthorization(authorization, [agreement.proposer, agreement.counterparty]);
    if (this.#authorizedCommands.has(proof.commandId)) throw new Error('duplicate authorization command');
    this.#authorizedCommands.add(proof.commandId);
    return Object.freeze({...agreement, status:'authorized-for-ledger', authorization:proof});
  }
}
