import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { build } = createRequire(import.meta.resolve('vite'))('esbuild');
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

// Compile the real app and provider, with live backend configuration omitted.
// This suite exercises demo UI + store together; browser layout and live RLS
// are verified separately, rather than simulated by a DOM without layout.
const generated = await mkdtemp(path.join(process.cwd(), 'tests/.app-runtime-'));
const runtimeFile = path.join(generated, 'runtime.mjs');
await build({
  stdin: { contents: `export { default as App } from './src/App'; export { TabbyProvider, useTabby } from './src/store';`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, format: 'esm', platform: 'node', outfile: runtimeFile,
  external: ['react', 'react-dom', 'react-dom/client'], loader: { '.css': 'empty' },
  define: { 'import.meta.env.VITE_SUPABASE_URL': 'undefined', 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': 'undefined' },
  jsx: 'automatic', logLevel: 'silent',
});
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://tabby.test/', pretendToBeVisual: true });
for (const name of ['window','document','location','history','localStorage','sessionStorage','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','Event','MouseEvent','KeyboardEvent','Node','MutationObserver']) {
  Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true, writable: true });
}
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.confirm = () => true;
const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { App, TabbyProvider, useTabby } = await import(pathToFileURL(runtimeFile).href);
let latest;
function Probe() { latest = useTabby(); return null; }
let root;
function dateKey(offset=0) { const d=new Date();d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
const today = dateKey();
const personA = {id:'you',name:'You'}, personB={id:'mom',name:'Mom'};
function circle(overrides={}) { return {id:'family',name:'Test family',members:[personA,personB],entries:[],recurring:[],...overrides}; }
async function mount(fixtures=[circle()], clear=true) {
  if (root) await act(async()=>root.unmount());
  if(clear){localStorage.clear();sessionStorage.clear();history.replaceState(null,'','/');localStorage.setItem('tabby-demo-v1',JSON.stringify(fixtures));}
  document.body.innerHTML='<div id="app"></div>';
  root=createRoot(document.getElementById('app'));
  await act(async()=>root.render(React.createElement(TabbyProvider,null,React.createElement(Probe),React.createElement(App))));
}
function button(text, scope=document) {const found=[...scope.querySelectorAll('button')].find(e=>e.textContent.trim()===text);assert.ok(found,`Button '${text}' should be present`);return found;}
async function click(element){await act(async()=>element.click());}
async function fill(selector,value){const el=document.querySelector(selector);assert.ok(el,`Field ${selector} should exist`);const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;await act(async()=>{Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event(el instanceof HTMLSelectElement?'change':'input',{bubbles:true}));});}
async function submit(){const form=document.querySelector('[role="dialog"] form');assert.ok(form,'Dialog form exists');await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}
function saved(){return JSON.parse(localStorage.getItem('tabby-demo-v1'))[0];}
function payment(amount=2500){return {kind:'payment',title:'Paid back',amount,payerId:'you',recipientId:'mom',shares:[],date:today};}
function expense(amount=10000){return {kind:'expense',title:'Shared groceries',amount,payerId:'mom',shares:[{personId:'you',amount:amount/2},{personId:'mom',amount:amount/2}],date:today};}

test('demo expense persists after unmount and remount with exact shares', async()=>{
  await mount();
  await act(async()=>latest.addEntry({...expense(10000),title:'Remember this receipt'}));
  assert.equal(saved().entries[0].amount,10000);
  assert.equal(saved().entries[0].status,'confirmed');
  await mount(undefined,false);
  assert.equal(latest.currentCircle.entries.length,1);
  assert.ok(document.body.textContent.includes('Remember this receipt'));
  assert.ok(document.body.textContent.includes('$50.00'));
});

test('expense form saves a custom split and preserves notes/vendor',async()=>{
  await mount();await click(button('Add expense'));
  await fill('#entry-amount','13.37');await fill('#entry-title','Custom dinner');
  await click(button('Custom',document.querySelector('[role="dialog"]')));
  await fill('[aria-label="You\'s share"]','3.01');await fill('[aria-label="Mom\'s share"]','10.36');
  await fill('#entry-vendor','Our neighborhood café');await fill('#entry-note','Dinner after the movie');await submit();
  assert.equal(document.querySelector('[role="dialog"]'),null);
  const record=saved().entries[0];assert.deepEqual(record.shares,[{personId:'you',amount:301},{personId:'mom',amount:1036}]);
  assert.equal(record.vendor,'Our neighborhood café');assert.equal(record.note,'Dinner after the movie');
});

test('invalid custom split remains editable and does not write financial records',async()=>{
  await mount();await click(button('Add expense'));await fill('#entry-amount','10');await fill('#entry-title','Unbalanced dinner');await click(button('Custom',document.querySelector('[role="dialog"]')));await fill('[aria-label="You\'s share"]','1');await fill('[aria-label="Mom\'s share"]','2');await submit();
  assert.ok(document.querySelector('[role="dialog"]'));
  assert.ok(document.querySelector('[role="alert"]').textContent.includes('add up'));
  assert.equal(saved().entries.length,0);
});

