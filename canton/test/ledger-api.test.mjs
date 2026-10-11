import test from 'node:test';
import assert from 'node:assert/strict';
import {createCantonLedgerApiClient} from '../src/canton-ledger-api.mjs';

const agreement = {
  proposer: 'alice::party',
  counterparty: 'bob::party',
  proposerAgent: 'alice-agent::party',
  assetId: 'canton:CBTC',
  amountUnits: '120000',
  nonce: 'nonce-1',
  status: 'awaiting-ledger-authorization'
};
const authorization = {
  status: 'verified-by-wallet-or-participant',
  userId: 'carel-agent',
  commandId: 'command-1',
  actAs: ['alice::party', 'bob::party'],
  readAs: ['alice::party', 'bob::party']
};

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
    templateId: '#confidential-agent-network:ConfidentialAgentNetwork:SettlementAuthorization',
    fetchImpl: fake.fetchImpl
  });
  const result = await client.submitAgreement({agreement, authorization});
  assert.equal(result.updateId, 'update-1');
  assert.equal(fake.calls[0].url, 'http://127.0.0.1:7575/v2/commands/submit-and-wait');
  const body = JSON.parse(fake.calls[0].init.body);
  assert.deepEqual(body.actAs, authorization.actAs);
  assert.equal(body.commands[0].CreateCommand.createArguments.amountUnits, 120000);
});

test('checks livez without inventing a network endpoint', async () => {
  const fake = fakeFetch({status: 'ok'});
  const client = createCantonLedgerApiClient({baseUrl: 'https://participant.example.invalid/', fetchImpl: fake.fetchImpl});
  await client.health();
  assert.equal(fake.calls[0].url, 'https://participant.example.invalid/livez');
});

test('requires explicit ledger URL and template id', async () => {
  assert.throws(() => createCantonLedgerApiClient(), /baseUrl required/);
  const client = createCantonLedgerApiClient({baseUrl: 'http://localhost:7575', fetchImpl: fakeFetch().fetchImpl});
  await assert.rejects(client.submitAgreement({agreement, authorization}), /templateId required/);
});

test('rejects unauthorized actAs and private-key material', async () => {
  const client = createCantonLedgerApiClient({
    baseUrl: 'http://localhost:7575',
    templateId: '#pkg:Mod:Template',
    fetchImpl: fakeFetch().fetchImpl
  });
  await assert.rejects(client.submitAgreement({agreement, authorization: {...authorization, actAs: ['alice::party']} }), /missing required party/);
  await assert.rejects(client.submitAgreement({agreement, authorization: {...authorization, privateKey: 'never'} }), /private-key material/);
});

test('surfaces settlement errors from the participant', async () => {
  const fake = fakeFetch({message: 'command rejected'}, 400);
  const client = createCantonLedgerApiClient({
    baseUrl: 'http://localhost:7575',
    templateId: '#pkg:Mod:Template',
    fetchImpl: fake.fetchImpl
  });
  await assert.rejects(client.submitAgreement({agreement, authorization}), /400: command rejected/);
});
