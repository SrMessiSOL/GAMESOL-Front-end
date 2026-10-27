import {Suspense,useEffect,useId,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Canvas} from '@react-three/fiber';
import {OrbitControls} from '@react-three/drei';
import {Check,Paintbrush,RotateCcw,ShoppingCart,X} from 'lucide-react';
import {PublicKey} from '@solana/web3.js';
import type {GameClient} from './game-state';
import {FleetVessel} from './FleetVessel';
import {SHIP_BACKDROPS,SHIP_CATALOG} from './ship-catalog';
import type {ShipClass} from './fleet-identity';
import {SHIP_SKINS,COSMETIC_SHIPS,cosmeticCommandError,cosmeticPurchaseBlock,createShipCosmeticController,type ShipSkinStoreSnapshot} from './ship-cosmetics';
import {GameButton,GameIconButton} from './design-system/game-ui';
import {CommandActionButton} from './design-system/command-controls';
import usdc from './assets/ui/usdc.svg';
import './ship-cosmetics-store.css';

type Controller=ReturnType<typeof createShipCosmeticController>;
const price=(amount:bigint)=>(Number(amount)/1_000_000).toLocaleString(undefined,{maximumFractionDigits:2});

export function CosmeticPurchaseReview({skin,busy,onClose,onConfirm}:{skin:number;busy:boolean;onClose:()=>void;onConfirm:()=>void}){
  const title=useId(),panel=useRef<HTMLElement>(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.current();}
      if(event.key==='Tab'){
        event.stopPropagation();const controls=[...(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[])],first=controls[0],last=controls[controls.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',key,true);return()=>{document.removeEventListener('keydown',key,true);document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
  },[]);
  return createPortal(<div className="ship-skin-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
    <section className="ship-skin-review" ref={panel} role="dialog" aria-modal="true" aria-labelledby={title}>
      <header><h2 id={title}>Unlock {SHIP_SKINS[skin].name}</h2><GameIconButton label="Close livery purchase" disabled={busy} onClick={onClose}><X/></GameIconButton></header>
      <div className="ship-skin-review-finish"><i style={{background:SHIP_SKINS[skin].hull,borderColor:SHIP_SKINS[skin].trim}}/><strong>{SHIP_SKINS[skin].name} livery</strong></div>
      <dl><div><dt>Price</dt><dd><img src={usdc} alt="USDC"/>{price(SHIP_SKINS[skin].price)}</dd></div><div><dt>Collection</dt><dd>All ship classes</dd></div><div><dt>Gameplay effect</dt><dd>None</dd></div><div><dt>Network</dt><dd>Devnet</dd></div></dl>
      <footer><GameButton disabled={busy} onClick={onClose}>Cancel</GameButton><CommandActionButton icon={<ShoppingCart/>} pending={busy} pendingLabel="Confirming purchase…" disabled={busy} onClick={onConfirm}>Buy for {price(SHIP_SKINS[skin].price)} USDC</CommandActionButton></footer>
    </section>
  </div>,document.body);
}