test('pending payment does not settle balance; only recipient can confirm',async()=>{
  await mount([circle({entries:[{...expense(),id:'seed',status:'confirmed'}]})]);
  await act(async()=>latest.addEntry(payment()));
  assert.equal(latest.currentCircle.entries[1].status,'pending');
  assert.ok(document.body.textContent.includes('$50.00'));
  await act(async()=>assert.rejects(latest.confirmPayment(latest.currentCircle.entries[1].id),/Only the recipient/));
  await act(async()=>latest.switchPerson('mom'));
  const record=latest.currentCircle.entries[1];
  await act(async()=>latest.confirmPayment(record.id));
  assert.equal(latest.currentCircle.entries[1].status,'confirmed');
  assert.ok(document.body.textContent.includes('$25.00'));
});

test('reviewing an unequal recurring bill preserves split and original occurrence when actual date changes',async()=>{
  const recurring={id:'r1',title:'Unequal phone plan',amount:10000,payerId:'you',shares:[{personId:'you',amount:2000},{personId:'mom',amount:8000}],dayOfMonth:new Date().getDate(),nextDate:today,active:true};
  await mount([circle({recurring:[recurring]})]);
  await click(document.querySelector('.upcoming-item'));
  assert.equal(document.querySelector('[aria-label="You\'s share"]').value,'20.00');
  assert.equal(document.querySelector('[aria-label="Mom\'s share"]').value,'80.00');
  await fill('#entry-date',dateKey(1));await submit();
  const record=saved().entries[0];
  assert.equal(record.date,dateKey(1));assert.equal(record.recurrenceKey,`r1:${today}`);assert.deepEqual(record.shares,recurring.shares);
  await click(document.querySelector('.upcoming-item'));
  assert.notEqual(document.querySelector('#entry-date').value,today,'The recorded occurrence should no longer be offered');
});

test('voiding a recurring posting restores its review without losing history',async()=>{
  const recurring={id:'r1',title:'Replaceable phone plan',amount:10000,payerId:'you',shares:[{personId:'you',amount:5000},{personId:'mom',amount:5000}],dayOfMonth:new Date().getDate(),nextDate:today,active:true};
  await mount([circle({recurring:[recurring]})]);await click(document.querySelector('.upcoming-item'));await submit();
  const id=latest.currentCircle.entries[0].id;
  await act(async()=>latest.voidEntry(id));
  assert.equal(latest.currentCircle.entries[0].status,'void');
  await click(document.querySelector('.upcoming-item'));
  assert.equal(document.querySelector('#entry-date').value,today,'Voided occurrence can be reviewed again');
  await fill('#entry-amount','12');await submit();
  assert.equal(saved().entries.length,2);assert.equal(saved().entries[0].status,'void');assert.equal(saved().entries[1].status,'confirmed');
});

test('demo cannot create invitations or leak a fake shared link',async()=>{
  await mount();await click(button('Invite someone'));
  assert.ok(document.querySelector('[role="dialog"]').textContent.includes('Invite links are available in your own account'));
  assert.equal([...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Create invitation link'),false);
  await act(async()=>assert.rejects(latest.createInvite('mom'),/Sign in to invite/));
});

after(async()=>{if(root)await act(async()=>root.unmount());dom.window.close();await rm(generated,{recursive:true,force:true});});

// A fake network boundary lets the real provider exercise auth-event races
// without creating accounts, sending mail, or touching the live database.
const authRuntimeFile=path.join(generated,'auth-runtime.mjs');
await build({
 stdin:{contents:`export { default as App } from './src/App'; export { TabbyProvider, useTabby } from './src/store';`,resolveDir:process.cwd(),loader:'tsx'},
 bundle:true,format:'esm',platform:'node',outfile:authRuntimeFile,external:['react','react-dom','react-dom/client'],loader:{'.css':'empty'},jsx:'automatic',logLevel:'silent',
 define:{'import.meta.env.VITE_SUPABASE_URL':'"https://mock.test"','import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':'"publishable-test"'},
 plugins:[{name:'fake-cloud-boundary',setup(b){b.onResolve({filter:/^\.\/cloud$/},()=>({path:'mock-cloud',namespace:'qa'}));b.onLoad({filter:/.*/,namespace:'qa'},()=>({loader:'js',contents:`
 const ctl=()=>globalThis.__tabbyCloudControl;
 export class Cloud {
 client={auth:{onAuthStateChange(callback){ctl().listeners.add(callback);queueMicrotask(()=>callback('INITIAL_SESSION',ctl().session));return {data:{subscription:{unsubscribe(){ctl().listeners.delete(callback)}}}}}}};
 async getSession(){ctl().getSessionCalls++;return ctl().session;}
 async loadCircles(){ctl().loadCalls++;return ctl().load();}
 async acceptInvite(token){ctl().inviteCalls++;return ctl().accept(token);}
 async signIn(){for(const cb of ctl().listeners)cb('SIGNED_IN',ctl().nextSession);return {};}
 async signOut(){for(const cb of ctl().listeners)cb('SIGNED_OUT',null);}
 async updatePassword(){} async resetPassword(){} async signUp(){return {session:null};}
 }
 `}));}}],
});
const AuthRuntime=await import(pathToFileURL(authRuntimeFile).href);
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject};}
const session={user:{id:'private-user',email:'qa@example.invalid',user_metadata:{display_name:'QA'}}};
const privateCircle=circle({id:'private-circle',name:'Private live household',ownerId:'private-user',members:[{id:'private-person',name:'QA',userId:'private-user'}]});
async function mountAuth({invite='',initial=null,load=async()=>[privateCircle],accept=async()=>privateCircle.id}={}){
 if(root)await act(async()=>root.unmount());
 localStorage.clear();sessionStorage.clear();history.replaceState(null,'',invite?'/#invite='+invite:'/');localStorage.setItem('tabby-demo-v1',JSON.stringify([circle()]));
 globalThis.__tabbyCloudControl={listeners:new Set(),session:initial,nextSession:session,load,accept,loadCalls:0,inviteCalls:0,getSessionCalls:0};
 function AuthProbe(){latest=AuthRuntime.useTabby();return null;}
 document.body.innerHTML='<div id="app"></div>';root=createRoot(document.getElementById('app'));
 await act(async()=>root.render(React.createElement(AuthRuntime.TabbyProvider,null,React.createElement(AuthProbe),React.createElement(AuthRuntime.App))));
 return globalThis.__tabbyCloudControl;
}
async function emitAuth(ctl,event,value){await act(async()=>{for(const cb of ctl.listeners)cb(event,value);});}

