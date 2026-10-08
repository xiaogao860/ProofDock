import assert from 'node:assert/strict';
import {createProofDockClient} from '../web/lib/proofdock-client.mjs';

const cfg = {chainId: 31337, rpc: 'http://127.0.0.1:8545'};
for (const scenario of ['known', 'unknown', 'cancelled', 'unavailable']) {
  const calls = [];
  const ethereum = {request: async input => {
    calls.push(input);
    if (calls.length === 1 && scenario !== 'known') {
      const error = new Error(scenario);
      error.code = {unknown: 4902, cancelled: 4001, unavailable: -32603}[scenario];
      throw error;
    }
    return null;
  }};
  const events = [];
  const client = createProofDockClient({cfg, ethereum, onEvent: event => events.push(event)});
  try {
    if (['cancelled', 'unavailable'].includes(scenario)) {
      await assert.rejects(client.addNetwork(), error => error.message === scenario);
      assert.deepEqual(calls.map(call => call.method), ['wallet_switchEthereumChain']);
      assert.equal(events.length, 0);
    } else {
      await client.addNetwork();
      assert.deepEqual(calls.map(call => call.method), scenario === 'known'
        ? ['wallet_switchEthereumChain']
        : ['wallet_switchEthereumChain', 'wallet_addEthereumChain', 'wallet_switchEthereumChain']);
      assert.deepEqual(calls.at(-1).params, [{chainId: '0x7a69'}]);
      if (scenario === 'unknown') assert.deepEqual(calls[1].params[0].rpcUrls, [cfg.rpc]);
      assert.equal(events.at(-1).stage, 'network');
    }
  } finally { client.dispose(); }
}
console.log('PASS: known network switch, unknown network registration, cancellation and unrelated wallet errors.');
