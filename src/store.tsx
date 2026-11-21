import React, {createContext,useContext,useEffect,useRef,useState} from 'react';
import type {Circle,Entry,Recurring} from './ledger';
import {validateEntry,splitEqual} from './ledger';
import {Cloud} from './cloud';

const DEMO_KEY='tabby-demo-v1';
const LOCAL_CIRCLE='tabby-current-circle';
const url=import.meta.env.VITE_SUPABASE_URL as string|undefined;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string|undefined;
const cloud=url&&key?new Cloud(url,key):null;
const uid=()=>crypto.randomUUID();
function today(offset=0){const d=new Date();d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function initialDemo():Circle[]{
 const people=[{id:'you',name:'You',color:'#f57456'},{id:'mom',name:'Mom',color:'#cf86b5'},{id:'dad',name:'Dad',color:'#789eb6'},{id:'alex',name:'Alex',color:'#d7aa54'}];
 const exp=(id:string,title:string,amount:number,payerId:string,who:string[],date:string,vendor:string,category:string):Entry=>({id,kind:'expense',title,amount,payerId,shares:splitEqual(amount,who),date,vendor,category,status:'confirmed',createdBy:payerId,createdAt:date+'T12:00:00Z'});
 return [{id:'family',name:'Family circle',emoji:'🏡',members:people,entries:[exp('e1','The weekly grocery run',12648,'you',['you','mom','dad'],today(-1),'Trader Joe’s','Groceries'),exp('e2','Sunday dinner',8400,'mom',['you','mom','dad','alex'],today(-2),'Local Kitchen','Food & drink'),exp('e3','Phone bill · November',9600,'you',['you','alex'],today(-4),'Verizon','Bills'),exp('e4','A little movie night',3600,'dad',['you','dad','alex'],today(-5),'AMC','Fun'),{id:'p1',kind:'payment',title:'Thanks for dinner!',amount:1500,payerId:'you',recipientId:'mom',shares:[],date:today(-1),status:'confirmed',createdBy:'you',createdAt:today(-1)+'T17:00:00Z'}],recurring:[{id:'r1',title:'Phone bill',amount:9600,payerId:'you',shares:splitEqual(9600,['you','alex']),dayOfMonth:25,nextDate:today(2),vendor:'Verizon',category:'Bills',active:true},{id:'r2',title:'Family streaming',amount:2299,payerId:'you',shares:splitEqual(2299,['you','mom','dad','alex']),dayOfMonth:28,nextDate:today(3),vendor:'Netflix',category:'Subscriptions',active:true}]},{id:'partner',name:'You & your person',emoji:'💛',members:[people[0],{id:'sam',name:'Sam',color:'#8da58b'}],entries:[exp('e5','Date night',6800,'you',['you','sam'],today(-2),'Our favorite place','Food & drink'),exp('e6','Coffee & a walk',1250,'sam',['you','sam'],today(-1),'Coffee shop','Food & drink')],recurring:[]}];
}
function readDemo(){try{const v=JSON.parse(localStorage.getItem(DEMO_KEY)||'null');return Array.isArray(v)&&v.length&&v.every(c=>Array.isArray(c.members)&&Array.isArray(c.entries)&&Array.isArray(c.recurring))?v as Circle[]:initialDemo();}catch{return initialDemo();}}
type EntryInput=Omit<Entry,'id'|'createdAt'|'createdBy'|'status'>&Partial<Pick<Entry,'id'|'createdAt'|'createdBy'|'status'>>;
type RecurringInput=Omit<Recurring,'id'>&{id?:string};
type User={id:string,email?:string,name?:string};
type Context={circles:Circle[];currentCircle:Circle|undefined;currentPersonId:string;mode:'demo'|'cloud'|'signed-out';ready:boolean;loading:boolean;error:string|null;user:User|null;configured:boolean;invitePending:boolean;recovery:boolean;updatePassword:(password:string)=>Promise<void>;setCircle:(id:string)=>void;enterDemo:()=>void;switchPerson:(id:string)=>void;signIn:(email:string,password:string)=>Promise<void>;signUp:(name:string,email:string,password:string)=>Promise<void>;resetPassword:(email:string)=>Promise<void>;signOut:()=>Promise<void>;createCircle:(name:string)=>Promise<void>;addPerson:(name:string)=>Promise<void>;addEntry:(entry:EntryInput)=>Promise<void>;confirmPayment:(id:string)=>Promise<void>;voidEntry:(id:string)=>Promise<void>;addRecurring:(r:RecurringInput)=>Promise<void>;toggleRecurring:(id:string)=>Promise<void>;createInvite:(id:string)=>Promise<string>;clearError:()=>void;refresh:()=>Promise<void>};
const TabbyContext=createContext<Context|null>(null);
export function TabbyProvider({children}:{children:React.ReactNode}){
 const [circles,setCircles]=useState<Circle[]>(readDemo);const [circleId,setCircleId]=useState(()=>localStorage.getItem(LOCAL_CIRCLE)||'family');const [demoPerson,setDemoPerson]=useState('you');const [mode,setMode]=useState<Context['mode']>('demo');const [user,setUser]=useState<User|null>(null);const [recovery,setRecovery]=useState(false);const [ready,setReady]=useState(false);const [loading,setLoading]=useState(false);const [error,setError]=useState<string|null>(null);const busy=useRef(false);const authVersion=useRef(0);const inviteAcceptance=useRef<Promise<string>|null>(null);
 const invite=useRef(new URLSearchParams(location.hash.slice(1)).get('invite')||sessionStorage.getItem('tabby-invite')||'');
 if(invite.current)sessionStorage.setItem('tabby-invite',invite.current);
 const currentCircle=circles.find(c=>c.id===circleId)||circles[0];
 const currentPersonId=mode==='demo'?(currentCircle?.members.some(p=>p.id===demoPerson)?demoPerson:currentCircle?.members[0]?.id||''):currentCircle?.members.find(p=>p.userId===user?.id)?.id||'';
 const setCircle=(id:string)=>{setCircleId(id);localStorage.setItem(LOCAL_CIRCLE,id);};
 function requireCloud(){if(!cloud)throw Error('Shared accounts are not connected yet. You can explore the demo while setup is completed.');return cloud;}
 async function load(){const version=authVersion.current;const data=await requireCloud().loadCircles();if(version===authVersion.current)setCircles(data);}
 async function useSession(session:any){
  const version=++authVersion.current;
  if(!session){setUser(null);setMode(invite.current?'signed-out':'demo');setCircles(readDemo());setReady(true);return;}
  setUser({id:session.user.id,email:session.user.email,name:session.user.user_metadata?.display_name||session.user.user_metadata?.name||session.user.email?.split('@')[0]});
  setMode('cloud');
  try{
   if(invite.current){
    try{
     if(!inviteAcceptance.current)inviteAcceptance.current=requireCloud().acceptInvite(invite.current);
     const id=await inviteAcceptance.current;
     if(version!==authVersion.current)return;
     setCircle(id);
    }catch(e){if(version===authVersion.current)setError(message(e));}
    if(version!==authVersion.current)return;
    invite.current='';inviteAcceptance.current=null;sessionStorage.removeItem('tabby-invite');
    history.replaceState(null,'',location.pathname+location.search);
   }
   const data=await requireCloud().loadCircles();
   if(version===authVersion.current)setCircles(data);
  }catch(e){if(version===authVersion.current){setCircles([]);setError(message(e));}}
  finally{if(version===authVersion.current)setReady(true);}
 }

 useEffect(()=>{if(!cloud){setReady(true);return;}let alive=true;const {data}=cloud.client.auth.onAuthStateChange((event,session)=>{if(alive){if(event==='PASSWORD_RECOVERY')setRecovery(true);queueMicrotask(()=>void useSession(session));}});return()=>{alive=false;data.subscription.unsubscribe();};},[]);
 useEffect(()=>{if(mode==='demo'&&circles.every(c=>!c.ownerId))try{localStorage.setItem(DEMO_KEY,JSON.stringify(circles));}catch{setError('This browser could not save the demo. Shared accounts save to your account.');}},[circles,mode]);
 useEffect(()=>{if(mode!=='cloud')return;const refresh=()=>{if(document.visibilityState==='visible'&&!busy.current)void load().catch(e=>setError(message(e)));};window.addEventListener('focus',refresh);const timer=setInterval(refresh,30000);return()=>{window.removeEventListener('focus',refresh);clearInterval(timer);};},[mode]);
 async function act<T>(fn:()=>Promise<T>):Promise<T>{if(busy.current)throw Error('One moment — your previous change is still saving.');busy.current=true;setLoading(true);setError(null);try{return await fn();}catch(e){setError(message(e));throw e;}finally{busy.current=false;setLoading(false);}}
 function localChange(fn:(c:Circle)=>Circle){if(!currentCircle)throw Error('Create a circle first.');setCircles(old=>old.map(c=>c.id===currentCircle.id?fn(c):c));}
 function needCircle(){if(!currentCircle)throw Error('Create a circle first.');return currentCircle;}
 const value:Context={circles,currentCircle,currentPersonId,mode,ready,loading,error,user,configured:!!cloud,invitePending:!!invite.current,recovery,updatePassword:async(password)=>{await act(async()=>{await requireCloud().updatePassword(password);setRecovery(false);history.replaceState(null,'',location.pathname+location.search);});},setCircle,clearError:()=>setError(null),refresh:async()=>{if(mode==='cloud')await act(load);},
 enterDemo(){authVersion.current++;setRecovery(false);setMode('demo');setUser(null);setCircles(readDemo());setCircle('family');setDemoPerson('you');setError(null);},
 switchPerson(id){if(mode==='demo')setDemoPerson(id);},
 signIn:async(email,password)=>{await act(async()=>{const c=requireCloud();await c.signIn(email,password);});},
 signUp:async(name,email,password)=>{await act(async()=>{const result=await requireCloud().signUp(email,password,name);void result;});},
 resetPassword:async(email)=>{await act(async()=>{await requireCloud().resetPassword(email);});},
 signOut:async()=>{await act(async()=>{authVersion.current++;if(cloud)await cloud.signOut();setUser(null);setRecovery(false);setMode('signed-out');setCircles([]);});},
 createCircle:async(name)=>{await act(async()=>{if(!name.trim())throw Error('Give your circle a name.');if(mode==='demo'){const id=uid();setCircles(old=>[...old,{id,name:name.trim(),emoji:'🏡',members:[{id:'you',name:'You',color:'#f57456'}],entries:[],recurring:[]}]);setCircle(id);setDemoPerson('you');}else{const id=await requireCloud().createCircle(name.trim(),user?.name||'Me');await load();setCircle(id);}});},
 addPerson:async(name)=>{await act(async()=>{const c=needCircle();if(!name.trim())throw Error('Enter a name.');if(mode==='demo')localChange(c=>({...c,members:[...c.members,{id:uid(),name:name.trim(),color:['#cf86b5','#789eb6','#d7aa54','#8da58b'][c.members.length%4]}]}));else{await requireCloud().addPerson(c.id,name.trim());await load();}});},
 addEntry:async(input)=>{await act(async()=>{const c=needCircle();const entry:Entry={...input,id:input.id||uid(),createdAt:new Date().toISOString(),createdBy:mode==='demo'?currentPersonId:user?.id,status:input.kind==='payment'?'pending':'confirmed'};validateEntry(entry,c.members);if(input.recurringId&&c.entries.some(e=>e.status!=='void'&&(input.recurrenceKey?e.recurrenceKey===input.recurrenceKey:e.recurringId===input.recurringId&&e.date===input.date)))throw Error('This recurring bill has already been recorded for this date.');if(mode==='demo')localChange(c=>({...c,entries:[...c.entries,entry]}));else{await requireCloud().addEntry(c.id,entry);await load();}});},
 confirmPayment:async(id)=>{await act(async()=>{const c=needCircle(),e=c.entries.find(e=>e.id===id);if(!e||e.kind!=='payment'||e.status!=='pending')throw Error('This payment is no longer awaiting confirmation.');if(e.recipientId!==currentPersonId)throw Error('Only the recipient can confirm this payment.');if(mode==='demo')localChange(c=>({...c,entries:c.entries.map(e=>e.id===id?{...e,status:'confirmed',confirmedBy:currentPersonId}:e)}));else{await requireCloud().confirmPayment(id);await load();}});},
 voidEntry:async(id)=>{await act(async()=>{const c=needCircle(),e=c.entries.find(e=>e.id===id);if(!e)throw Error('Entry not found.');if(mode==='demo')localChange(c=>({...c,entries:c.entries.map(e=>e.id===id?{...e,status:'void'}:e)}));else{await requireCloud().voidEntry(id);await load();}});},
 addRecurring:async(input)=>{await act(async()=>{const c=needCircle();const recurring={...input,id:input.id||uid()};if(mode==='demo')localChange(c=>({...c,recurring:[...c.recurring,recurring]}));else{await requireCloud().addRecurring(c.id,recurring);await load();}});},
 toggleRecurring:async(id)=>{await act(async()=>{const c=needCircle(),r=c.recurring.find(r=>r.id===id);if(!r)throw Error('Recurring bill not found.');if(mode==='demo')localChange(c=>({...c,recurring:c.recurring.map(r=>r.id===id?{...r,active:!r.active}:r)}));else{await requireCloud().toggleRecurring(id,!r.active);await load();}});},
 createInvite:async(id)=>act(async()=>{if(mode==='demo')throw Error('Demo people stay in this browser. Sign in to invite your people to a shared circle.');const c=needCircle();const token=await requireCloud().createInvite(c.id,id);return location.origin+location.pathname+'#invite='+encodeURIComponent(token);})};
 return <TabbyContext.Provider value={value}>{children}</TabbyContext.Provider>;
}
function message(error:unknown){return error instanceof Error?error.message:'Something went wrong. Please try again.';}
export function useTabby(){const c=useContext(TabbyContext);if(!c)throw Error('TabbyProvider is missing');return c;}
