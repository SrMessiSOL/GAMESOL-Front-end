import test from 'node:test';
import assert from 'node:assert/strict';
import {Keypair,PublicKey,SYSVAR_CLOCK_PUBKEY} from '@solana/web3.js';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/game-state.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('game-state.ts',source,ts.ScriptTarget.Latest,true);
let method;
function visit(node){
  if(ts.isMethodDeclaration(node)&&node.name.getText(ast)==='launchFleet')method=node.getText(ast);
  ts.forEachChild(node,visit);
}
visit(ast);
assert(method);
const js=ts.transpileModule(`class GameClient { constructor(connection,provider){this.connection=connection;this.provider=provider;} ${method} }`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const GameClient=new Function('PublicKey','SYSVAR_CLOCK_PUBKEY','assertCommandInteger','assertResourceAmount',`${js};return GameClient;`)(PublicKey,SYSVAR_CLOCK_PUBKEY,()=>{},()=>{});

test('attack preparation blocks protected, absent and own targets before signing', async () => {
  const owner=Keypair.generate().publicKey, other=Keypair.generate().publicKey;
  const planet=Keypair.generate().publicKey, clock=Buffer.alloc(40);
  let now=700000, signing=0;
  const client=new GameClient({getAccountInfo:async()=>{clock.writeBigInt64LE(BigInt(now),32);return {data:clock};}}, {wallet:{publicKey:owner}});
  client.loadPlanetStateByPda=async()=>({planet:{owner:owner.toBase58()}});
  let destination={planet:{owner:other.toBase58(),createdAt:100000,protectionUntilTs:0}};
  client.getPlanetStateByCoordinates=async()=>destination;
  client.prepareVaultSigningForAuthority=async()=>{signing++;throw new Error('reached signing');};
  const launch=()=>client.launchFleet(planet,{cr:2},{},1,100,{galaxy:5,system:1,position:1});
  await assert.rejects(launch(),/target planet is protected/);
  now=704800;
  await assert.rejects(launch(),/reached signing/);
  assert.equal(signing,1);
  destination.planet.protectionUntilTs=800000;
  await assert.rejects(launch(),/target planet is protected/);
  destination.planet.owner=owner.toBase58();
  await assert.rejects(launch(),/another commander/);
  destination=null;
  await assert.rejects(launch(),/not an occupied planet/);
  assert.equal(signing,1);
});

test('attack preparation fails closed when chain time is unavailable', async()=>{
  const owner=Keypair.generate().publicKey,other=Keypair.generate().publicKey;
  const client=new GameClient({getAccountInfo:async()=>null},{wallet:{publicKey:owner}});
  client.loadPlanetStateByPda=async()=>({planet:{owner:owner.toBase58()}});
  client.getPlanetStateByCoordinates=async()=>({planet:{owner:other.toBase58(),createdAt:0,protectionUntilTs:0}});
  client.prepareVaultSigningForAuthority=async()=>assert.fail('must not request signing');
  await assert.rejects(client.launchFleet(owner,{cr:2},{},1,100,{galaxy:5,system:1,position:1}),/chain clock/);
});
