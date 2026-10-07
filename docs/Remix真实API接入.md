# Remix 真实 API 接入（免费探测阶段）

已接入官方端点 https://api.remix.live/mcp/x402-http 。

- GET /api/remix：实时请求官方 /info，返回服务信息及示例输入。
- POST /api/remix，JSON 为 {"input": {...}}：发送真实编译请求，返回 HTTP 状态、输入、响应、SHA-256 哈希及观察时间。
- 网站“真实服务探测”标签可以直接演示，不需要钱包。

2026-10-07 实测：信息接口正常，编译接口返回 HTTP 402，x402 v2 的要求是 Base 主网（8453）上的 0.01 USDC（10000 个最小单位）。此返回只证明当时接口可访问并提出了付款要求，不证明编译能力或输出准确。

当前未授权或支付真实资金，没有完成付费编译。网站拒绝 paymentSignature，避免本轮探测误用付款凭证。底层适配器保留了 PAYMENT-SIGNATURE 请求头入口，付款执行启用前需要核验最新报价、签名、实际结算和失败处理。

观察信息不是提供方签名的履约凭证，未自动存入数据库、未上链、未成为成功记录。后续付费执行应记录实际响应与结算信息，再由使用者选择签名、质押和发布。挑战仍为手动测试，尚未接入真实复验。

适配器：adapters/remix.mjs；API：web/app/api/remix/route.js；界面：web/components/RemixProbe.js。

服务编译费是真实 Base USDC；Demo 质押、查询、挑战费是本地 DCR；本地链 gas 使用测试 ETH。三者不要混淆。
