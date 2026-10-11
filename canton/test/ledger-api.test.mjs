import test from 'node:test';
import assert from 'node:assert/strict';
import {createCantonLedgerApiClient} from '../src/canton-ledger-api.mjs';
import {submitAgreementToCanton, submitProposalToCanton} from '../src/canton-adapter.mjs';
import {makeAuthorizationFixture, signedAuthorization} from '../test-support/authorization-fixture.mjs';

const agreement = {
  proposer: 'alice::party',
  counterparty: 'bob::party',
  proposerAgent: 'alice-agent::party',
  assetId: 'canton:CBTC',
  amountUnits: '120000',
  nonce: 'nonce-1',
  mandateContractId: '00mandate',
  proposalContractId: '00proposal',
  status: 'awaiting-ledger-authorization'
};
const fixture = makeAuthorizationFixture(['alice::party', 'bob::party']);
const authorization = signedAuthorization({agreement, operation:'accept', requiredParties:['alice::party','bob::party'], fixture, userId:'carel-agent', commandId:'command-1'});
const proposal = {
  proposer: 'alice::party',
  proposerAgent: 'alice-agent::party',
  counterparty: 'bob::party',
  assetId: 'canton:CBTC',
  amountUnits: '120000',
  nonce: 'nonce-1',
  mandateContractId: '00mandate',
  status: 'proposed'
};
const proposalAuthorization = signedAuthorization({agreement: proposal, operation:'propose', requiredParties:['alice::party'], fixture, userId:'carel-agent', commandId:'command-proposal'});

function fakeFetch(responseBody = {updateId: 'update-1'}, status = 200) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({url, init});
    return {ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(responseBody)};
  };
  return {fetchImpl, calls};
}

const mandateTemplateId = '#confidential-agent-network:ConfidentialAgentNetwork:Mandate';
const proposalTemplateId = '#confidential-agent-network:ConfidentialAgentNetwork:Proposal';
const transactionWithCreated = (...events) => ({transaction: {events: events.map(event => ({CreatedEvent: {value: event}}))}});

test('submits a real JSON Ledger API command shape', async () => {
  const fake = fakeFetch(transactionWithCreated(
    {templateId: mandateTemplateId, contractId: '00next-mandate', createArgument: {
      owner: 'alice::party', counterparty: 'bob::party', assetId: 'canton:CBTC', transactionsUsed: '1'
    }}
  ));
  const client = createCantonLedgerApiClient({
    baseUrl: 'http://127.0.0.1:7575',
    mandateTemplateId,
    proposalTemplateId,
    partyPublicKeys: fixture.trustedPublicKeys,
    fetchImpl: fake.fetchImpl
  });
  const result = await client.submitAgreement({agreement, authorization});
  assert.equal(result.nextMandateContractId, '00next-mandate');
  assert.equal(fake.calls[0].url, 'http://127.0.0.1:7575/v2/commands/submit-and-wait-for-transaction');
  const body = JSON.parse(fake.calls[0].init.body);
  assert.deepEqual(body.actAs, ['alice::party', 'bob::party']);
  assert.equal(body.commands[0].ExerciseCommand.choice, 'Accept');
  assert.equal(body.commands[0].ExerciseCommand.contractId, '00proposal');
  assert.equal(body.commands[0].ExerciseCommand.templateId, proposalTemplateId);
  assert.deepEqual(body.commands[0].ExerciseCommand.choiceArgument, {});
  assert.equal(body.commands[0].CreateCommand, undefined);
});

test('proposes by exercising Mandate.Propose and never creating a contract', async () => {
  const fakeTree = fakeFetch(transactionWithCreated({templateId: proposalTemplateId, contractId: '00proposal-created', createArgument: {
    mandateId: '00mandate', owner: 'alice::party', counterparty: 'bob::party', proposerAgent: 'alice-agent::party',
    assetId: 'canton:CBTC', amountUnits: '120000', nonce: 'nonce-1'
  }}));
  const treeClient = createCantonLedgerApiClient({
    baseUrl: 'http://127.0.0.1:7575', mandateTemplateId, proposalTemplateId, partyPublicKeys: fixture.trustedPublicKeys, fetchImpl: fakeTree.fetchImpl
  });
  const result = await treeClient.submitProposal({proposal, authorization: proposalAuthorization});
  assert.equal(result.proposalContractId, '00proposal-created');
  assert.equal(fakeTree.calls[0].url, 'http://127.0.0.1:7575/v2/commands/submit-and-wait-for-transaction');
  const body = JSON.parse(fakeTree.calls[0].init.body);
  assert.deepEqual(body.actAs, ['alice::party']);
  assert.equal(body.commands[0].ExerciseCommand.choice, 'Propose');
  assert.equal(body.commands[0].ExerciseCommand.contractId, '00mandate');
  assert.equal(body.commands[0].ExerciseCommand.templateId, mandateTemplateId);
  assert.equal(body.commands[0].ExerciseCommand.choiceArgument.amountUnits, '120000');
  assert.equal(body.commands[0].CreateCommand, undefined);
});

