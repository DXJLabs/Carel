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
const config = cantonLedgerConfigFromEnv();
const client = config.baseUrl ? createCantonLedgerApiClient(config) : null;
const authorization = process.env.CANTON_AUTHORIZATION_JSON ? JSON.parse(process.env.CANTON_AUTHORIZATION_JSON) : null;
try {
  if (!client) throw new Error('Canton Ledger API URL is not configured; no on-ledger submission occurred');
  const authorizedAgreement = book.authorize({agreement,authorization,trustedPublicKeys:config.partyPublicKeys,now});
  console.log(JSON.stringify({proposal,agreement:authorizedAgreement,ledgerConfigured:true},null,2));
  await submitAgreementToCanton({client,agreement:authorizedAgreement,authorization});
} catch(err) { console.log('SAFE STOP:',err.message); }
