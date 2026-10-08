import {ethers} from 'ethers';

export const STATUS_LABELS = {
  published: '已发布 · 未复验', challenged: '挑战处理中', verified: '复验支持',
  invalidated: '复验发现差异', exited: '已退出质押', unpublished: '未发布'
};
export function readableError(error) {
  const code = error.code || error.info?.error?.code;
  if (code === 4001 || code === 'ACTION_REJECTED') return '操作已取消。';
  if (code === 'INSUFFICIENT_FUNDS') return 'ETH 余额不足。';
  const reason = error.info?.error?.data?.reason || error.reason;
  const contractErrors = {'not ready': '退出等待时间尚未结束，或记录正在争议中。', 'no credit': '暂无可领取资金。', 'not expired': '挑战尚未达到超时退款时间。', 'unavailable': '记录当前状态不可查询或挑战，请刷新记录。', 'validator only': '当前钱包没有手动裁定权限。'};
  if (contractErrors[reason]) return contractErrors[reason];
  return error.reason || error.shortMessage || error.message || '操作未完成，请重试。';
}
export function createProofDockClient({cfg, ethereum, fetcher = fetch, onEvent = () => {}}) {
  let provider;
  const emit = (stage, title, details = {}) => onEvent({id: crypto.randomUUID(), time: new Date().toISOString(), stage, title, details});
  async function walletRequest(input) {
    const started = performance.now();
    const interactive = ['personal_sign', 'eth_sendTransaction'].includes(input.method);
    if (interactive) emit('rpc-start', `钱包请求 ${input.method}`, {method: input.method});
    try {
      const value = await ethereum.request(input);
      const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
      if (interactive || elapsedMs >= 500) emit('rpc-end', `钱包返回 ${input.method}`, {
        method: input.method, elapsedMs,
        ...(input.method === 'eth_sendTransaction' ? {transactionHash: value} : {})
      });
      return value;
    } catch (error) {
      emit('rpc-error', `钱包请求失败 ${input.method}`, {method: input.method,
        elapsedMs: Math.round((performance.now() - started) * 100) / 100, code: error.code});
      throw error;
    }
  }
  // Separate read-only local chain observation from the wallet's response path.
  async function watchChain(ctx, contract, method, args) {
    if (cfg.chainId !== 31337 || !/^http:\/\/(127\.0\.0\.1|localhost):8545\/?$/.test(cfg.rpc)) return () => {};
    let stopped = false, timer, busy = false;
    const call = async (method, params = []) => {
      const response = await fetch(cfg.rpc, {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}), signal: AbortSignal.timeout(3000)});
      const value = await response.json(); if (value.error) throw new Error(value.error.message); return value.result;
    };
    let cursor;
    try { cursor = Number(BigInt(await call('eth_blockNumber'))) + 1; } catch { return () => {}; }
    const destination = (await contract.getAddress()).toLowerCase();
    const data = contract.interface.encodeFunctionData(method, args).toLowerCase();
    const started = performance.now();
    const poll = async () => {
      if (stopped || busy) return; busy = true;
      try {
        const latest = Number(BigInt(await call('eth_blockNumber')));
        for (; cursor <= latest && !stopped; cursor++) {
          const block = await call('eth_getBlockByNumber', [ethers.toQuantity(cursor), true]);
          const tx = block?.transactions.find(tx => tx.from.toLowerCase() === ctx.address.toLowerCase()
            && tx.to?.toLowerCase() === destination && tx.input.toLowerCase() === data);
          if (tx) {
            emit('chain-observed', '本地链已收到该交易', {method, transactionHash: tx.hash,
              blockNumber: cursor, elapsedMs: Math.round(performance.now() - started)});
            stopped = true; clearInterval(timer); break;
          }
        }
      } catch (error) { /* Observation failures do not affect the wallet operation. */ }
      finally { busy = false; }
      if (performance.now() - started > 120000) {stopped = true; clearInterval(timer);}
    };
    timer = setInterval(poll, 1000);
    return () => {stopped = true; clearInterval(timer);};
  }

  async function request(path, init = {}, trace = true) {
    if (trace) emit('request', `${init.method || 'GET'} ${path.split('?')[0]}`);
    const response = await fetcher(path, {cache: 'no-store', ...init});
    let body;
    try { body = await response.json(); } catch { throw new Error('服务未返回有效数据。'); }
    if (trace) emit(response.ok ? 'response' : 'error', `HTTP ${response.status}`, {path: path.split('?')[0]});
    if (!response.ok) {
      const error = new Error(typeof body.error === 'string' ? body.error : body.error?.message || '请求失败');
      error.code = body.error?.code; error.status = response.status; throw error;
    }
    return body;
  }
  const post = (path, body) => request(path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  async function assertWallet(address) {
    if (!ethereum) throw new Error('未检测到钱包扩展。');
    const chain = Number(BigInt(await walletRequest({method: 'eth_chainId'})));
    if (chain !== cfg.chainId) throw new Error(`请切换到 ProofDock 本地链 ${cfg.chainId}。`);
    const accounts = await walletRequest({method: 'eth_accounts'});
    if (!accounts.length) throw new Error('请先连接钱包。');
    if (address && accounts[0].toLowerCase() !== address.toLowerCase()) throw new Error('钱包账户已变化，请重新开始当前操作。');
    return ethers.getAddress(accounts[0]);
  }
  async function context() {
    const address = await assertWallet();
    provider ||= new ethers.BrowserProvider({request: walletRequest}, 'any', {cacheTimeout: -1});
    provider.pollingInterval = 200;
    const signer = await provider.getSigner(address);
    return {address, signer, provider, token: new ethers.Contract(cfg.token, cfg.tokenAbi, signer), dock: new ethers.Contract(cfg.dock, cfg.dockAbi, signer)};
  }
  async function sign(ctx, message, title) {
    await assertWallet(ctx.address);
    emit('wallet', title, {address: ctx.address});
    // Explicit personal_sign avoids an extra account request during a pending operation.
    const signature = await walletRequest({method: 'personal_sign', params: [ethers.hexlify(ethers.toUtf8Bytes(message)), ctx.address]});
    await assertWallet(ctx.address);
    emit('signed', '钱包签名已返回');
    return signature;
  }
  async function transaction(ctx, contract, method, args, title) {
    await assertWallet(ctx.address);
    const gas = await contract[method].estimateGas(...args);
    emit('wallet', title, {method, estimatedGas: gas.toString()});
    const stopWatching = await watchChain(ctx, contract, method, args);
    let tx;
    try { tx = await contract[method](...args); }
    finally { stopWatching(); }
    emit('pending', '交易对象已返回，等待链上确认', {transactionHash: tx.hash});
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) throw new Error('交易未成功，请检查链上结果。');
    emit('confirmed', title + '成功', {transactionHash: receipt.hash});
    return receipt;
  }
  async function approve(ctx, amount) {
    const balance = await ctx.token.balanceOf(ctx.address);
    if (balance < amount) throw new Error(`DCR 余额不足：需要 ${ethers.formatEther(amount)} DCR，当前 ${ethers.formatEther(balance)} DCR。`);
    if (await ctx.provider.getBalance(ctx.address) === 0n) throw new Error('ETH 余额不足。');
    if (await ctx.token.allowance(ctx.address, cfg.dock) < amount) await transaction(ctx, ctx.token, 'approve', [cfg.dock, amount], '代币授权');
  }
  async function compile(input, save = false) {
    let body = {action: 'preview', input};
    let owner;
    if (save) {
      const ctx = await context(); owner = ctx.address;
      const taskId = crypto.randomUUID();
      const signature = await sign(ctx, `ProofDock local compile\n${taskId}\n${ethers.id(JSON.stringify(input))}`, '签名保存');
      body = {input, taskId, address: owner, signature};
    }
    const result = await post('/api/local-compiler', body);
    emit(result.observation.executionStatus === 'COMPILED' ? 'compiled' : 'error', result.observation.executionStatus === 'COMPILED' ? '编译成功' : '编译失败', {executionId: result.executionId, elapsedMs: result.observation.elapsedMs});
    return {...result, owner};
  }
  async function publish(payload, owner) {
    if (!payload || payload.demo !== false || payload.executionStatus !== 'COMPILED') throw new Error('请先编译并签名保存。');
    const ctx = await context();
    if (!owner || ctx.address.toLowerCase() !== owner.toLowerCase()) throw new Error('请连接保存这份执行材料的钱包。');
    const id = ethers.id(payload.taskId), evidence = ethers.id(JSON.stringify(payload));
    const record = await ctx.dock.records(id);
    if (Number(record.state) > 0) {
      if (record.publisher.toLowerCase() === ctx.address.toLowerCase() && record.evidence === evidence) {
        emit('confirmed', '该材料已经发布，未重复质押', {recordId: id}); return {id, evidence, alreadyPublished: true};
      }
      throw new Error('这条任务已经使用，请重新执行。');
    }
    const amount = await ctx.dock.STAKE();
    await approve(ctx, amount);
    const signature = await sign(ctx, `ProofDock evidence:${evidence}`, '签名完整证据材料');
    const row = await post('/api', {payload, address: ctx.address, signature});
    if (row.id !== id || row.evidence !== evidence) throw new Error('存证摘要与原材料不一致，已停止发布。');
    await transaction(ctx, ctx.dock, 'publish', [row.id, row.evidence], `发布并质押 ${ethers.formatEther(amount)} DCR`);
    return row;
  }
  async function quote(id) {
    const ctx = await context();
    const result = await request(`/api/v1/records/${id}/quote?address=${ctx.address}`);
    if (result.payment.chainId !== cfg.chainId || result.payment.token.toLowerCase() !== cfg.token.toLowerCase()) throw new Error('报价网络或代币与当前部署不匹配。');
    return result;
  }
  async function readEvidence(id) {
    const ctx = await context();
    const q = await quote(id);
    if (q.readAuthorization.address.toLowerCase() !== ctx.address.toLowerCase()) throw new Error('报价钱包不匹配。');
    if (q.access.paymentRequired) {
      const amount = BigInt(q.payment.amountBaseUnits);
      // Use the repository quote calldata, while checking its chain, target and method.
      const tx = q.payment.transactions.find(t => t.purpose === 'pay-query');
      if (!tx || tx.to.toLowerCase() !== cfg.dock.toLowerCase() || BigInt(tx.value) !== 0n) throw new Error('付款报价不匹配。');
      const decoded = new ethers.Interface(cfg.dockAbi).decodeFunctionData('query', tx.data);
      if (decoded[0] !== id || decoded[1] !== q.access.queryId) throw new Error('付款记录编号不匹配。');
      await approve(ctx, amount);
      await transaction(ctx, ctx.dock, 'query', [id, q.access.queryId], `支付查询费 ${q.payment.amount} DCR`);
    } else emit('access', '付款凭证已确认', {queryId: q.access.queryId});
    // A fresh quote extends the authorization and recovers the actual on-chain receipt after payment.
    const current = await quote(id);
    if (current.access.paymentRequired) throw new Error('付款凭证尚未确认，请刷新后再读取。');
    const signature = await sign(ctx, current.readAuthorization.message, '签名读取已付款材料 · 不扣费');
    const result = await post(current.readAuthorization.endpoint, {address: ctx.address, queryId: current.access.queryId, expiresAt: current.readAuthorization.expiresAt, signature});
    emit('delivered', '完整证据已交付', {recordId: id, queryId: result.queryId});
    return result;
  }
  async function challenge(id) {
    const ctx = await context(), record = await ctx.dock.records(id);
    if (![1, 3].includes(Number(record.state))) throw new Error('当前记录状态不能发起新挑战。');
    await approve(ctx, await ctx.dock.BOND());
    // The existing contract requires a nonzero marker; bind it to the record being reverified.
    const marker = ethers.solidityPackedKeccak256(
      ['string', 'uint256', 'address', 'bytes32', 'bytes32'],
      ['ProofDock reverify v1', cfg.chainId, cfg.dock, id, record.evidence]
    );
    return transaction(ctx, ctx.dock, 'challenge', [id, marker], '质押挑战金并发起复验');
  }
  async function act(method, id, args = []) {
    const ctx = await context();
    if (!['withdraw', 'requestExit', 'exit', 'timeout', 'resolve'].includes(method)) throw new Error('不支持的操作。');
    if (method === 'resolve' && (await ctx.dock.validator()).toLowerCase() !== ctx.address.toLowerCase()) throw new Error('只有指定验证者可以手动裁定。');
    return transaction(ctx, ctx.dock, method, id ? [id, ...args] : args, {withdraw: '领取资金', requestExit: '申请退出质押', exit: '退出质押', timeout: '结束超时挑战', resolve: '提交手动裁定'}[method]);
  }
  async function balances() {
    const ctx = await context();
    const [eth, dcr, credit] = await Promise.all([ctx.provider.getBalance(ctx.address), ctx.token.balanceOf(ctx.address), ctx.dock.credits(ctx.address)]);
    return {address: ctx.address, eth: ethers.formatEther(eth), dcr: ethers.formatEther(dcr), credit: ethers.formatEther(credit)};
  }
  async function parameters() {
    const rpc = new ethers.JsonRpcProvider(cfg.rpc, undefined, {cacheTimeout: -1});
    try {
      if (Number((await rpc.getNetwork()).chainId) !== cfg.chainId) throw new Error('本地链与部署配置不匹配。');
      const dock = new ethers.Contract(cfg.dock, cfg.dockAbi, rpc);
      const [stake, fee, bond, wait, validator] = await Promise.all([dock.STAKE(), dock.FEE(), dock.BOND(), dock.WAIT(), dock.validator()]);
      return {stake: ethers.formatEther(stake), fee: ethers.formatEther(fee), bond: ethers.formatEther(bond), wait: Number(wait), validator};
    } finally { rpc.destroy(); }
  }
  async function connect() {
    if (!ethereum) throw new Error('未检测到钱包扩展。');
    await ethereum.request({method: 'eth_requestAccounts'});
    if (Number(BigInt(await walletRequest({method: 'eth_chainId'}))) !== cfg.chainId) await addNetwork();
    return balances();
  }
  async function addNetwork() {
    if (!ethereum) throw new Error('请在安装钱包扩展的浏览器打开网站。');
    const chainId = ethers.toQuantity(cfg.chainId);
    try {
      await ethereum.request({method: 'wallet_switchEthereumChain', params: [{chainId}]});
    } catch (error) {
      if (error.code !== 4902) throw error;
      await ethereum.request({method: 'wallet_addEthereumChain', params: [{chainId, chainName: 'ProofDock Local', nativeCurrency: {name: 'Test Ether', symbol: 'ETH', decimals: 18}, rpcUrls: [cfg.rpc]}]});
      await ethereum.request({method: 'wallet_switchEthereumChain', params: [{chainId}]});
    }
    emit('network', '网络已切换', {chainId: cfg.chainId});
  }
  return {request, compile, publish, quote, readEvidence, challenge, act, balances, parameters, connect, addNetwork, dispose: () => provider?.destroy()};
}
