// Local-only render of the actual game infrastructure JSX; never signs or sends.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),http=require('node:http');
const ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const root=path.resolve(__dirname,'..');
function moduleFrom(source,extra={}){const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,{exports,React,...extra});return exports;}
const guards=moduleFrom(fs.readFileSync(path.join(root,'src/alliance-contribution.ts'),'utf8'));
const app=fs.readFileSync(path.join(root,'src/App.tsx'),'utf8');
const costs=app.slice(app.indexOf('export const ALLIANCE_BUILDINGS ='),app.indexOf('function boostPercentLabel('));
const rules=moduleFrom(costs);
const source=fs.readFileSync(path.join(root,'src/PlanetWorld.tsx'),'utf8');
const start=source.indexOf('<div className="pw-alliance-buildings">'),end=source.indexOf('<section className="pw-alliance-roster">',start);
if(start<0||end<0)throw Error('Cannot locate live infrastructure controls');
const component=moduleFrom(`export function Fixture({allianceTreasury,allianceMembership,busy}) { const runAllianceAction=()=>{throw Error('No wallet in visual fixture')}; return (${source.slice(start,end)}); }`,{...guards,...rules}).Fixture;
const css=['planet-world-local.css','command-controls.css'].filter(name=>fs.existsSync(path.join(root,'src',name))).map(name=>fs.readFileSync(path.join(root,'src',name),'utf8')).join('\n');
const server=http.createServer((req,res)=>{
  const level=Number(new URL(req.url,'http://localhost').searchParams.get('level')??25);
  const role=Number(new URL(req.url,'http://localhost').searchParams.get('role')??2);
  const treasury={metal:100000000000n,crystal:100000000000n,deuterium:100000000000n,antimatter:100000000000000n,logisticsHub:level,researchGrid:level,defenseCoordination:level,tradeNetwork:level};
  const html=renderToStaticMarkup(React.createElement(component,{allianceTreasury:treasury,allianceMembership:{role},busy:false}));
  res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GAMESOL infrastructure cap check</title><style>body{margin:0;background:#07101d;color:#edfaff;font:14px system-ui}main{max-width:980px;margin:32px auto;padding:16px}h1{font-size:20px}'+css+'</style></head><body><main class="pw-command-panel"><h1>Alliance Infrastructure</h1>'+html+'</main></body></html>');
});
server.listen(4033,'127.0.0.1',()=>console.log('Read-only cap fixture: http://127.0.0.1:4033/?level=25'));
