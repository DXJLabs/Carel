import {InMemoryProposalBook} from './src/workflow.mjs';
import {submitAgreementToCanton} from './src/canton-adapter.mjs';
import {createCantonLedgerApiClient, cantonLedgerConfigFromEnv} from './src/canton-ledger-api.mjs';
const now = Date.now();
const common = {allowedAssets:['canton:CBTC'], maxAmountUnits:'500000', maxTransactions:'1', expiresAt:now+3600000};
const alice = {...common,id:'alice-mandate',owner:'alice::party',agentId:'alice-agent',allowedActions:['propose'],allowedCounterparties:['bob::party']};
const bob = {...common,id:'bob-mandate',owner:'bob::party',agentId:'bob-agent',allowedActions:['accept'],allowedCounterparties:['alice::party']};
const book = new InMemoryProposalBook();
const proposal = book.create({mandate:alice,assetId:'canton:CBTC',amountUnits:'120000',counterparty:'bob::party',nonce:'demo-1',now});
const agreement = book.accept({proposal,mandate:bob,now});
const authorization = {status:'verified-by-wallet-or-participant',userId:'carel-demo',commandId:'demo-command-1',actAs:[alice.owner,bob.owner],readAs:[alice.owner,bob.owner]};
const config = cantonLedgerConfigFromEnv();
const client = config.baseUrl ? createCantonLedgerApiClient(config) : null;
const authorizedAgreement = book.authorize({agreement,authorization,now});
console.log(JSON.stringify({proposal,agreement:authorizedAgreement,ledgerConfigured:Boolean(client)},null,2));
try { await submitAgreementToCanton({client,agreement:authorizedAgreement,authorization}); }
catch(err) { console.log('SAFE STOP:',err.message); }
