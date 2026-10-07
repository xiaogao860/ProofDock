# 本地 Solidity 编译演示服务

## 服务已运行

编译服务：http://127.0.0.1:4320 。网站：http://127.0.0.1:4319 ，选择“本地编译服务”。

本机实际执行 solc v0.8.30+commit.73712a01；免费，不使用 Remix，不支付 USDC。网站免费编译无需钱包。保存待发布材料时使用钱包签名；发布、查询和挑战继续使用本地 DCR 与测试 ETH。

## 已完成实际示例

已通过本地服务实际编译 Counter.sol，使用公开本地演示账户发布并质押 10 DCR、挑战并锁定 5 DCR。后台在另一个进程重编译，ABI、创建字节码及运行字节码全部一致，裁定支持记录（状态 3）。

记录 ID：0x29d2b339c5e6f43f8785b9a088c3a65b7075fbc547b92211da6876361b660ddc

裁定交易：0x182a3df493447d2cc2fb3eb03bf5e7a96429ee6b5f2639448a959b95a9b33220

完整输入、输出和复验报告已导出为“ProofDock-本地编译完整示例.json”。原有记录未重置。

## Agent 调用

GET http://127.0.0.1:4320/health 或 /info 查看服务。

POST http://127.0.0.1:4320/compile ，Content-Type 为 application/json：

```json
{
  "sources": {
    "Counter.sol": {
      "content": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract Counter { uint256 public count; function increment() external { count++; } }"
    }
  },
  "version": "v0.8.30+commit.73712a01",
  "settings": {
    "optimizer": {"enabled": true, "runs": 200},
    "evmVersion": "shanghai"
  }
}
```

返回 success、版本、参数、ABI、metadata、创建/运行字节码以及编译诊断。语法错误返回 HTTP 200、success=false；请求格式和版本错误返回 400；繁忙返回 503。

网站代理 GET /api/local-compiler 返回服务与示例输入。POST /api/local-compiler 使用 {"action":"preview","input":上述对象} 免费执行。要保存可发布材料，提交 input、taskId、address、signature，签名消息为 `ProofDock local compile\n${taskId}\n${keccak256(JSON.stringify(input))}`。响应包含 publicationPayload；再由发布者签名并通过现有 POST /api 保存、调用合约 publish 质押。

## 约束与边界

服务只监听本机；固定编译器版本，最多 10 个源码文件、150 KB 输入；只读取内嵌源码，不读取本地磁盘或下载 import；最多同时执行两个编译进程，每次限时 20 秒。

服务执行与验证在不同进程中进行，但使用同一 solc 实现。这证明产物可重复，并不是独立机构背书、多编译器交叉验证或真实商业平台履约证明。记录会标记 local-solidity 和 local-demo，发布者签名不能称为第三方服务签名。

启动.command 会启动编译服务；停止.command 会停止它。完整重新启动仍会重置本地链和数据库，需要保留的材料应先导出。
