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
  const parsed = BigInt(value);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${name} exceeds JSON-safe Int64 adapter range`);
  return Number(parsed);
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
      const proof = this.verifyAuthorization({agreement: proposal, authorization, operation: 'propose', requiredParties: [proposal?.proposer]});
      const resolvedTemplateId = requiredTemplateId(configuredMandateTemplateId);
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
      return request('/v2/commands/submit-and-wait-for-transaction-tree', {
        method: 'POST',
        body: {userId: proof.userId, commandId: proof.commandId, commands: [command], actAs: proof.actAs, readAs: proof.readAs}
      });
    },
    async submitAgreement({agreement, authorization} = {}) {
      if (!agreement || !['awaiting-ledger-authorization', 'authorized-for-ledger'].includes(agreement.status))
        throw new Error('invalid agreement state');
      const proof = this.verifyAuthorization({agreement, authorization, operation: 'accept', requiredParties: [agreement.proposer, agreement.counterparty]});
      const resolvedTemplateId = requiredTemplateId(configuredProposalTemplateId);
      requireNonempty(agreement.proposalContractId, 'proposalContractId');
      const command = {ExerciseCommand: {
        templateId: resolvedTemplateId,
        contractId: agreement.proposalContractId,
        choice: 'Accept',
        choiceArgument: {}
      }};
      return request('/v2/commands/submit-and-wait', {
        method: 'POST',
        body: {userId: proof.userId, commandId: proof.commandId, commands: [command], actAs: proof.actAs, readAs: proof.readAs}
      });
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
