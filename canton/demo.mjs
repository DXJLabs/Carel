import {InMemoryProposalBook} from './src/workflow.mjs';
import {submitAgreementToCanton} from './src/canton-adapter.mjs';
const now = Date.now();
const common = {allowedAssets:['canton:CBTC'], maxAmountUnits:'500000', expiresAt:now+3600000};
const alice = {...common,id:'alice-mandate',owner:'alice::party',agentId:'alice-agent',allowedActions:['propose'],allowedCounterparties:['bob::party']};
const bob = {...common,id:'bob-mandate',owner:'bob::party',agentId:'bob-agent',allowedActions:['accept'],allowedCounterparties:['alice::party']};
const book = new InMemoryProposalBook();
const proposal = book.create({mandate:alice,assetId:'canton:CBTC',amountUnits:'120000',counterparty:'bob::party',nonce:'demo-1',now});
const agreement = book.accept({proposal,mandate:bob,now});
console.log(JSON.stringify({proposal,agreement},null,2));
try { await submitAgreementToCanton({client:null,agreement,authorization:{status:'verified-by-wallet-or-participant'}}); }
catch(err) { console.log('EXPECTED SAFE STOP:',err.message); }
