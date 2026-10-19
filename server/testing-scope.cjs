// Inventory only: source presence and test-name matches are not execution proof.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const backend = path.resolve(root, '../../passkey-ufo-release');
const scopePath = path.join(root, 'docs/GAME_TEST_SCOPE_V1.json');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const inventory = [];
for (const program of ['game-state', 'market']) {
  const file = `programs/${program}/src/lib.rs`;
  const source = fs.readFileSync(path.join(backend, file), 'utf8');
  for (const match of source.matchAll(/^    pub fn (\w+)/gm)) {
    inventory.push({program, instruction: match[1], line: source.slice(0, match.index).split('\n').length, source: file});
  }
}
const catalogs = {};
for (const [file, names] of Object.entries({
  'src/game-state.ts': ['BUILDINGS', 'SHIPS'],
  'src/PlanetWorld.tsx': ['RESEARCH', 'DEFENSE'],
  'src/store-catalog.ts': ['STORE_PACKS'],
  'src/App.tsx': ['QUEST_DEFINITIONS', 'DAILY_ROTATING_QUESTS_UI', 'WEEKLY_ROTATING_QUESTS_UI', 'MONTHLY_ROTATING_QUESTS_UI', 'ALLIANCE_BUILDINGS'],
})) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(ast))) {
      let value = node.initializer;
      while (value && (ts.isAsExpression(value) || ts.isSatisfiesExpression(value))) value = value.expression;
      if (!value || !ts.isArrayLiteralExpression(value)) throw new Error(`Not an array: ${node.name.getText(ast)}`);
      catalogs[node.name.getText(ast)] = value.elements.map((item, index) => ({index, definition: item.getText(ast).replace(/\s+/g, ' ')}));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const name of names) if (!catalogs[name]) throw new Error(`Missing catalog ${name}`);
}
const api = fs.readdirSync(path.join(root, 'api')).filter(name => name.endsWith('.js')).sort();
const current = {instructions: inventory, catalogs, api};
if (process.argv.includes('--initialize')) {
  if (fs.existsSync(scopePath)) throw new Error('Frozen scope already exists; do not overwrite it.');
  fs.writeFileSync(scopePath, JSON.stringify({version: 1, date: '2026-10-19', ...current}, null, 2) + '\n');
} else {
  const baseline = JSON.parse(fs.readFileSync(scopePath, 'utf8'));
  // Line movements alone are not additions to scope.
  const names = list => list.map(item => `${item.program}:${item.instruction}`).sort();
  for (const [label, before, after] of [
    ['instructions', names(baseline.instructions), names(inventory)],
    ['catalogs', baseline.catalogs, catalogs], ['API', baseline.api, api],
  ]) if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`Explicit scope review required: ${label} changed`);
}
const checklist = fs.readFileSync(path.join(root, 'docs/GAME_TEST_CHECKLIST_V1.md'), 'utf8');
const appendix = ['# Frozen Instruction Inventory V1', '', 'Generated from canonical program entry points. Coverage is tracked by the linked master checklist, not inferred from this inventory.', '', '| Program | Instruction | Source line | Checklist |', '| --- | --- | ---: | --- |'];
const groups = [
  ['T01', /^(initialize_lazor_player|initialize_player|initialize_homeworld|initialize_colony|initialize_public_homeworld|initialize_public_colony|sync_planet_owner_index_vault|sync_public_planet_view)$/],
  ['T02', /^(rotate_vault|initialize_vault_for_existing_player|revoke_vault|extend_vault|sponsor_account_rent)$/],
  ['T05', /^produce(_vault)?$/], ['T06', /^(start_build|finish_build)(_vault)?$/],
  ['T07', /^(start_research|finish_research)(_vault)?$/],
  ['T08', /^(build_ship|finish_ship_build)(_vault)?$/],
  ['T09', /^(build_defense|finish_defense_build)(_vault)?$/],
  ['T10', /^launch_fleet(_vault)?$/], ['T11', /^resolve_transport(_empty)?(_vault)?$/],
  ['T12', /^resolve_colonize(_vault)?$/], ['T13', /^resolve_espionage(_vault)?$/], ['T14', /^resolve_attack(_vault)?$/],
  ['T15', /^accelerate_/],
  ['T16', /^(initialize_quest_state|initialize_quest_progress|initialize_quest_reward_targets|daily_check_in|daily_check_in_vault|claim_quest|claim_quest_vault)$/],
  ['T17', /^purchase_store_pack$/],
  ['T18', /^(create_alliance|join_alliance|request_join_alliance|request_join_alliance_vault|approve_join_request|reject_join_request|expel_alliance_member|transfer_alliance_leadership|leave_alliance)$/],
  ['T19', /^(initialize_alliance_treasury|initialize_alliance_treasury_vault|deposit_alliance_resources|deposit_alliance_resources_vault)$/],
  ['T20', /^upgrade_alliance_building$/], ['T21', /^claim_alliance_mission$/],
  ['T22', /^(set_commander_identity|clear_commander_identity)$/], ['T23', /^(start_ufo_expedition|advance_ufo_expedition|claim_ufo_loot|equip_ufo_loot|abort_ufo_expedition)$/],
  ['T24', /^(create_offer|cancel_offer|accept_offer|lock_resources_for_market|release_resources_from_market|transfer_resources_from_market)$/],
  ['T25', /^(create_planet_listing|cancel_planet_listing|buy_planet_listing|transfer_planet_from_market)$/],
  ['T26', /^transfer_planet$/],
  ['T31', /^(claim_system_sovereignty|fund_system_sovereignty|set_system_sovereignty_specialization|initialize_alliance_governance|initialize_gamesol_governance|enroll_alliance_in_gamesol_governance|sync_alliance_gamesol_governance|create_alliance_decision|execute_alliance_decision)$/],
  ['T32', /^(configure_ufo|initialize_store_config|update_store_config|rotate_store_config_admin|initialize_game_config|update_antimatter_mint|rotate_game_config_admin|claim_antimatter_faucet|initialize_market|initialize_escrow|update_market_config|rotate_market_config_admin)$/],
];
for (const item of inventory) {
  const matches = groups.filter(([, pattern]) => pattern.test(item.instruction));
  if (matches.length !== 1) throw new Error(`Instruction must map exactly once: ${item.instruction}`);
  const id = matches[0][0];
  if (!checklist.includes(`| ${id} |`)) throw new Error(`Missing checklist row ${id}`);
  appendix.push(`| ${item.program} | \`${item.instruction}\` | ${item.line} | ${id} |`);
}
appendix.push('', '## Catalog Definitions', '', 'Every indexed definition below is in scope. An aggregate pass does not certify every item. Use the parent checklist row and retain item-specific receipts when closing it.', '');
for (const [name, entries] of Object.entries(catalogs)) {
  appendix.push(`### ${name} (${entries.length})`, '', ...entries.map(item => `- ${name}-${String(item.index).padStart(2, '0')}: \`${item.definition.replaceAll('`', '')}\``), '');
}
appendix.push('## Server Endpoints', '', ...api.map(name => `- api/${name}`), '');
const output = path.join(root, 'docs/GAME_TEST_INVENTORY_V1.md');
if (process.argv.includes('--initialize')) fs.writeFileSync(output, appendix.join('\n'));
else if (fs.readFileSync(output, 'utf8') !== appendix.join('\n')) console.log('Inventory source lines changed; scope is unchanged. Regenerate appendix only after review.');
console.log(JSON.stringify({instructions: inventory.length, programs: Object.fromEntries(['game-state', 'market'].map(name => [name, inventory.filter(item => item.program === name).length])), catalogs: Object.fromEntries(Object.entries(catalogs).map(([name, entries]) => [name, entries.length])), endpoints: api.length, scopeSha256: hash(fs.readFileSync(scopePath))}, null, 2));
