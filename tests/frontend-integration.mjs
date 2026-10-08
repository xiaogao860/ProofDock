// Exercises the same client used by the UI against repository API handlers and an isolated chain.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import ganache from 'ganache';
import solc from 'solc';
import {ethers} from 'ethers';
import {createProofDockClient} from '../web/lib/proofdock-client.mjs';
import {GET as apiGet, POST as apiPost} from '../web/app/api/v1/[...path]/route.js';
import {POST as publishPost} from '../web/app/api/route.js';
import {GET as compilerGet, POST as compilerPost} from '../web/app/api/local-compiler/route.js';
import {processChallenge} from '../verification/process.mjs';
import {all} from '../lib/store.mjs';
import {sampleRequest} from '../adapters/remix.mjs';

const root = process.cwd(), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'proofdock-front-'));
const data = path.join(temp, 'data'); fs.mkdirSync(data);
const previousData = process.env.PROOFDOCK_DATA_DIR;
process.env.PROOFDOCK_DATA_DIR = data;
const server = ganache.server({chain: {chainId: 31337, hardfork: 'shanghai'}, wallet: {deterministic: true}, logging: {quiet: true}});
await server.listen(0, '127.0.0.1');
const rpc = `http://127.0.0.1:${server.address().port}`;
const provider = new ethers.JsonRpcProvider(rpc, undefined, {cacheTimeout: -1}); provider.pollingInterval = 50;
const clients = [];
try {
  const input = {language: 'Solidity', sources: {'ProofDock.sol': {content: fs.readFileSync(path.join(root, 'contracts/ProofDock.sol'), 'utf8')}}, settings: {evmVersion: 'shanghai', outputSelection: {'*': {'*': ['abi', 'evm.bytecode']}}}};
  const contracts = JSON.parse(solc.compile(JSON.stringify(input), {import: name => ({contents: fs.readFileSync(path.join(root, 'node_modules', name), 'utf8')})})).contracts['ProofDock.sol'];
  const admin = await provider.getSigner(0), publisher = await provider.getSigner(1), buyer = await provider.getSigner(2), validator = await provider.getSigner(3);
  async function deploy(name, args = []) { const c = contracts[name]; const contract = await new ethers.ContractFactory(c.abi, c.evm.bytecode.object, admin).deploy(...args); await contract.waitForDeployment(); return contract; }
  const token = await deploy('DemoCredit'), dock = await deploy('ProofDock', [await token.getAddress(), await validator.getAddress()]);
  const cfg = {chainId: 31337, rpc, token: await token.getAddress(), dock: await dock.getAddress(), tokenAbi: contracts.DemoCredit.abi, dockAbi: contracts.ProofDock.abi};
  fs.writeFileSync(path.join(data, 'deployment.json'), JSON.stringify(cfg));
  for (const signer of [publisher, buyer]) await (await token.transfer(await signer.getAddress(), ethers.parseEther('100'))).wait();
  process.chdir(temp);
  const fetcher = async (pathname, init = {}) => {
    const request = new Request('http://127.0.0.1:4319' + pathname, init);
    if (pathname.startsWith('/api/v1/')) return init.method === 'POST' ? apiPost(request) : apiGet(request);
    if (pathname === '/api/local-compiler') return init.method === 'POST' ? compilerPost(request) : compilerGet(request);
    if (pathname === '/api') return publishPost(request);
    throw new Error('Unexpected test route ' + pathname);
  };
  let index = 1, wrongNetwork = false, rejectNextSignature = false;
  const wallet = () => ethers.HDNodeWallet.fromPhrase('myth like bonus scare over problem client lizard pioneer submit female collect', undefined, `m/44'/60'/0'/0/${index}`);
  const ethereum = {request: async ({method, params = []}) => {
    if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [wallet().address];
    if (method === 'eth_chainId' && wrongNetwork) return '0x1';
    if (method === 'wallet_switchEthereumChain') { assert.equal(params[0].chainId, '0x7a69'); wrongNetwork = false; return null; }
    if (method === 'personal_sign') {
      if (rejectNextSignature) { rejectNextSignature = false; const error = new Error('User rejected'); error.code = 4001; throw error; }
      assert.equal(params[1].toLowerCase(), wallet().address.toLowerCase()); return wallet().signMessage(ethers.getBytes(params[0]));
    }
    return server.provider.request({method, params});
  }};
  const events = [], client = createProofDockClient({cfg, ethereum, fetcher, onEvent: event => events.push(event)}); clients.push(client);
  const anonymous = createProofDockClient({cfg, fetcher}); clients.push(anonymous);
  wrongNetwork = true; await client.connect(); assert.equal(wrongNetwork, false, 'connect switches to the configured local chain');
  const catalog = await client.request('/api/v1/services'); assert(catalog.services.some(s => s.executionStatus === 'payment-disabled'));
  const params = await client.parameters(); assert.equal(params.stake, '10.0'); assert.equal(params.fee, '1.0'); assert.equal(params.bond, '5.0');
  const preview = await anonymous.compile(sampleRequest); assert.equal(preview.observation.executionStatus, 'COMPILED'); assert(!preview.publicationPayload);
  await assert.rejects(() => anonymous.connect(), /钱包/);
  const compiled = await client.compile(sampleRequest, true); assert(compiled.publicationPayload && compiled.owner);
  index = 2; await assert.rejects(() => client.publish(compiled.publicationPayload, compiled.owner), /钱包/); index = 1;
  const record = await client.publish(compiled.publicationPayload, compiled.owner); assert.equal(Number((await dock.records(record.id)).state), 1);
  const afterPublish = await token.balanceOf(compiled.owner);
  assert((await client.publish(compiled.publicationPayload, compiled.owner)).alreadyPublished); assert.equal(await token.balanceOf(compiled.owner), afterPublish);
  index = 2; const buyerAddress = wallet().address, beforePayment = await token.balanceOf(buyerAddress);
  rejectNextSignature = true; await assert.rejects(() => client.readEvidence(record.id), error => error.code === 4001);
  assert.equal(beforePayment - await token.balanceOf(buyerAddress), ethers.parseEther('1'), 'payment survives a cancelled read signature');
  const delivered = await client.readEvidence(record.id); assert.equal(delivered.evidence.executionId, compiled.executionId);
  await client.readEvidence(record.id); assert.equal(beforePayment - await token.balanceOf(buyerAddress), ethers.parseEther('1'), 'repeated evidence reads must not charge again');
  wrongNetwork = true; await assert.rejects(() => client.challenge(record.id, '对照原始编译产物'), /31337/); wrongNetwork = false;
  await client.challenge(record.id, '对照原始编译产物'); assert.equal(Number((await dock.records(record.id)).state), 2);
  const material = all('records').find(row => row.id === record.id);
  const job = await processChallenge({cfg, provider, material, recordId: record.id}); assert.equal(job.report.outcome, 1); assert.equal(Number((await dock.records(record.id)).state), 3);
  index = 1; await client.act('requestExit', record.id); await assert.rejects(() => client.act('exit', record.id));
  await provider.send('evm_increaseTime', [61]); await provider.send('evm_mine', []);
  await client.act('exit', record.id); assert.equal(Number((await dock.records(record.id)).state), 5);
  await client.act('withdraw'); assert.equal(await dock.credits(compiled.owner), 0n);
  assert(events.some(event => event.stage === 'confirmed')); assert(events.some(event => event.stage === 'delivered')); assert(!events.some(event => 'signature' in event.details));
  console.log('PASS: frontend client + repository handlers: catalog, compiler, wallet/network checks, signed publish, duplicate publish, cancelled read recovery, paid receipt reuse, challenge/recompile, exit and withdrawal. Isolated test chain only.');
} finally {
  clients.forEach(client => client.dispose()); provider.destroy(); await server.close(); process.chdir(root);
  if (previousData === undefined) delete process.env.PROOFDOCK_DATA_DIR; else process.env.PROOFDOCK_DATA_DIR = previousData;
  if (!path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Unsafe test cleanup path');
  fs.rmSync(temp, {recursive: true, force: true});
}
