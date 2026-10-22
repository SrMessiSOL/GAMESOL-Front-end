const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const source=fs.readFileSync(require.resolve('../src/game-state.ts'),'utf8');
const writer=source.match(/class BorshWriter \{[\s\S]*?\n\}/)[0];
const encoder=source.match(/function encodeColonyArgs\([\s\S]*?\n\}/)[0];
const context={Buffer};vm.createContext(context);
vm.runInContext(ts.transpileModule(writer+'\n'+encoder,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,context);

test('colony payload matches backend params and preserves all mission slots',()=>{
  const fleet=['sSmallCargo','sLargeCargo','sLightFighter','sHeavyFighter','sCruiser','sBattleship','sBattlecruiser','sBomber','sDestroyer','sDeathstar','sRecycler','sEspionageProbe'];
  for(const colonyName of ['Colony 3','Colony'])for(const slot of [0,1]){
    const mission={colonyName,targetGalaxy:9,targetSystem:583,targetPosition:3,cargoMetal:123n,cargoCrystal:456n,cargoDeuterium:789n,...Object.fromEntries(fleet.map((field,i)=>[field,i+1]))};
    const data=context.encodeColonyArgs(123456,mission,slot);let offset=0;
    assert.equal(data.readBigInt64LE(offset),123456n);offset+=8;
    const length=data.readUInt32LE(offset);offset+=4;assert.equal(data.subarray(offset,offset+length).toString(),colonyName);offset+=length;
    assert.equal(data.readUInt16LE(offset),9);offset+=2;assert.equal(data.readUInt16LE(offset),583);offset+=2;assert.equal(data[offset++],3);
    for(const value of [123n,456n,789n]){assert.equal(data.readBigUInt64LE(offset),value);offset+=8;}
    for(let i=0;i<12;i++){assert.equal(data.readUInt32LE(offset),i+1);offset+=4;}
    assert.equal(data.readUInt32LE(offset),0);offset+=4;
    assert.equal(data[offset++],slot);assert.equal(offset,data.length,'Extra fleet fields must not shift the slot');
  }
});
