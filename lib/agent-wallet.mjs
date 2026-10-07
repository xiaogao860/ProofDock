import fs from 'node:fs';
import path from 'node:path';
import {ethers} from 'ethers';
import {config,dataRoot} from './store.mjs';
export const agentWalletPath=()=>path.join(dataRoot(),'agent-wallet.json');
export function loadAgentWallet(){
 const cfg=config();
 if(cfg.chainId!==31337||cfg.rpc!=='http://127.0.0.1:8545')throw Error('Agent 钱包仅允许 ProofDock 本地测试链');
 const saved=JSON.parse(fs.readFileSync(agentWalletPath(),'utf8'));
 if(saved.chainId!==31337)throw Error('Agent 钱包网络不匹配');
 const wallet=new ethers.Wallet(saved.privateKey);
 if(wallet.address!==saved.address)throw Error('Agent 钱包地址不匹配');
 return wallet;
}
export async function connectAgentWallet(){
 const wallet=loadAgentWallet(),cfg=config();
 const provider=new ethers.JsonRpcProvider(cfg.rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=100;
 try{if((await provider.getNetwork()).chainId!==31337n)throw Error('RPC 网络不匹配');return {wallet:wallet.connect(provider),provider,cfg};}catch(e){provider.destroy();throw e;}
}