export function ShipCosmeticsPanel({controller,externalBusy=false}:{controller:Controller|null;externalBusy?:boolean}){
  const [state,setState]=useState<ShipSkinStoreSnapshot|null>(null),[ship,setShip]=useState<ShipClass>('battlecruiser'),[skin,setSkin]=useState(0);
  const [loading,setLoading]=useState(true),[pending,setPending]=useState<'buy'|'equip'|null>(null),[notice,setNotice]=useState(''),[error,setError]=useState(''),[review,setReview]=useState<number|null>(null);
  const lock=useRef(false),epoch=useRef(0),live=useRef(controller);live.current=controller;
  async function refresh(){
    const token=++epoch.current;setLoading(true);setError('');
    try{const result=controller?await controller.read():null;if(token===epoch.current&&live.current===controller){setState(result);setSkin(result?.inventory?.equipped[COSMETIC_SHIPS.indexOf(ship)]??0);}}
    catch{if(token===epoch.current){setState(null);setError('Liveries could not be loaded. Refresh to check your collection.');}}
    finally{if(token===epoch.current)setLoading(false);}
  }
  useEffect(()=>{setState(null);setReview(null);setNotice('');setPending(null);lock.current=false;void refresh();return()=>{epoch.current++;};},[controller]);
  const equipped=state?.inventory?.equipped[COSMETIC_SHIPS.indexOf(ship)]??0;
  const owned=skin===0||Boolean((state?.inventory?.owned??0)&(1<<skin));
  const block=state?cosmeticPurchaseBlock(state,skin):'Store not available';
  const busy=externalBusy||loading||pending!==null;
  async function command(kind:'buy'|'equip',chosen:number){
    if(!controller||!state||lock.current||busy)return;
    lock.current=true;setPending(kind);setError('');setNotice('');const token=epoch.current;
    try{
      const next=kind==='buy'?await controller.buy(chosen):await controller.equip(ship,chosen,state.inventory!.revision);
      if(token===epoch.current&&live.current===controller){setState(next);setReview(null);setNotice(kind==='buy'?`${SHIP_SKINS[chosen].name} added to your collection.`:`${SHIP_SKINS[chosen].name} equipped on ${SHIP_CATALOG.find(s=>s.key===ship)?.name}.`);}
    }catch(error){
      if(import.meta.env.DEV)console.warn('[GAMESOL cosmetics]',error instanceof Error?error.message:'Command could not be confirmed');
      if(token===epoch.current){setReview(null);setError(cosmeticCommandError(kind,error));}
    }finally{if(token===epoch.current){lock.current=false;setPending(null);}}
  }
  return <section className="ship-skin-store" aria-labelledby="ship-skin-title" aria-busy={loading||pending!==null}>
    <header className="ship-skin-heading"><div><span>GAMESOL LIVERIES</span><h2 id="ship-skin-title">Fleet Customization</h2></div><GameIconButton label="Refresh ship cosmetics" disabled={busy} onClick={()=>void refresh()}><RotateCcw/></GameIconButton></header>
    <div className="ship-skin-toolbar"><label>Ship class<select value={ship} disabled={busy} onChange={e=>{const next=e.target.value as ShipClass;setShip(next);setSkin(state?.inventory?.equipped[COSMETIC_SHIPS.indexOf(next)]??0);}}>{SHIP_CATALOG.map(s=><option value={s.key} key={s.key}>{s.name}</option>)}</select></label><div><span>Equipped</span><strong>{SHIP_SKINS[equipped].name}</strong></div><div><span>Devnet USDC</span><strong><img src={usdc} alt=""/>{loading?'—':price(state?.balance??0n)}</strong></div></div>
    <div className="ship-skin-stage" style={{backgroundImage:`url(${SHIP_BACKDROPS.hangar})`}}>
      <Canvas camera={{position:[0,0,6],fov:42}} dpr={[1,1.5]} gl={{alpha:true,antialias:true}}><ambientLight intensity={1.6}/><directionalLight position={[3,4,6]} intensity={3}/><directionalLight position={[-4,-2,3]} intensity={1.2}/><Suspense fallback={null}><group rotation={[.3,-.35,-.6]} scale={1.3}><FleetVessel kind="attack" shipClass={ship} presentation="inspection" skin={skin}/></group></Suspense><OrbitControls enablePan={false} enableZoom={false}/></Canvas>
      <div className="ship-skin-stage-caption"><b>{SHIP_CATALOG.find(s=>s.key===ship)?.name}</b><span>{SHIP_SKINS[skin].name}</span></div>
    </div>
    <div className="ship-skin-options" role="group" aria-label="Ship liveries">{SHIP_SKINS.map(item=>{
      const has=item.id===0||Boolean((state?.inventory?.owned??0)&(1<<item.id));
      return <button type="button" key={item.id} className={skin===item.id?'is-selected':''} aria-pressed={skin===item.id} disabled={busy} onClick={()=>{setSkin(item.id);setError('');setNotice('');}}>
        <span className="ship-skin-swatch" style={{background:item.hull,borderColor:item.trim}}/><strong>{item.name}</strong><small>{has?<><Check size={13}/>Owned</>:<><img src={usdc} alt="USDC"/>{price(item.price)}</>}</small>
      </button>;
    })}</div>
    <footer className="ship-skin-action"><span>{loading?'Loading collection…':!controller?'Sign in to view your collection':!state?.enabled?'Purchases unavailable':owned?'Owned · Cosmetic only':'Cosmetic only · All ship classes'}</span>
      {owned?<CommandActionButton icon={<Paintbrush/>} pending={pending==='equip'} disabled={busy||!state?.inventory||equipped===skin} onClick={()=>void command('equip',skin)}>{equipped===skin?'Equipped':`Equip ${SHIP_SKINS[skin].name}`}</CommandActionButton>
      :<CommandActionButton icon={<ShoppingCart/>} pending={pending==='buy'} disabled={busy||Boolean(block)} onClick={()=>setReview(skin)}>{block??`Unlock ${SHIP_SKINS[skin].name}`}</CommandActionButton>}
    </footer>
    {notice&&<p className="ship-skin-notice" role="status">{notice}</p>}{error&&<p className="ship-skin-error" role="alert">{error}</p>}
    {review!==null&&<CosmeticPurchaseReview skin={review} busy={pending!==null} onClose={()=>{if(!pending)setReview(null);}} onConfirm={()=>void command('buy',review)}/>}
  </section>;
}

export default function ShipCosmeticsStore({game,program,commander,busy=false}:{game:GameClient|null;program:PublicKey;commander:string;busy?:boolean}){
  const controller=useMemo(()=>game?createShipCosmeticController({connection:game.getConnection(),program,commander:new PublicKey(commander),send:instructions=>game.sendShipCosmeticInstructions(new PublicKey(commander),instructions)}):null,[game,program,commander]);
  return <ShipCosmeticsPanel key={commander} controller={controller} externalBusy={busy}/>;
}
