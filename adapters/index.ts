export interface ExecutionRequest { taskId:string; serviceId:string; version:string; input:unknown; settings:unknown; }
export interface Receipt { taskId:string; inputHash:string; outputHash:string; version:string; signerType:'provider'|'adapter'; signature:string; }
export interface ServiceAdapter { getCapabilities():Promise<unknown>; execute(request:ExecutionRequest):Promise<Receipt>; getReceipt(taskId:string):Promise<Receipt>; health():Promise<unknown>; }
export interface VerificationAdapter { prepareVerification(receipt:Receipt):Promise<unknown>; verify(receipt:Receipt):Promise<unknown>; getReport(taskId:string):Promise<unknown>; }
export const providers=[{id:'local-solidity',name:'本地 Solidity 编译',status:'local_demo',execution:'implemented'},{id:'remix',name:'Remix',status:'payment_ready',execution:'disabled_by_default'},{id:'onecompiler',name:'OneCompiler',status:'not_implemented'}];

// Implemented local verification: verification/verify.mjs and scripts/validator.mjs.
// HTTP transport and observed receipts: adapters/remix.mjs and /api/remix.
// Interfaces above describe a future unified SDK, not provider-signed receipts.
