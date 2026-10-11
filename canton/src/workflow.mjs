import {createHash} from 'node:crypto';
import {assertAllowed, requireNonempty} from './mandate.mjs';

export class InMemoryProposalBook {
  #usedNonces = new Set();
  #accepted = new Set();
  create({mandate, assetId, amountUnits, counterparty, nonce, now = Date.now()}) {
    const m = assertAllowed({mandate, action:'propose', assetId, amountUnits, counterparty, now});
    requireNonempty(nonce, 'nonce');
    const key = `${m.owner}:${nonce}`;
    if (this.#usedNonces.has(key)) throw new Error('duplicate proposal nonce');
    this.#usedNonces.add(key);
    const id = createHash('sha256').update(JSON.stringify([m.id, m.owner, counterparty, assetId, amountUnits, nonce])).digest('hex');
    return Object.freeze({id, mandateId:m.id, proposer:m.owner, counterparty, assetId, amountUnits, expiresAt:m.expiresAt, status:'proposed'});
  }
  accept({proposal, mandate, now = Date.now()}) {
    if (this.#accepted.has(proposal.id)) throw new Error('proposal already accepted');
    if (proposal.status !== 'proposed' || now >= proposal.expiresAt) throw new Error('proposal invalid or expired');
    const m = assertAllowed({mandate, action:'accept', assetId:proposal.assetId, amountUnits:proposal.amountUnits, counterparty:proposal.proposer, now});
    if (m.owner !== proposal.counterparty) throw new Error('wrong counterparty mandate');
    this.#accepted.add(proposal.id);
    return Object.freeze({proposalId:proposal.id, proposer:proposal.proposer, counterparty:proposal.counterparty,
      assetId:proposal.assetId, amountUnits:proposal.amountUnits, status:'awaiting-ledger-authorization'});
  }
}
