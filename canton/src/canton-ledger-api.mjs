import {validateUserAuthorization, requireNonempty} from './mandate.mjs';

function requiredUrl(value) {
  requireNonempty(value, 'Canton Ledger API baseUrl');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Canton Ledger API baseUrl must use http or https');
  return url.toString().replace(/\/$/, '');
}

function requiredTemplateId(value) {
  requireNonempty(value, 'Canton settlement templateId');
  if (!/^#[^:]+:[^:]+:[^:]+$/.test(value)) throw new Error('Canton settlement templateId must be a fully-qualified #package:Module:Template id');
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

export function createCantonLedgerApiClient({baseUrl, token, templateId, fetchImpl = globalThis.fetch, timeoutMs = 10000} = {}) {
  const origin = requiredUrl(baseUrl);
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation required');
  const configuredTemplateId = templateId ? requiredTemplateId(templateId) : undefined;

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
    async health() { return request('/livez'); },
    async activeContracts({userId, actAs, readAs = [], filter = [], activeAt} = {}) {
      requireNonempty(userId, 'userId');
      if (!Array.isArray(actAs) || actAs.length === 0) throw new Error('actAs required for active contract query');
      return request('/v2/state/active-contracts', {method: 'POST', body: {userId, actAs, readAs, filter, ...(activeAt === undefined ? {} : {activeAt})}});
    },
    async submitAgreement({agreement, authorization} = {}) {
      if (!agreement || !['awaiting-ledger-authorization', 'authorized-for-ledger'].includes(agreement.status))
        throw new Error('invalid agreement state');
      const proof = validateUserAuthorization(authorization, [agreement.proposer, agreement.counterparty]);
      const resolvedTemplateId = requiredTemplateId(proof.templateId ?? configuredTemplateId);
      const command = {
        CreateCommand: {
          templateId: resolvedTemplateId,
          createArguments: {
            owner: agreement.proposer,
            counterparty: agreement.counterparty,
            proposerAgent: agreement.proposerAgent ?? agreement.proposer,
            acceptorAgent: agreement.acceptorAgent ?? agreement.counterparty,
            assetId: agreement.assetId,
            amountUnits: int64(agreement.amountUnits, 'amountUnits'),
            proposalNonce: agreement.nonce ?? agreement.proposalId
          }
        }
      };
      return request('/v2/commands/submit-and-wait', {
        method: 'POST',
        body: {userId: proof.userId, commandId: proof.commandId, commands: [command], actAs: proof.actAs, readAs: proof.readAs}
      });
    }
  });
}

export function cantonLedgerConfigFromEnv(env = process.env) {
  return {
    baseUrl: env.CANTON_LEDGER_API_URL,
    token: env.CANTON_LEDGER_API_TOKEN,
    templateId: env.CANTON_SETTLEMENT_TEMPLATE_ID
  };
}