test('sign-in uses auth events only and accepts an invitation once across duplicate events',async()=>{
 const inviteResult=deferred();const ctl=await mountAuth({invite:'a'.repeat(64),accept:()=>inviteResult.promise});
 assert.equal(latest.mode,'signed-out');
 await act(async()=>{await latest.signIn('qa@example.invalid','not-a-real-password');for(const cb of ctl.listeners)cb('TOKEN_REFRESHED',session);});
 assert.equal(ctl.inviteCalls,1,'One invitation exchange even when sign-in and refresh overlap');
 assert.equal(ctl.getSessionCalls,0,'Session event remains the single source of loading');
 await act(async()=>inviteResult.resolve(privateCircle.id));
 assert.equal(latest.mode,'cloud');assert.equal(latest.currentCircle.id,privateCircle.id);assert.equal(sessionStorage.getItem('tabby-invite'),null);
});

test('a delayed private auth load cannot replace demo data after leaving the account',async()=>{
 const loading=deferred();const ctl=await mountAuth({load:()=>loading.promise});
 await emitAuth(ctl,'SIGNED_IN',session);assert.equal(ctl.loadCalls,1);
 await act(async()=>latest.enterDemo());
 await act(async()=>loading.resolve([privateCircle]));
 assert.equal(latest.mode,'demo');assert.equal(latest.currentCircle.name,'Test family');
 assert.equal(saved().name,'Test family');assert.equal(document.body.textContent.includes('Private live household'),false);
});

test('a delayed background refresh cannot repopulate live data after sign-out',async()=>{
 let refreshed;const ctl=await mountAuth({initial:session,load:async()=>[privateCircle]});
 assert.equal(latest.mode,'cloud');
 const loading=deferred();ctl.load=()=>loading.promise;
 await act(async()=>{refreshed=latest.refresh();});
 // A refresh is a foreground action; auth sign-out can occur in another tab.
 await emitAuth(ctl,'SIGNED_OUT',null);
 await act(async()=>{loading.resolve([privateCircle]);await refreshed;});
 assert.equal(latest.mode,'demo');assert.equal(latest.currentCircle.name,'Test family');
 assert.equal(document.body.textContent.includes('Private live household'),false);
});

test('an expired invitation reports an error while preserving access to existing circles',async()=>{
 const ctl=await mountAuth({invite:'b'.repeat(64),initial:session,accept:async()=>{throw Error('This invitation is expired.');}});
 assert.equal(latest.mode,'cloud');
 assert.equal(latest.currentCircle?.id,privateCircle.id,'A bad invitation must not hide existing account circles');
 assert.match(latest.error||'',/expired/);
 assert.equal(sessionStorage.getItem('tabby-invite'),null,'Discard a failed bearer link so later sessions can load normally');
 assert.equal(ctl.inviteCalls,1);
 await emitAuth(ctl,'TOKEN_REFRESHED',session);
 assert.equal(ctl.inviteCalls,1,'Do not retry a consumed or expired invitation on token refresh');
 assert.equal(latest.currentCircle?.id,privateCircle.id);
});
