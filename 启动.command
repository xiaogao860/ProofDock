#!/bin/bash
set -e
source "$(dirname "$0")/scripts/runtime.sh"
mkdir -p .logs .pids
if ! curl -sf http://127.0.0.1:4320/health >/dev/null; then
 nohup "$PROOFDOCK_NODE" services/solidity.mjs >.logs/compiler.log 2>&1 &
 echo $! >.pids/compiler
fi
if curl -sf http://127.0.0.1:4319 >/dev/null; then
 if [ ! -f .pids/validator ] || ! kill -0 "$(cat .pids/validator)" 2>/dev/null; then
  nohup "$PROOFDOCK_NODE" scripts/validator.mjs >.logs/validator.log 2>&1 &
  echo $! >.pids/validator
 fi
 open http://127.0.0.1:4319
 exit 0
fi
if lsof -iTCP:8545 -sTCP:LISTEN >/dev/null 2>&1; then
 echo "8545 已占用，请先停止占用的链或使用本项目停止脚本。"; exit 1
fi
nohup "$PROOFDOCK_NODE" scripts/chain.mjs >.logs/chain.log 2>&1 &
echo $! >.pids/chain
for n in {1..40}; do if curl -sf -X POST -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' http://127.0.0.1:8545 >/dev/null; then break; fi; sleep .25; done
rm -f data/records.json data/proofdock.sqlite data/proofdock.sqlite-shm data/proofdock.sqlite-wal
"$PROOFDOCK_NODE" scripts/deploy.mjs
nohup "$PROOFDOCK_NODE" scripts/validator.mjs >.logs/validator.log 2>&1 &
echo $! >.pids/validator
if [ ! -f web/.next/BUILD_ID ]; then "$PROOFDOCK_NODE" node_modules/next/dist/bin/next build web; fi
nohup "$PROOFDOCK_NODE" node_modules/next/dist/bin/next start web -H 127.0.0.1 -p 4319 >.logs/web.log 2>&1 &
echo $! >.pids/web
for n in {1..40}; do if curl -sf http://127.0.0.1:4319 >/dev/null; then open http://127.0.0.1:4319; echo "ProofDock 已启动；保持此终端打开，或使用停止.command。"; wait; exit 0; fi; sleep .5; done
echo "请查看 .logs/web.log"
