import {generateKeyPairSync, sign} from 'node:crypto';
import {authorizationMessage} from '../src/mandate.mjs';

export function makeAuthorizationFixture(parties = ['alice', 'bob']) {
  const privateKeys = {};
  const trustedPublicKeys = {};
  for (const party of parties) {
    const pair = generateKeyPairSync('ed25519');
    privateKeys[party] = pair.privateKey;
    trustedPublicKeys[party] = pair.publicKey.export({format: 'der', type: 'spki'}).toString('base64');
  }
  return {privateKeys, trustedPublicKeys};
}

export function signedAuthorization({agreement, operation, requiredParties, fixture, userId = 'carel-test', commandId = 'command-1'}) {
  const authorization = {userId, commandId};
  const message = Buffer.from(authorizationMessage({authorization, agreement, operation, requiredParties}));
  return {
    ...authorization,
    approvals: requiredParties.map(party => ({
      party,
      signature: sign(null, message, fixture.privateKeys[party]).toString('base64')
    }))
  };
}
