# ProofDock Agent HTTP API v1

地址：http://127.0.0.1:4319。仅本地演示，网络 31337。网站原有接口继续保留。

## 查询接口

| 方法与路径 | 用途 |
|---|---|
| GET /api/v1/services?q=solidity | 搜索服务，返回接入状态，免费 |
| GET /api/v1/records?serviceId=local-solidity&status=verified&limit=20&offset=0 | 公开摘要，分页，免费 |
| GET /api/v1/records/{recordId} | 摘要、已完成复验报告，免费 |
| GET /api/v1/records/{recordId}/quote?address={wallet} | 查询费用、已有付款、待签交易、读取签名文本，免费 |
| POST /api/v1/records/{recordId}/evidence | 验证付款与签名，返回完整证据 |

recordId、queryId 为 32 字节十六进制。limit 为 1–100，offset 为非负整数。status 可为 published、challenged、verified、invalidated、exited；unpublished 不对外列出。分页按记录 ID 排序，不是执行时间排序。公开摘要不包含输入、输出或发布者签名。

所有响应包含 apiVersion: "1"。错误格式：
```json
{"apiVersion":"1","error":{"code":"PAYMENT_REQUIRED","message":"没有对应付款","retryable":false}}
```
400 参数错误，401 签名无效或过期，402 未付款，404 不存在，409 状态不可购买或证据不匹配，413 请求过大，503 暂不可用。

## Agent 付款和读取流程

1. 查询 quote。access.paymentRequired=false 时使用已有 queryId，不再付款。
2. 需要付款时，检查 payment.chainId、token、amountBaseUnits、gasPayer。读取代币 allowance；不足时签署 approve-if-allowance-insufficient，再签署 pay-query，等待交易成功。
3. 由钱包对 readAuthorization.message 作 personal_sign/signMessage 签名。
4. POST evidence，JSON 字段为 address、queryId、expiresAt、signature。expiresAt 必须与报价一致，最长五分钟。
5. 超时或授权过期时重新获取 quote；已经付款会复用凭证，不再次扣费。

签名绑定协议版本、链 ID、合约、记录、付款编号、钱包和有效期。签名在有效期内可用于重读同一记录；本版不提供一次性消费随机数。报价本身不锁定链上状态，不执行付款。交易必须由使用者钱包或获得授权的 Agent 钱包签署；API 不接收私钥。

新查询费用为合约 FEE，当前 1 DCR；交易 gas 由付款账户承担。已有付款可读取其绑定记录，包括记录后来被挑战或退出的情况。新购买只接受 published/verified 状态。付款权益检查以链上 queries/queryRecords 为准，不信任客户端声称已付款。

## ethers 示例（已有付款时无需交易）

```js
const base = 'http://127.0.0.1:4319';
const address = await signer.getAddress();
const quote = await fetch(`${base}/api/v1/records/${recordId}/quote?address=${address}`).then(r => r.json());
if (quote.error) throw new Error(quote.error.message);
if (quote.access.paymentRequired) {
  // 先确认网络和使用者预算。token 为 ethers.Contract，使用同一个 signer。
  const fee = BigInt(quote.payment.amountBaseUnits);
  const dockAddress = quote.payment.transactions[1].to;
  if (await token.allowance(address, dockAddress) < fee) {
    const {to, data, value} = quote.payment.transactions[0];
    await (await signer.sendTransaction({to, data, value})).wait();
  }
  // sendTransaction 只传 to/data/value，不传工具返回的 purpose。
  const {to, data, value} = quote.payment.transactions[1];
  await (await signer.sendTransaction({to, data, value})).wait();
}
const signature = await signer.signMessage(quote.readAuthorization.message);
const response = await fetch(base + quote.readAuthorization.endpoint, {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({address, queryId: quote.access.queryId,
    expiresAt: quote.readAuthorization.expiresAt, signature})
});
const result = await response.json();
if (!response.ok) throw new Error(result.error.message);
console.log(result.evidence);
```

approve 示例也需仅提取 to/data/value：
```js
const {to, data, value} = quote.payment.transactions[0];
await (await signer.sendTransaction({to, data, value})).wait();
```

## 执行和发布接口

本次新增重点是查询闭环，执行和发布继续沿用已存在接口：
- GET /api/local-compiler：服务信息与样例。
- POST /api/local-compiler：action=preview 免费预览；签名执行传 input/address/taskId/signature。执行签名为 `ProofDock local compile\n{taskId}\n{ethers.id(JSON.stringify(input))}`，返回 executionId、observation、publicationPayload。同一任务及相同输入可重试。
- POST /api：传 payload=publicationPayload、address、signature；签名为 `ProofDock evidence:{ethers.id(JSON.stringify(payload))}`。返回 id/evidence。此操作仅保存材料；还需钱包调用合约 publish(id,evidence) 才算发布并质押。该旧接口错误格式仍为 error 字符串。
- GET /api/verification?id={recordId}：验证者状态与报告。

服务目录是接入状态声明，不是实时可用性探测。verified 仅代表该记录经过指定复验，不能推导未来履约保证。当前报价通过扫描历史 Queried 事件寻找凭证，适用于本地小规模演示；生产规模需索引与分页游标。此版没有限流、远程部署认证和智能账户自动授权。

## 验证

`node tests/agent-api.mjs` 在临时数据库及隔离测试链验证服务搜索、分页参数、摘要隐私、报价、未付款拒绝、付款后读取、错误签名、授权过期和凭证复用，不修改当前演示链。

## 无需理由的挑战

网页与客户端的挑战调用为 `client.challenge(recordId)`，不需要理由参数。钱包检查本地网络、记录状态和余额，必要时授权 DCR，再签署合约挑战交易并质押 BOND（当前 5 DCR）。挑战上链后，后台按原输入自动复编译，不要求挑战者提交新的输入或说明。

直接用 Agent 钱包调用当前合约时，先从 `dock.records(recordId)` 获取 evidence，然后自动生成复验标识：

```js
const record = await dock.records(recordId);
const marker = ethers.solidityPackedKeccak256(
  ['string', 'uint256', 'address', 'bytes32', 'bytes32'],
  ['ProofDock reverify v1', chainId, dockAddress, recordId, record.evidence]
);
// allowance 不足时先 approve(dockAddress, await dock.BOND())，并等待确认。
await (await dock.challenge(recordId, marker)).wait();
```

这是兼容现有合约的非零复验标识，写入原 `objection` 字段，不代表使用者填写了主观理由。挑战交易本身由钱包签名，不增加一次独立的文本签名。之后可用 `GET /api/verification?id={recordId}` 查询报告。
