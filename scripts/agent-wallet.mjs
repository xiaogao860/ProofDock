import fs from 'node:fs';
import {ethers} from 'ethers';
import {config,dataRoot} from '../lib/store.mjs';
import {agentWalletPath,connectAgentWallet} from '../lib/agent-wallet.mjs';
const mode=process.argv[2]||'status';if(!['create','status'].includes(mode))throw Error('用法：agent-wallet.mjs create|status');
const cfg=config();if(cfg.chainId!==31337||cfg.rpc!=='http://127.0.0.1:8545')throw Error('仅允许本地测试链');
if(mode==='create'&&!fs.existsSync(agentWalletPath())){fs.mkdirSync(dataRoot(),{recursive:true});const wallet=ethers.Wallet.createRandom();fs.writeFileSync(agentWalletPath(),JSON.stringify({address:wallet.address,privateKey:wallet.privateKey,chainId:31337,createdAt:new Date().toISOString()},null,2),{flag:'wx',mode:0o600});}
if(!fs.existsSync(agentWalletPath()))throw Error('尚未创建 Agent 钱包');fs.chmodSync(agentWalletPath(),0o600);
const {wallet,provider}=await connectAgentWallet();
try{const admin=await provider.getSigner(0);if((await admin.getAddress()).toLowerCase()!==cfg.accounts[0].toLowerCase())throw Error('部署账户不匹配');const token=new ethers.Contract(cfg.token,cfg.tokenAbi,admin);if(await token.symbol()!=='DCR'||await token.decimals()!==18n)throw Error('测试代币不匹配');
if(mode==='create'){const eth=await provider.getBalance(wallet.address),dcr=await token.balanceOf(wallet.address);if(eth<ethers.parseEther('2'))await(await admin.sendTransaction({to:wallet.address,value:ethers.parseEther('2')-eth})).wait();if(dcr<ethers.parseEther('1000'))await(await token.transfer(wallet.address,ethers.parseEther('1000')-dcr)).wait();}
const message=`ProofDock agent wallet self-check ${crypto.randomUUID()}`;if(ethers.verifyMessage(message,await wallet.signMessage(message))!==wallet.address)throw Error('签名自检失败');
console.log(JSON.stringify({address:wallet.address,chainId:31337,rpc:cfg.rpc,ETH:ethers.formatEther(await provider.getBalance(wallet.address)),DCR:ethers.formatEther(await token.balanceOf(wallet.address)),token:cfg.token,signatureSelfCheck:true,privateKeyPrinted:false},null,2));
}finally{provider.destroy();}
