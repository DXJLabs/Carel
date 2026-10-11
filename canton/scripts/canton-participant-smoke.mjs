import {readFile} from 'node:fs/promises';
import {createPrivateKey, createPublicKey, randomUUID, sign} from 'node:crypto';
import {createCantonLedgerApiClient} from '../src/canton-ledger-api.mjs';
import {authorizationMessage} from '../src/mandate.mjs';
import {submitAgreementToCanton, submitProposalToCanton} from '../src/canton-adapter.mjs';

function env(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function jsonEnv(name) {
  try { return JSON.parse(env(name)); }
  catch (error) { throw new Error(`${name} must be valid JSON: ${error.message}`); }
}

function privateKeyFor(privateKeys, party) {
  const encoded = privateKeys?.[party];
  if (typeof encoded !== 'string' || !encoded) throw new Error(`test signing key missing for party: ${party}`);
  try {
    return createPrivateKey({key: Buffer.from(encoded, 'base64'), format: 'der', type: 'pkcs8'});
  } catch {
    throw new Error(`test signing key for ${party} must be base64 PKCS#8 DER`);
  }
}

function assertPrivateKeyMatchesTrustedKey(privateKey, trustedPublicKeys, party) {
  const actual = createPublicKey(privateKey).export({format: 'der', type: 'spki'}).toString('base64');
  if (actual !== trustedPublicKeys?.[party])
    throw new Error(`test signing key does not match trusted public key for party: ${party}`);
}

function eventBody(event, name) {
  const value = event?.[name] ?? event?.[name[0].toLowerCase() + name.slice(1)];
  return value?.value ?? value;
}

function transactionEvents(response, label) {
  const events = response?.transaction?.events;
  if (!Array.isArray(events)) throw new Error(`${label} response missing transaction.events`);
  return events;
}

function createdEvent(response, templateId, label) {
  const matches = transactionEvents(response, label)
    .map(event => eventBody(event, 'CreatedEvent'))
    .filter(event => event?.templateId === templateId && typeof event.contractId === 'string');
  if (matches.length !== 1) throw new Error(`${label} must create exactly one ${templateId}; found ${matches.length}`);
  return matches[0];
}

function archivedContract(response, contractId) {
  return transactionEvents(response, 'acceptance')
    .map(event => eventBody(event, 'ArchivedEvent'))
    .some(event => event?.contractId === contractId);
}

function assertArgument(event, expected, label) {
  const actual = event?.createArgument;
  if (!actual || typeof actual !== 'object') throw new Error(`${label} response missing createArgument`);
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (String(actual[field]) !== String(expectedValue))
      throw new Error(`${label} ${field} does not match the submitted terms`);
  }
}

async function responseBody(response) {
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!response.ok) {
    const detail = body && typeof body === 'object' ? body.message ?? body.error ?? JSON.stringify(body) : String(body ?? 'no response body');
    throw new Error(`Canton participant ${response.status}: ${detail}`);
  }
  return body;
}

function signedAuthorization({agreement, operation, requiredParties, userId, commandId, privateKeys}) {
  const unsigned = {userId, commandId};
  const message = Buffer.from(authorizationMessage({authorization: unsigned, agreement, operation, requiredParties}));
  return {
    ...unsigned,
    approvals: requiredParties.map(party => ({
      party,
      signature: sign(null, message, privateKeyFor(privateKeys, party)).toString('base64')
    }))
  };
}

function acsCreatedEvents(body) {
  const entries = body?.activeContracts ?? body?.active_contracts ?? body?.contracts ?? [];
  if (!Array.isArray(entries)) throw new Error('Canton active-contracts response missing activeContracts');
  return entries.map(entry => entry?.createdEvent ?? entry?.CreatedEvent ?? entry?.value?.createdEvent ?? entry?.value?.CreatedEvent)
    .filter(Boolean);
}

