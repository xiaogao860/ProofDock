import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ethers} from 'ethers';
import {connectAgentWallet} from '../lib/agent-wallet.mjs';
const base='http://127.0.0.1:4319';
const {wallet,provider,cfg}=await connectAgentWallet();
const signer=new ethers.NonceManager(wallet);
try{
 const token=new ethers.Contract(cfg.token,cfg.tokenAbi,signer),dock=new ethers.Contract(cfg.dock,cfg.dockAbi,signer);
 const stake=await dock.STAKE();assert.equal(stake,ethers.parseEther('10'),'本次只授权质押 10 DCR');
 const before={DCR:await token.balanceOf(wallet.address),ETH:await provider.getBalance(wallet.address)};
 assert(before.DCR>=stake,'DCR 不足');
 async function request(endpoint,body){const r=await fetch(base+endpoint,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});const value=await r.json();if(!r.ok)throw Error(`接口失败 ${r.status}: ${JSON.stringify(value)}`);return value;}
 const {sampleRequest:input}=await request('/api/local-compiler');
 const taskId=crypto.randomUUID();
 const executionSignature=await wallet.signMessage(`ProofDock local compile\n${taskId}\n${ethers.id(JSON.stringify(input))}`);
 const execution=await request('/api/local-compiler',{input,address:wallet.address,taskId,signature:executionSignature});
 assert.equal(execution.observation.executionStatus,'COMPILED');assert.equal(execution.observation.service,'local-solidity');
 const payload=execution.publicationPayload,evidence=ethers.id(JSON.stringify(payload));
 const signature=await wallet.signMessage(`ProofDock evidence:${evidence}`);
 assert.equal(ethers.verifyMessage(`ProofDock evidence:${evidence}`,signature),wallet.address);
 const record=await request('/api',{payload,address:wallet.address,signature});assert.equal(record.evidence,evidence);
 let approval=null;const receipts=[];
 if(await token.allowance(wallet.address,cfg.dock)<stake){const tx=await token.approve(cfg.dock,stake);const receipt=await tx.wait();assert.equal(receipt.status,1);approval=tx.hash;receipts.push(receipt);}
 const tx=await dock.publish(record.id,record.evidence),receipt=await tx.wait();assert.equal(receipt.status,1);receipts.push(receipt);
 const chainRecord=await dock.records(record.id);assert.equal(chainRecord.publisher,wallet.address);assert.equal(chainRecord.evidence,evidence);assert.equal(Number(chainRecord.state),1);
 const after={DCR:await token.balanceOf(wallet.address),ETH:await provider.getBalance(wallet.address)};assert.equal(before.DCR-after.DCR,stake);
 const gasCost=receipts.reduce((sum,r)=>sum+r.fee,0n);assert.equal(before.ETH-after.ETH,gasCost);
 const summary=await request(`/api/v1/records/${record.id}`);assert.equal(summary.record.status,'published');assert.equal(summary.record.publisher,wallet.address);
 const result={description:'Agent 独立钱包实际调用本地 Solidity 编译服务、签名存证、发布并质押；没有发起挑战',createdAt:new Date().toISOString(),chainId:cfg.chainId,wallet:wallet.address,taskId,recordId:record.id,evidenceHash:evidence,compilerVersion:execution.observation.input.version,compilationStatus:execution.observation.executionStatus,executionSignatureVerified:true,publicationSignatureVerified:true,approvalTransaction:approval,publishTransaction:tx.hash,chainState:1,status:'published',stakeDCR:ethers.formatEther(stake),balances:{before:{DCR:ethers.formatEther(before.DCR),ETH:ethers.formatEther(before.ETH)},after:{DCR:ethers.formatEther(after.DCR),ETH:ethers.formatEther(after.ETH)}},gasPaidETH:ethers.formatEther(gasCost),serviceEnvironment:'local-demo',providerSigned:false};
 fs.writeFileSync('data/agent-compile-publish.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
}finally{provider.destroy();}
