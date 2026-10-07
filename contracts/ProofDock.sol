// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
contract DemoCredit is ERC20 { constructor() ERC20("Demo Credit","DCR") {_mint(msg.sender,1000000 ether);} }
contract ProofDock is ReentrancyGuard {
 using SafeERC20 for IERC20;
 IERC20 public immutable token; address public immutable validator; address public immutable treasury;
 uint256 public constant STAKE=10 ether; uint256 public constant FEE=1 ether; uint256 public constant BOND=5 ether; uint256 public constant WAIT=60;
 struct Record {address publisher; bytes32 evidence; uint8 state; uint256 exitAt; address challenger; bytes32 objection; uint256 challengedAt;}
 mapping(bytes32=>Record) public records; mapping(bytes32=>address) public queries; mapping(bytes32=>bytes32) public queryRecords; mapping(address=>uint256) public credits;
 event Published(bytes32 indexed id,address indexed publisher,bytes32 evidence);
 event Queried(bytes32 indexed queryId,bytes32 indexed recordId,address indexed buyer);
 event Challenged(bytes32 indexed id,address challenger,bytes32 objection);
 event Resolved(bytes32 indexed id,uint8 outcome,bytes32 report);
 constructor(IERC20 t,address v){token=t;validator=v;treasury=msg.sender;}
 function publish(bytes32 id,bytes32 evidence) external nonReentrant {require(id!=bytes32(0)&&evidence!=bytes32(0),"empty");require(records[id].publisher==address(0),"duplicate");token.safeTransferFrom(msg.sender,address(this),STAKE);records[id]=Record(msg.sender,evidence,1,0,address(0),0,0);emit Published(id,msg.sender,evidence);}
 function query(bytes32 id,bytes32 q) external nonReentrant {Record storage r=records[id];require(r.state==1||r.state==3,"unavailable");require(q!=bytes32(0)&&queries[q]==address(0),"duplicate query");token.safeTransferFrom(msg.sender,address(this),FEE);queries[q]=msg.sender;queryRecords[q]=id;credits[r.publisher]+=FEE*70/100;credits[treasury]+=FEE*30/100;emit Queried(q,id,msg.sender);}
 function challenge(bytes32 id,bytes32 objection) external nonReentrant {Record storage r=records[id];require(r.state==1||r.state==3,"unavailable");require(objection!=0,"empty objection");token.safeTransferFrom(msg.sender,address(this),BOND);r.state=2;r.exitAt=0;r.challenger=msg.sender;r.objection=objection;r.challengedAt=block.timestamp;emit Challenged(id,msg.sender,objection);}
 function resolve(bytes32 id,uint8 outcome,bytes32 report) external {require(msg.sender==validator,"validator only");require(outcome>=1&&outcome<=3&&report!=0,"invalid");_resolve(id,outcome,report);}
 function timeout(bytes32 id) external {require(records[id].state==2&&block.timestamp>=records[id].challengedAt+300,"not expired");_resolve(id,3,keccak256("DEMO_TIMEOUT_NO_VERIFICATION"));}
 function _resolve(bytes32 id,uint8 outcome,bytes32 report) internal {Record storage r=records[id];require(r.state==2,"no challenge");if(outcome==1){r.state=3;credits[r.publisher]+=BOND;}else if(outcome==2){r.state=4;credits[r.challenger]+=BOND+STAKE;}else{r.state=1;credits[r.challenger]+=BOND;}r.challenger=address(0);emit Resolved(id,outcome,report);}
 function requestExit(bytes32 id) external {Record storage r=records[id];require(r.publisher==msg.sender&&(r.state==1||r.state==3),"not allowed");require(r.exitAt==0,"requested");r.exitAt=block.timestamp+WAIT;}
 function exit(bytes32 id) external {Record storage r=records[id];require(r.publisher==msg.sender&&(r.state==1||r.state==3)&&r.exitAt!=0&&block.timestamp>=r.exitAt,"not ready");r.state=5;credits[msg.sender]+=STAKE;}
 function withdraw() external nonReentrant {uint256 v=credits[msg.sender];require(v>0,"no credit");credits[msg.sender]=0;token.safeTransfer(msg.sender,v);}
}
