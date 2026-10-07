import solc from 'solc';
let input='';for await(const chunk of process.stdin)input+=chunk;
try{const request=JSON.parse(input);const version='v'+solc.version().split('.Emscripten')[0];if(request.version!==version)throw Error('UNSUPPORTED_VERSION');const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:request.sources,settings:{...request.settings,outputSelection:{'*':{'*':['abi','metadata','evm.bytecode.object','evm.deployedBytecode.object']}}}})));process.stdout.write(JSON.stringify({version,output}));}catch(e){process.stderr.write(e.message);process.exitCode=1;}
