import {validateUserAuthorization, requireNonempty} from './mandate.mjs';

function requiredUrl(value) {
  requireNonempty(value, 'Canton Ledger API baseUrl');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Canton Ledger API baseUrl must use http or https');
  return url.toString().replace(/\/$/, '');
}

function requiredTemplateId(value) {
  requireNonempty(value, 'Canton templateId');
  if (!/^#[^:]+:[^:]+:[^:]+$/.test(value)) throw new Error('Canton templateId must be a fully-qualified #package:Module:Template id');
  return value;
}

function int64(value, name) {
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) throw new Error(`${name} must be an unsigned integer string`);
  return BigInt(value).toString();
}

async function readResponse(response) {
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!response.ok) {
    const detail = body && typeof body === 'object' ? body.message ?? body.error ?? JSON.stringify(body) : String(body ?? 'no response body');
    throw new Error(`Canton Ledger API ${response.status}: ${detail}`);
  }
  return body;
}

function createdContracts(response, templateId) {
  const events = response?.transaction?.events;
  if (!Array.isArray(events))
    throw new Error('Canton Ledger API response missing transaction.events; contract ID lifecycle cannot be continued safely');
  return events
    .map(event => event?.CreatedEvent?.value)
    .filter(event => event && event.templateId === templateId && typeof event.contractId === 'string');
}

function requireCreatedContract(response, templateId, name) {
  const matches = createdContracts(response, templateId);
  if (matches.length !== 1)
    throw new Error(`Canton Ledger API response must contain exactly one created ${name} contract; found ${matches.length}`);
  return matches[0];
}

function requireArgumentFields(contract, expected, name) {
  const actual = contract?.createArgument;
  if (!actual || typeof actual !== 'object') throw new Error(`Canton ${name} response missing createArgument`);
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (String(actual[field]) !== String(expectedValue))
      throw new Error(`Canton ${name} createArgument ${field} does not match the submitted command`);
  }
}

function validateReplacementMandate(contract, agreement) {
  if (agreement.mandateContractId && contract.contractId === agreement.mandateContractId)
    throw new Error('Canton acceptance returned the original Mandate CID instead of a replacement');
  requireArgumentFields(contract, {
    owner: agreement.proposer,
    counterparty: agreement.counterparty,
    assetId: agreement.assetId
  }, 'replacement Mandate');
  const usage = contract.createArgument?.transactionsUsed;
  if (!/^[0-9]+$/.test(String(usage)) || BigInt(String(usage)) < 1n)
    throw new Error('Canton replacement Mandate has invalid transactionsUsed');
}

