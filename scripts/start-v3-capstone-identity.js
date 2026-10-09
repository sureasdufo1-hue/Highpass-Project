import {startCapstoneMountedIdentityService} from '../src/v3-capstone-mounted-service.js';

let service;
try{
 const mode=process.env.HIGHPASS_V3_CAPSTONE_MODE;
 const raw=process.env.HIGHPASS_V3_CAPSTONE_PORT??'9445';
 if(!/^[1-9][0-9]{3,4}$/.test(raw))throw Error();
 service=await startCapstoneMountedIdentityService({mode,port:Number(raw)});
 console.log(JSON.stringify({...service.summary,address:service.address(),review:'DRAFT / UNASSIGNED'}));
}catch{
 console.error(JSON.stringify({status:'NOT VERIFIED',reason:'V3_MOUNTED_IDENTITY_START_FAILED'}));
 process.exit(1);
}
let closing=false;
const shutdown=()=>{
 if(closing)return;closing=true;
 const deadline=setTimeout(()=>process.exit(1),5000);
 void service.stop().then(()=>{clearTimeout(deadline);process.exit(0);},()=>{clearTimeout(deadline);process.exit(1);});
};
process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