test('rejects a response whose created Proposal terms do not match the command', async () => {
  const fake = fakeFetch(transactionWithCreated({templateId: proposalTemplateId, contractId: '00wrong', createArgument: {
    mandateId: '00mandate', owner: 'alice::party', counterparty: 'bob::party', proposerAgent: 'alice-agent::party',
    assetId: 'canton:CBTC', amountUnits: '120000', nonce: 'tampered'
  }}));
  const client = createCantonLedgerApiClient({
    baseUrl: 'http://127.0.0.1:7575', mandateTemplateId, proposalTemplateId,
    partyPublicKeys: fixture.trustedPublicKeys, fetchImpl: fake.fetchImpl
  });
  await assert.rejects(client.submitProposal({proposal, authorization: proposalAuthorization}), /nonce does not match/);
});

test('refuses to continue when acceptance does not return a replacement mandate CID', async () => {
  const client = createCantonLedgerApiClient({
    baseUrl: 'http://127.0.0.1:7575', mandateTemplateId, proposalTemplateId,
    partyPublicKeys: fixture.trustedPublicKeys, fetchImpl: fakeFetch({transaction: {events: []}}).fetchImpl
  });
  await assert.rejects(client.submitAgreement({agreement, authorization}), /exactly one created replacement Mandate/);
});

test('adapter refuses a ledger client that drops lifecycle contract IDs', async () => {
  const client = {verifyAuthorization: value => value.authorization, submitProposal: async () => ({}), submitAgreement: async () => ({})};
  await assert.rejects(submitProposalToCanton({client, proposal, authorization: proposalAuthorization}), /missing created Proposal CID/);
  await assert.rejects(submitAgreementToCanton({client, agreement, authorization}), /missing replacement Mandate CID/);
});

test('checks livez without inventing a network endpoint', async () => {
  const fake = fakeFetch({status: 'ok'});
  const client = createCantonLedgerApiClient({baseUrl: 'https://participant.example.invalid/', fetchImpl: fake.fetchImpl});
  await client.health();
  assert.equal(fake.calls[0].url, 'https://participant.example.invalid/livez');
});

test('requires explicit ledger URL and template id', async () => {
  assert.throws(() => createCantonLedgerApiClient(), /baseUrl required/);
  const client = createCantonLedgerApiClient({baseUrl: 'http://localhost:7575', fetchImpl: fakeFetch().fetchImpl, partyPublicKeys: fixture.trustedPublicKeys});
  await assert.rejects(client.submitAgreement({agreement, authorization}), /templateId required/);
});

test('rejects caller-controlled actAs and unsigned authorization', async () => {
  const client = createCantonLedgerApiClient({
    baseUrl: 'http://localhost:7575',
    mandateTemplateId,
    proposalTemplateId: '#pkg:Mod:Template',
    partyPublicKeys: fixture.trustedPublicKeys,
    fetchImpl: fakeFetch().fetchImpl
  });
  await assert.rejects(client.submitAgreement({agreement, authorization: {...authorization, actAs: ['alice::party']} }), /actAs must match/);
  await assert.rejects(client.submitAgreement({agreement, authorization: {...authorization, approvals: []} }), /cryptographic approvals/);
});

test('surfaces settlement errors from the participant', async () => {
  const fake = fakeFetch({message: 'command rejected'}, 400);
  const client = createCantonLedgerApiClient({
    baseUrl: 'http://localhost:7575',
    mandateTemplateId,
    proposalTemplateId: '#pkg:Mod:Template',
    partyPublicKeys: fixture.trustedPublicKeys,
    fetchImpl: fake.fetchImpl
  });
  await assert.rejects(client.submitAgreement({agreement, authorization}), /400: command rejected/);
});
