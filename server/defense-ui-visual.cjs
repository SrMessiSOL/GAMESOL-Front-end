// Read-only interactive fixture using the actual defense JSX, option expressions and controls.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/PlanetWorld.tsx'),'utf8');
const ast=ts.createSourceFile('PlanetWorld.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),nodes={};
const names=['DEFENSE','DEFENSE_REQUIREMENTS','allDefenseOptions','defenseOptions','defenseReadyCount','defenseUnitCount','activeShieldCount','costs'];
function visit(node){if(ts.isVariableDeclaration(node)&&names.includes(node.name.getText(ast)))nodes[node.name.getText(ast)]=node.getText(ast);ts.forEachChild(node,visit);}
visit(ast);for(const name of names)if(!nodes[name])throw Error('Missing live definition '+name);
const start=source.indexOf('{modal === "defense" && '),end=source.indexOf('{modal === "quests"',start);
if(start<0||end<0)throw Error('Defense screen not found');
const jsx=source.slice(start,end).trim().slice('{modal === "defense" && '.length,-1);
const styles=[...source.matchAll(/^import ['"](.+\.css)['"];?/gm)].map(m=>`import '/src/${m[1].replace('./','')}';`).join('\n');
const code=`import React from 'react';import {createRoot} from 'react-dom/client';
import {Shield,Pickaxe,Gem,FlaskConical} from 'lucide-react';
import {CommandActionButton,CommandQuantity} from '/src/design-system/command-controls';
import {defenseProductionBlock} from '/src/command-validation';
import {resolveGameArt} from '/src/ui-art';import '/src/index.css';import '/src/design-system/tokens.css';${styles}
const ${nodes.DEFENSE};const ${nodes.DEFENSE_REQUIREMENTS};
function Fixture(){
const scenario=new URLSearchParams(location.search).get('scenario')||'eligible';
const [quantity,setQuantity]=React.useState(1),[productionQuantityValid,setProductionQuantityValid]=React.useState(true),[showLockedDefenses,setShowLockedDefenses]=React.useState(false),[calls,setCalls]=React.useState(0);
const state={planet:{shipyard:12,smallShieldDome:scenario==='online'?1:0,antiBallisticMissile:scenario==='legacy'?2:0}};
const busy=false,pendingCommand=null,shipyardBusy=scenario==='busy',shipyardUpgrading=scenario==='upgrading';
const requirementRows=rows=>rows.map(([scope,key,level])=>({label:key,current:scenario==='locked'?0:20,required:level}));
const requirementsMet=rows=>rows.every(r=>r.current>=r.required),canAfford=()=>scenario!=='poor';
const missingRequirementLabel=rows=>rows.filter(r=>r.current<r.required).map(r=>r.label+' '+r.required).join(', ');
const queues=[],queueCommand=()=>null,trackCommand=async(tag,fn)=>fn(),run=()=>setCalls(v=>v+1);
const ${nodes.allDefenseOptions};const ${nodes.defenseOptions};const ${nodes.defenseReadyCount};const ${nodes.defenseUnitCount};const ${nodes.activeShieldCount};const ${nodes.costs};
return <div className="planet-world"><div className="pw-modal-backdrop"><main className="pw-command-modal pw-command-kind-defense"><div className="pw-modal-content"><label>Test state <select aria-label="Test state" value={scenario} onChange={e=>location.search='?scenario='+e.target.value}>{['eligible','online','legacy','busy','upgrading','poor','locked'].map(s=><option key={s}>{s}</option>)}</select></label><output aria-label="Prepared commands">{calls}</output>${jsx}</div></main></div></div>;
}createRoot(document.getElementById('root')).render(<Fixture/>);`;
const js=ts.transpileModule(code,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
(async()=>{const {createServer}=await import('vite');const server=await createServer({root,configFile:false,server:{host:'127.0.0.1',port:4197,strictPort:true},plugins:[{name:'read-only-defense-fixture',resolveId(id){if(id==='/__defense-entry.tsx')return '\0defense-fixture.tsx';},load(id){if(id==='\0defense-fixture.tsx')return js;},configureServer(s){s.middlewares.use((req,res,next)=>{if(new URL(req.url,'http://localhost').pathname!=='/__defense-ui')return next();res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>GAMESOL Defense UI checks</title><style>body{margin:0;background:#07141b;color:#dcecf0;font:14px system-ui}main.pw-command-panel{position:relative;inset:auto;max-width:1040px;margin:0 auto;padding:20px;box-sizing:border-box;overflow:visible;height:auto;max-height:none}select{background:#132b35;color:#e4f4f5;padding:8px;margin:0 12px 16px}output{font-size:12px}</style></head><body><div id="root"></div><script type="module" src="/__defense-entry.tsx"></script></body></html>');});}}]});await server.listen();console.log('Read-only actual defense UI: http://127.0.0.1:4197/__defense-ui');})().catch(e=>{console.error(e);process.exitCode=1;});
