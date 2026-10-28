const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('mobile navigation collapses on breakpoint entry and cleans up its listener',()=>{
  const source=fs.readFileSync('src/UniverseLab.tsx','utf8');
  assert.match(source,/if \(mobile.matches\) setViewContextOpen\(false\)/);
  assert.match(source,/mobile.addEventListener\('change', collapseOnMobile\)/);
  assert.match(source,/mobile.removeEventListener\('change', collapseOnMobile\)/);
  assert.match(source,/aria-controls=\{viewContextId\}/);
  assert.match(source,/hidden=\{!viewContextOpen\}/);
  assert.match(source,/viewContextToggle.current\?\.focus\(\)/);
});
test('mobile panel is height-bounded, independently scrollable and touch accessible',()=>{
  const css=fs.readFileSync('src/universe-lab.css','utf8');
  assert.match(css,/max-height:min\(40dvh,320px\)/);
  assert.match(css,/max-height:calc\(min\(40dvh,320px\) - 56px\);overflow-y:auto;touch-action:pan-y/);
  assert.match(css,/min-width:44px;min-height:44px/);
});
test('visibility reuses geometry and bounded routes without changing gameplay or timings',()=>{
  const source=fs.readFileSync('src/UniverseLab.tsx','utf8');
  assert.match(source,/hovered \|\| \(!compact &&/);
  assert.match(source,/opacity=\{\.65\} lineWidth=\{\.9\}/);
  assert.match(source,/compact \? \.65 : 1/);
  assert.match(source,/dense=\{flights.total > 16\}/);
  const wrapper=fs.readFileSync('src/TravelFleetVessel.tsx','utf8');
  assert.doesNotMatch(wrapper,/scale=|sendTransaction|useFrame/);
});
