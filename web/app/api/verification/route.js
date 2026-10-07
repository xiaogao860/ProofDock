import fs from 'node:fs';import path from 'node:path';
import {all,dataRoot} from '../../../../lib/store.mjs';
export const dynamic='force-dynamic';
export async function GET(req){const id=new URL(req.url).searchParams.get('id');let worker={active:false};try{worker=JSON.parse(fs.readFileSync(path.join(dataRoot(),'validator-status.json'),'utf8'));worker.active=worker.active&&Date.now()-Date.parse(worker.updatedAt)<10000;}catch{}return Response.json({worker,reports:all('reports').filter(r=>!id||r.recordId===id).map(r=>({...r,report:{...r.report,compilerErrors:r.report.compilerErrors?.map(x=>({severity:x.severity,errorCode:x.errorCode}))}}))});}
