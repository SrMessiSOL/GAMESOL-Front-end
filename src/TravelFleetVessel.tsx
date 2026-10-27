import {createContext,useContext,useEffect,useState} from 'react';
import type {ReactNode} from 'react';
import type {Connection,PublicKey} from '@solana/web3.js';
import {FleetVessel,type FleetHull} from './FleetVessel';
import type {ShipClass} from './fleet-identity';
import {readTravelCosmetics,travelShipSkin,type TravelCosmeticInventories} from './travel-cosmetics';

const empty:TravelCosmeticInventories=new Map();
const TravelCosmeticsContext=createContext<TravelCosmeticInventories>(empty);
export function TravelCosmeticsProvider({inventories,children}:{inventories:TravelCosmeticInventories;children:ReactNode}){
  return <TravelCosmeticsContext.Provider value={inventories}>{children}</TravelCosmeticsContext.Provider>;
}
export function useTravelCosmetics(connection:Connection,program:PublicKey,owners:readonly string[]):TravelCosmeticInventories{
  const ownerKey=[...new Set(owners)].sort().join(',');
  const [loaded,setLoaded]=useState<{key:string;connection:Connection;program:string;records:TravelCosmeticInventories}|null>(null);
  const programKey=program.toBase58();
  useEffect(()=>{
    let active=true,inFlight=false;
    const refresh=async()=>{
      if(inFlight||!active||document.hidden)return;
      inFlight=true;
      try{
        const records=await readTravelCosmetics(connection,program,ownerKey?ownerKey.split(','):[]);
        if(active)setLoaded({key:ownerKey,connection,program:programKey,records});
      }catch{if(active)setLoaded({key:ownerKey,connection,program:programKey,records:empty});}
      finally{inFlight=false;}
    };
    void refresh();
    const interval=window.setInterval(()=>void refresh(),15_000);
    const foreground=()=>{if(!document.hidden)void refresh();};
    window.addEventListener('focus',foreground);document.addEventListener('visibilitychange',foreground);
    return()=>{active=false;window.clearInterval(interval);window.removeEventListener('focus',foreground);document.removeEventListener('visibilitychange',foreground);};
  },[connection,programKey,ownerKey]);
  return loaded?.key===ownerKey&&loaded.connection===connection&&loaded.program===programKey?loaded.records:empty;
}

export function TravelFleetVessel({kind,shipClass,ownerAddress,color,compact=false}:{kind:FleetHull;shipClass?:ShipClass;ownerAddress?:string;color:string;compact?:boolean}){
  const records=useContext(TravelCosmeticsContext);
  return <FleetVessel kind={kind} shipClass={shipClass} color={color} compact={compact} skin={travelShipSkin(records,ownerAddress,shipClass)}/>;
}
