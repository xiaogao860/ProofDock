import ganache from 'ganache';
const server=ganache.server({chain:{chainId:31337,hardfork:'shanghai'},wallet:{deterministic:true,totalAccounts:8},server:{ws:true},logging:{quiet:true}});
await server.listen(8545,'127.0.0.1'); console.log('ProofDock 本地链 http://127.0.0.1:8545');