async function main() {
  const baseUrl = env('CANTON_LEDGER_API_URL').replace(/\/$/, '');
  const token = env('CANTON_LEDGER_API_TOKEN');
  const userId = env('CANTON_LEDGER_USER_ID');
  const owner = env('CANTON_OWNER_PARTY');
  const counterparty = env('CANTON_COUNTERPARTY_PARTY');
  const agent = env('CANTON_AGENT_PARTY');
  const unrelatedParty = env('CANTON_UNRELATED_PARTY');
  const assetId = env('CANTON_SMOKE_ASSET_ID');
  const darPath = env('CANTON_SMOKE_DAR_PATH');
  const packageId = env('CANTON_PACKAGE_ID');
  const trustedPublicKeys = jsonEnv('CANTON_PARTY_PUBLIC_KEYS_JSON');
  const privateKeys = jsonEnv('CANTON_PARTY_PRIVATE_KEYS_JSON');
  if (owner === counterparty) throw new Error('owner and counterparty must be different Canton parties');
  if ([owner, counterparty].includes(agent)) throw new Error('agent party must be distinct from owner and counterparty for this smoke test');
  if ([owner, counterparty, agent].includes(unrelatedParty)) throw new Error('unrelated party must be distinct from workflow parties');

  for (const party of [owner, counterparty])
    assertPrivateKeyMatchesTrustedKey(privateKeyFor(privateKeys, party), trustedPublicKeys, party);

  const mandateTemplateId = `#${packageId}:ConfidentialAgentNetwork:Mandate`;
  const proposalTemplateId = `#${packageId}:ConfidentialAgentNetwork:Proposal`;
  const settlementTemplateId = `#${packageId}:ConfidentialAgentNetwork:SettlementAuthorization`;
  const maxAmountUnits = process.env.CANTON_SMOKE_MAX_AMOUNT_UNITS ?? '100';
  const maxTransactions = process.env.CANTON_SMOKE_MAX_TRANSACTIONS ?? '2';
  const amountUnits = process.env.CANTON_SMOKE_AMOUNT_UNITS ?? '1';
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const apiFetch = async (path, {method = 'GET', body, headers = {}} = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {Accept: 'application/json', Authorization: `Bearer ${token}`, ...headers},
      body
    });
    return responseBody(response);
  };
  const submit = (commands, actAs, commandId) => apiFetch('/v2/commands/submit-and-wait-for-transaction', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userId, commandId, commands, actAs, readAs: [owner, counterparty]})
  });

  await apiFetch('/livez');
  await apiFetch('/v2/dars?vetAllPackages=true', {
    method: 'POST',
    headers: {'Content-Type': 'application/octet-stream'},
    body: await readFile(darPath)
  });

  const mandateArgs = {
    owner,
    agent,
    counterparty,
    assetId,
    maxAmountUnits,
    maxTransactions,
    transactionsUsed: '0',
    expiresAt
  };
  const createResult = await submit([{CreateCommand: {templateId: mandateTemplateId, createArguments: mandateArgs}}], [owner], `carel-smoke-create-${randomUUID()}`);
  const mandate = createdEvent(createResult, mandateTemplateId, 'mandate creation');
  assertArgument(mandate, mandateArgs, 'mandate');

  const nonce = `carel-smoke-${randomUUID()}`;
  const proposal = {
    proposer: owner,
    proposerAgent: agent,
    counterparty,
    assetId,
    amountUnits,
    nonce,
    mandateContractId: mandate.contractId,
    status: 'proposed'
  };
  const proposalCommandId = `carel-smoke-propose-${randomUUID()}`;
  const proposalAuthorization = signedAuthorization({
    agreement: proposal,
    operation: 'propose',
    requiredParties: [owner],
    userId,
    commandId: proposalCommandId,
    privateKeys
  });
  const client = createCantonLedgerApiClient({
    baseUrl,
    token,
    mandateTemplateId,
    proposalTemplateId,
    partyPublicKeys: trustedPublicKeys
  });
  const proposalResult = await submitProposalToCanton({client, proposal, authorization: proposalAuthorization});
  const proposalContractId = proposalResult.proposalContractId;

  const agreement = {
    ...proposal,
    proposalContractId,
    status: 'awaiting-ledger-authorization'
  };
  const acceptanceCommandId = `carel-smoke-accept-${randomUUID()}`;
  const acceptanceAuthorization = signedAuthorization({
    agreement,
    operation: 'accept',
    requiredParties: [owner, counterparty],
    userId,
    commandId: acceptanceCommandId,
    privateKeys
  });
  const acceptanceResult = await submitAgreementToCanton({client, agreement, authorization: acceptanceAuthorization});
  const replacement = createdEvent(acceptanceResult, mandateTemplateId, 'acceptance');
  if (replacement.contractId !== acceptanceResult.nextMandateContractId || replacement.contractId === mandate.contractId)
    throw new Error('acceptance did not return a fresh replacement Mandate CID');
  assertArgument(replacement, {...mandateArgs, transactionsUsed: '1'}, 'replacement mandate');
  if (!archivedContract(acceptanceResult, mandate.contractId)) throw new Error('acceptance did not archive the original Mandate CID');
  const settlement = createdEvent(acceptanceResult, settlementTemplateId, 'acceptance');
  assertArgument(settlement, {mandateId: replacement.contractId, proposalId: proposalContractId, owner, counterparty, assetId, amountUnits, proposalNonce: nonce}, 'settlement authorization');

  const offset = acceptanceResult?.transaction?.offset;
  const unrelated = await apiFetch('/v2/state/active-contracts', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      filter: {filtersByParty: {[unrelatedParty]: {cumulative: [{identifierFilter: {WildcardFilter: {value: {}}}}]}}},
      verbose: false,
      ...(offset === undefined ? {} : {activeAtOffset: offset})
    })
  });
  const leaked = acsCreatedEvents(unrelated).filter(event => [mandateTemplateId, proposalTemplateId, settlementTemplateId].includes(event.templateId));
  if (leaked.length !== 0) throw new Error(`unrelated party can see ${leaked.length} confidential workflow contract(s)`);

  console.log(JSON.stringify({
    status: 'participant-smoke-passed',
    mandateContractId: mandate.contractId,
    proposalContractId,
    replacementMandateContractId: replacement.contractId,
    settlementAuthorizationCreated: true,
    originalMandateArchived: true,
    unrelatedPartyVisibility: 'none'
  }, null, 2));
}

main().catch(error => {
  console.error(`Canton participant smoke test failed: ${error.message}`);
  process.exitCode = 1;
});