export function createCantonLedgerApiClient({baseUrl, token, mandateTemplateId, proposalTemplateId, partyPublicKeys, fetchImpl = globalThis.fetch, timeoutMs = 10000} = {}) {
  const origin = requiredUrl(baseUrl);
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation required');
  const configuredMandateTemplateId = mandateTemplateId ? requiredTemplateId(mandateTemplateId) : undefined;
  const configuredProposalTemplateId = proposalTemplateId ? requiredTemplateId(proposalTemplateId) : undefined;

  async function request(path, {method = 'GET', body} = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = {'Accept': 'application/json'};
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetchImpl(`${origin}${path}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal
      });
      return await readResponse(response);
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error(`Canton Ledger API request timed out after ${timeoutMs}ms`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  return Object.freeze({
    verifyAuthorization({agreement, authorization, operation, requiredParties} = {}) {
      return validateUserAuthorization(authorization, {agreement, operation, requiredParties, trustedPublicKeys: partyPublicKeys});
    },
    async health() { return request('/livez'); },
    async activeContracts({userId, actAs, readAs = [], filter = [], activeAt} = {}) {
      requireNonempty(userId, 'userId');
      if (!Array.isArray(actAs) || actAs.length === 0) throw new Error('actAs required for active contract query');
      return request('/v2/state/active-contracts', {method: 'POST', body: {userId, actAs, readAs, filter, ...(activeAt === undefined ? {} : {activeAt})}});
    },
    async submitProposal({proposal, authorization} = {}) {
      requireNonempty(proposal?.proposer, 'proposer');
      requireNonempty(proposal?.counterparty, 'counterparty');
      requireNonempty(proposal?.proposerAgent, 'proposerAgent');
      requireNonempty(proposal?.assetId, 'assetId');
      requireNonempty(proposal?.nonce, 'nonce');
      const proof = this.verifyAuthorization({agreement: proposal, authorization, operation: 'propose', requiredParties: [proposal?.proposer]});
      const resolvedTemplateId = requiredTemplateId(configuredMandateTemplateId);
      const resolvedProposalTemplateId = requiredTemplateId(configuredProposalTemplateId);
      requireNonempty(proposal?.mandateContractId, 'mandateContractId');
      const command = {ExerciseCommand: {
        templateId: resolvedTemplateId,
        contractId: proposal.mandateContractId,
        choice: 'Propose',
        choiceArgument: {
          proposerAgent: proposal.proposerAgent,
          amountUnits: int64(proposal.amountUnits, 'amountUnits'),
          nonce: proposal.nonce
        }
      }};
      const response = await request('/v2/commands/submit-and-wait-for-transaction', {
        method: 'POST',
        body: {userId: proof.userId, commandId: proof.commandId, commands: [command], actAs: proof.actAs, readAs: proof.readAs}
      });
      const createdProposal = requireCreatedContract(response, resolvedProposalTemplateId, 'Proposal');
      requireArgumentFields(createdProposal, {
        mandateId: proposal.mandateContractId,
        owner: proposal.proposer,
        counterparty: proposal.counterparty,
        proposerAgent: proposal.proposerAgent,
        assetId: proposal.assetId,
        amountUnits: proposal.amountUnits,
        nonce: proposal.nonce
      }, 'Proposal');
      return {...response, proposalContractId: createdProposal.contractId, proposalTemplateId: createdProposal.templateId};
    },
    async submitAgreement({agreement, authorization} = {}) {
      if (!agreement || !['awaiting-ledger-authorization', 'authorized-for-ledger'].includes(agreement.status))
        throw new Error('invalid agreement state');
      requireNonempty(agreement.proposer, 'proposer');
      requireNonempty(agreement.counterparty, 'counterparty');
      requireNonempty(agreement.assetId, 'assetId');
      requireNonempty(agreement.mandateContractId, 'mandateContractId');
      const proof = this.verifyAuthorization({agreement, authorization, operation: 'accept', requiredParties: [agreement.proposer, agreement.counterparty]});
      const resolvedTemplateId = requiredTemplateId(configuredProposalTemplateId);
      requireNonempty(agreement.proposalContractId, 'proposalContractId');
      const command = {ExerciseCommand: {
        templateId: resolvedTemplateId,
        contractId: agreement.proposalContractId,
        choice: 'Accept',
        choiceArgument: {}
      }};
      const response = await request('/v2/commands/submit-and-wait-for-transaction', {
        method: 'POST',
        body: {userId: proof.userId, commandId: proof.commandId, commands: [command], actAs: proof.actAs, readAs: proof.readAs}
      });
      const replacementMandate = requireCreatedContract(response, requiredTemplateId(configuredMandateTemplateId), 'replacement Mandate');
      validateReplacementMandate(replacementMandate, agreement);
      return {...response, nextMandateContractId: replacementMandate.contractId, nextMandateTemplateId: replacementMandate.templateId};
    }
  });
}

export function cantonLedgerConfigFromEnv(env = process.env) {
  let partyPublicKeys = {};
  if (env.CANTON_PARTY_PUBLIC_KEYS_JSON) {
    try { partyPublicKeys = JSON.parse(env.CANTON_PARTY_PUBLIC_KEYS_JSON); }
    catch { throw new Error('CANTON_PARTY_PUBLIC_KEYS_JSON must be valid JSON'); }
  }
  return {
    baseUrl: env.CANTON_LEDGER_API_URL,
    token: env.CANTON_LEDGER_API_TOKEN,
    mandateTemplateId: env.CANTON_MANDATE_TEMPLATE_ID,
    proposalTemplateId: env.CANTON_PROPOSAL_TEMPLATE_ID,
    partyPublicKeys
  };
}
