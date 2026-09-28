const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('sessão pendente nunca carrega dados; cadastro pede somente professor',async()=>{
 const elements=new Map();
 const el=id=>{if(!elements.has(id))elements.set(id,{style:{},value:'',dataset:{label:'Solicitar acesso'},checkValidity:()=>true}); return elements.get(id);};
 let loads=0,signup;
 const ctx=vm.createContext({document:{getElementById:el},console,showToast(){},supabaseClient:{auth:{onAuthStateChange(){}}},signOut:async()=>{},signUp:async(...args)=>{signup=args},loadAllData:async()=>{loads++}});
 vm.runInContext(fs.readFileSync('auth.js','utf8'),ctx);
 await vm.runInContext("CURRENT_USER={id:'test'}; CURRENT_PROFILE={role:'professor',approval_status:'pending',active:true}; bootApp()",ctx);
 assert.equal(loads,0); assert.match(el('registrationStatus').textContent,/Aguardando/); assert.equal(el('MA').style.display,'none');
 el('regName').value='Professor'; el('regEmail').value='test@example.com'; el('regPass').value='Password123';
 await ctx.doRegister(); assert.equal(signup[3],'professor'); assert.match(el('registrationStatus').textContent,/Confirme|confirma|confirmar/);
 assert.equal(el('btnRegister').disabled,false);
});
test('cadastro administrativo: admin ativo, aprovação, rollback e falha de e-mail',async()=>{
 const source=fs.readFileSync('backend/create-professor/index.ts','utf8').replace(/^import .*;\r?\n/,'').replace(/\)!/g,')').replace(/: any/g,'');
 async function run(opts={}) {
  let handler,created=0,deleted=0,saved;
  const client={auth:{getUser:async()=>({data:{user:{id:'admin'}},error:null}),admin:{createUser:async()=>{created++;return {data:{user:{id:'new'}}}},deleteUser:async()=>{deleted++;return {error:null}}}},from:()=>({select(){return this},eq(){return this},single:async()=>({data:{role:opts.role||'admin',active:!opts.inactive}}),upsert:async value=>{saved=value;return {error:opts.profileFail?{}:null}}})};
  const ctx=vm.createContext({createClient:()=>client,Request,Response,crypto:require('node:crypto').webcrypto,Uint8Array,Deno:{env:{get:()=>''},serve:fn=>handler=fn},fetch:async()=>{throw Error('network')}});
  vm.runInContext(source,ctx);
  const response=await handler(new Request('https://test.local',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({name:'Professor',email:'test@example.com',plan_type:'pro'})}));
  return {status:response.status,body:await response.json(),created,deleted,saved};
 }
 assert.equal((await run({inactive:true})).created,0);
 assert.equal((await run({role:'professor'})).status,403);
 const failed=await run({profileFail:true}); assert.equal(failed.status,500); assert.equal(failed.deleted,1);
 const ok=await run(); assert.equal(ok.status,200); assert.equal(ok.saved.approval_status,'approved'); assert.equal(ok.body.emailSent,false); assert.ok(ok.body.tempPassword.length>20);
});
