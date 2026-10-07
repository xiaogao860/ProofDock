# ProofDock Agent 独立钱包

已创建并核验的公开地址：`0x654B70e454D6aD4d6B20941A4D8ED3B1333A5803`。

- 网络：本地 Ganache，chainId 31337。
- RPC：http://127.0.0.1:8545。
- 创建后余额：2 测试 ETH、1,000 DCR。
- 签名自检：通过。
- DCR 地址：`0xe78A0F7E598Cc8b0Bb87894B0F60dD2a88d6a8Ab`。

私钥存放在项目 `data/agent-wallet.json`，文件权限 600，已被 Git 忽略。本文件不包含私钥。私钥为本地明文文件，当前适用于本地测试资金。

项目已提供 `lib/agent-wallet.mjs`，服务端通过 `connectAgentWallet()` 取得 wallet/provider/cfg。调用者使用完毕需要 provider.destroy()。加载器仅允许固定本地 RPC 与 chainId 31337。

在项目目录运行：

```sh
npm run agent:wallet:status
```

查看公开地址、余额和签名自检，不输出私钥。

```sh
npm run agent:wallet:create
```

首次创建；已有钱包则复用，并将不足部分补到 2 ETH / 1,000 DCR，不替换已有私钥。创建命令有补测试资金的副作用，普通检查使用 status。

当前完成钱包创建、资金准备和服务端加载接口；自动查询付款、发布质押与交易排队尚未接入。无需把此钱包导入 MetaMask。重置本地链会清除余额，需重新补测试资金；删除私钥文件会失去该钱包的签名能力。
