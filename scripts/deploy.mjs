import fs from 'node:fs';import path from 'node:path';import solc from 'solc';import {ethers} from 'ethers';
const input={language:'Solidity',sources:{'ProofDock.sol':{content:fs.readFileSync('contracts/ProofDock.sol','utf8')}},settings:{evmVersion:'shanghai',optimizer:{enabled:true,runs:200},outputSelection:{'*':{'*':['abi','evm.bytecode']}}}};
const out=JSON.parse(solc.compile(JSON.stringify(input),{import:n=>({contents:fs.readFileSync(path.join('node_modules',n),'utf8')})}));
if(out.errors?.some(x=>x.severity==='error'))throw Error(JSON.stringify(out.errors));
const provider=new ethers.JsonRpcProvider('http://127.0.0.1:8545');const admin=await provider.getSigner(0);const validator=await provider.getSigner(3);
const build=async(name,args=[])=>{const c=out.contracts['ProofDock.sol'][name];const x=await new ethers.ContractFactory(c.abi,c.evm.bytecode.object,admin).deploy(...args);await x.waitForDeployment();return x;};
const token=await build('DemoCredit');const dock=await build('ProofDock',[await token.getAddress(),await validator.getAddress()]);
const accounts=[];for(let i=0;i<5;i++){const address=await(await provider.getSigner(i)).getAddress();accounts.push(address);if(i)await(await token.transfer(address,ethers.parseEther('1000'))).wait();}
fs.mkdirSync('web/public',{recursive:true});fs.writeFileSync('web/public/deployment.json',JSON.stringify({resetId:crypto.randomUUID(),chainId:31337,rpc:'http://127.0.0.1:8545',token:await token.getAddress(),dock:await dock.getAddress(),accounts,tokenAbi:out.contracts['ProofDock.sol'].DemoCredit.abi,dockAbi:out.contracts['ProofDock.sol'].ProofDock.abi},null,2));
fs.writeFileSync('data/deployment.json',fs.readFileSync('web/public/deployment.json'));console.log('合约已部署，演示账户各获 1000 DCR');
