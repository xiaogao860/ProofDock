#!/bin/bash
source "$(dirname "$0")/scripts/runtime.sh"
for name in web validator compiler chain; do
 if [ -f ".pids/$name" ]; then
  pid="$(cat ".pids/$name")"
  command_text="$(ps -p "$pid" -o command= 2>/dev/null)"
  case "$command_text" in *services/solidity.mjs*|*scripts/validator.mjs*|*scripts/chain.mjs*|*next*4319*|*next-server*) kill "$pid" 2>/dev/null || true;; esac
  rm -f ".pids/$name"
 fi
done
echo "本项目进程已停止；再次启动会重置本地测试链。"
