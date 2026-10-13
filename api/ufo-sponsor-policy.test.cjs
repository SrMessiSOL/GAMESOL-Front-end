const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {PublicKey,Keypair,Ed25519Program}=require('@solana/web3.js');
const {_test}=require('./lazor-paymaster.js');
const game=require('../server/ufo-attestations.cjs').PROGRAM;
const lazor=new PublicKey('4h3XoNReAgEcHVxcZ8sw2aufi9MTr7BbvYYjzjWDyDxS');
function bundle(){
  const sponsor=Keypair.generate();
  const message=Buffer.concat([Buffer.from('gamesol:ufo:devnet:v1'),game.toBuffer(),new PublicKey('53UVubjHQpC4RmUnDGU1PV3f2bYFk6GcWb3SgtYFMHTb').toBuffer(),Buffer.alloc(178)]);
  const proof=Ed25519Program.createInstructionWithPublicKey({publicKey:new PublicKey('9XEL6rVQ2GK85ic1j2Nf6kykybsAtsP8nYzNnNCMun4a').toBytes(),message,signature:Buffer.alloc(64)});
  const action=crypto.createHash('sha256').update('global:start_ufo_expedition').digest().subarray(0,8);
  const packed=Buffer.concat([Buffer.from([4,1,0,0,8,0]),action]);
  return {sponsor,transaction:{message:{staticAccountKeys:[sponsor.publicKey,Ed25519Program.programId,lazor,game],addressTableLookups:[],compiledInstructions:[{programIdIndex:1,accountKeyIndexes:[],data:proof.data},{programIdIndex:2,accountKeyIndexes:[3],data:packed}]}}};
}
test('sponsor accepts only a canonical proof paired with the active UFO action without raising debit limits',()=>{
  const {transaction,sponsor}=bundle();assert.equal(_test.assertTransactionPolicy(transaction,sponsor).maximumDebit,250000);
});
test('sponsor rejects unrelated, repeated, late and cross-instruction ownership precompiles',()=>{
  for(const change of [t=>{t.message.compiledInstructions[0].data[16]^=1;},t=>{t.message.compiledInstructions[0].data[4]=0;},t=>{t.message.compiledInstructions.push(t.message.compiledInstructions[0]);},t=>{t.message.compiledInstructions.reverse();},t=>{t.message.compiledInstructions[1].data[6]^=1;}]){
    const {transaction,sponsor}=bundle();change(transaction);assert.throws(()=>_test.assertTransactionPolicy(transaction,sponsor));
  }
});
