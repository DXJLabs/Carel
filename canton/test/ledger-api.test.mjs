import test from 'node:test';
import assert from 'node:assert/strict';
import {createCantonLedgerApiClient} from '../src/canton-ledger-api.mjs';
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

test('submits a real JSON Ledger API command shape', async () => {
  const fake = fakeFetch({updateId: 'update-1', completionOffset: 7});
  const client = createCantonLedgerApiClient({
    baseUrl: 'http://127.0.0.1:7575',
    proposalTemplateId: '#confidential-agent-network:ConfidentialAgentNetwork:Proposal',
    partyPublicKeys: fixture.trustedPublicKeys,
    fetchImpl: fake.fetchImpl
  });
  const result = await client.submitAgreement({agreement, authorization});
  assert.equal(result.updateId, 'update-1');
  assert.equal(fake.calls[0].url, 'http://127.0.0.1:7575/v2/commands/submit-and-wait');
  const body = JSON.parse(fake.calls[0].init.body);
  assert.deepEqual(body.actAs, ['alice::party', 'bob::party']);
  assert.equal(body.commands[0].ExerciseCommand.choice, 'Accept');
  assert.equal(body.commands[0].ExerciseCommand.contractId, '00proposal');
  assert.equal(body.commands[0].ExerciseCommand.templateId, '#confidential-agent-network:ConfidentialAgentNetwork:Proposal');
  assert.equal(body.commands[0].CreateCommand, undefined);
});

test('proposes by exercising Mandate.Propose and never creating a contract', async () => {
  const fake = fakeFetch({updateId: 'update-proposal', transaction: {}});
  const client = createCantonLedgerApiClient({
    baseUrl: 'http://127.0.0.1:7575',
    mandateTemplateId: '#confidential-agent-network:ConfidentialAgentNetwork:Mandate',
    partyPublicKeys: fixture.trustedPublicKeys,
    fetchImpl: fake.fetchImpl
  });
  const result = await client.submitProposal({proposal, authorization: proposalAuthorization});
  assert.equal(result.updateId, 'update-proposal');
  assert.equal(fake.calls[0].url, 'http://127.0.0.1:7575/v2/commands/submit-and-wait-for-transaction-tree');
  const body = JSON.parse(fake.calls[0].init.body);
  assert.deepEqual(body.actAs, ['alice::party']);
  assert.equal(body.commands[0].ExerciseCommand.choice, 'Propose');
  assert.equal(body.commands[0].ExerciseCommand.contractId, '00mandate');
  assert.equal(body.commands[0].ExerciseCommand.templateId, '#confidential-agent-network:ConfidentialAgentNetwork:Mandate');
  assert.equal(body.commands[0].CreateCommand, undefined);
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
    proposalTemplateId: '#pkg:Mod:Template',
    partyPublicKeys: fixture.trustedPublicKeys,
    fetchImpl: fake.fetchImpl
  });
  await assert.rejects(client.submitAgreement({agreement, authorization}), /400: command rejected/);
});
