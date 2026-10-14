import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Checks on the stylesheets, scripts and page template that keep the layout
// and accessibility contracts (ported from the Ruby layout tests in cc-428).

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const rule = (source, pattern) => {
  const match = source.match(pattern);
  assert.ok(match, `no rule matches ${pattern}`);
  return match.groups.body;
};

const view = read('src/web/resources/views/index.html.tmpl');
const interfaceCss = read('public/css/interface.css');
const buttonsCss = read('public/css/buttons.css');
const panelCss = read('public/css/player_panel.css');
const cardCss = read('public/css/player_cards.css');
const currentPlayerCss = read('public/css/current_player.css');
const mapCss = read('public/css/map.css');
const actionButtonsJs = read('public/js/action_buttons.js');
const gameStatusJs = read('public/js/game_status.js');
const playerPanelJs = read('public/js/player_panel.js');
const ordinaryPlayerActionsJs = read('public/js/ordinary_player_actions.js');

test('board uses the height left by the content-driven action bar', () => {
  const topView = rule(interfaceCss, /\.top-view\s*\{(?<body>[^}]*)\}/);
  const actionBar = rule(interfaceCss, /\.action-buttons\s*\{(?<body>[^}]*)\}/);

  assert.match(topView, /flex:\s*1\s+1\s+auto/);
  assert.match(topView, /min-height:\s*0/);
  assert.doesNotMatch(topView, /height:\s*80vh/);
  assert.match(actionBar, /min-height:\s*0/);
  assert.doesNotMatch(actionBar, /height:\s*20vh/);
});

test('current player actions and hand have separate layout areas', () => {
  assert.match(interfaceCss, /grid-template-areas:[^;]*"current actions"[^;]*"hand hand"/);
  assert.match(interfaceCss, /\.player-hand-container\s*\{[^}]*position:\s*static/);
  assert.match(view, /<div class="phase-actions" aria-label="Available actions">/);
});

test('phase and narrow screen layouts remain compact and touch friendly', () => {
  assert.match(actionButtonsJs, /actionBar\.dataset\.phase\s*=\s*phase/);
  assert.match(buttonsCss, /data-phase="draw_cards"/);
  assert.match(buttonsCss, /data-phase="infect_cities"/);
  assert.match(buttonsCss, /\.action-btn\s*\{[^}]*min-height:\s*72px/);
  assert.match(buttonsCss, /@media\s*\(max-width:\s*768px\)[^{]*\{.*?\.action-btn\s*\{[^}]*min-height:\s*64px/s);
  assert.match(interfaceCss, /\.phase-actions\s*\{[^}]*overflow-x:\s*auto/);
});

test('draw cards button uses its content width', () => {
  const drawCards = rule(
    buttonsCss,
    /\.action-buttons\[data-phase="draw_cards"\] \.draw-cards\s*\{(?<body>[^}]*)\}/
  );

  assert.match(drawCards, /width:\s*fit-content/);
  assert.match(drawCards, /min-width:\s*0/);
  assert.match(drawCards, /max-width:\s*100%/);
  assert.doesNotMatch(drawCards, /min-width:\s*132px/);
});

test('player drawer tracks the measured action bar height', () => {
  assert.match(actionButtonsJs, /ResizeObserver/);
  assert.match(actionButtonsJs, /--action-bar-height/);
  assert.match(panelCss, /bottom:\s*var\(--action-bar-height/);
});

test('action cards button fits the compact action row', () => {
  assert.match(buttonsCss, /\.action-btn\.special-action\s*\{[^}]*width:\s*72px/);
  assert.match(buttonsCss, /\.action-btn\.special-action\s*\{[^}]*height:\s*72px/);
  assert.match(buttonsCss, /\.action-btn\.special-action\s+i\s*\{[^}]*font-size:\s*24px/);
  assert.match(buttonsCss, /\.action-btn\.special-action\s+span\s*\{[^}]*font-size:\s*10px/);
});

test('current player takes part in the desktop action bar layout', () => {
  const desktop = rule(currentPlayerCss, /\.current-player\s*\{(?<body>[^}]*)\}/);

  assert.match(desktop, /position:\s*static/, 'reserves space in the desktop action bar');
  assert.match(desktop, /flex:\s*0\s+0\s+auto/, 'keeps a stable width beside the action buttons');
  assert.doesNotMatch(desktop, /position:\s*fixed/, 'fixed positioning can overlap the move button');
});

test('mobile current player stays in the action bar flow', () => {
  const mobile = rule(
    currentPlayerCss,
    /@media\s*\(max-width:\s*768px\)\s*\{.*?\.current-player\s*\{(?<body>[^}]*)\}/s
  );

  assert.match(mobile, /position:\s*static/, 'never covers the hand');
  assert.doesNotMatch(mobile, /bottom:/);
});

test('actions and outbreaks have visual and exact status', () => {
  assert.match(view, /class="action-pips" aria-hidden="true"/);
  assert.equal(view.match(/class="action-pip"/g).length, 4);
  assert.match(view, /id="outbreak-meter"[^>]*role="progressbar"/);
  assert.match(view, /<strong id="outbreak-counter">0<\/strong><span> \/ 8<\/span>/);
  assert.match(gameStatusJs, /setAttribute\('aria-label', `\$\{outbreaks\} of \$\{MAX_OUTBREAKS\} outbreaks`\)/);
});

test('disease rows expose name, state, supply and meter', () => {
  assert.match(view, /class="disease-name"/);
  assert.match(view, /class="cure-label">Not cured/);
  assert.match(view, /class="cube-count">24 of 24 cubes/);
  assert.match(view, /class="cube-meter" role="progressbar"/);
  assert.match(view, /aria-label="24 of 24 .* disease cubes remaining"/);
});

test('HUD uses text and patterns in addition to warning color', () => {
  assert.match(interfaceCss, /\.risk-label/);
  assert.match(interfaceCss, /\.supply-warning/);
  assert.match(interfaceCss, /repeating-linear-gradient/);
  assert.match(gameStatusJs, /dataset\.risk = risk/);
});

test('narrow layout places the HUD above a full-width board', () => {
  const responsive = rule(interfaceCss, /@media \(max-width: 768px\) \{(?<body>.*)\}\s*$/s);

  assert.match(responsive, /\.top-view\s*\{[^}]*flex-direction:\s*column/);
  assert.match(responsive, /\.left-view\s*\{[^}]*width:\s*100%/);
  assert.match(responsive, /\.right-view\s*\{[^}]*width:\s*100%/);
  assert.match(responsive, /\.game-status\s*\{[^}]*overflow-x:\s*auto/);
});

test('city hit target and piece layers are explicit', () => {
  const city = rule(mapCss, /\.map-inner \.city\s*\{(?<body>[^}]*)\}/);
  const pawns = rule(mapCss, /\.pawns\s*\{(?<body>[^}]*)\}/);
  const cubes = rule(mapCss, /\.disease-cube-layer\s*\{(?<body>[^}]*)\}/);
  const label = rule(mapCss, /\.map-inner \.city-label\s*\{(?<body>[^}]*)\}/);
  const connections = rule(mapCss, /\.connections-layer\s*\{(?<body>[^}]*)\}/);

  assert.match(city, /width:\s*44px/);
  assert.match(city, /height:\s*44px/);
  assert.match(city, /z-index:\s*10/);
  assert.match(connections, /z-index:\s*5/);
  assert.match(pawns, /display:\s*flex/);
  assert.match(pawns, /gap:\s*2px/);
  assert.match(pawns, /z-index:\s*35/);
  assert.match(cubes, /position:\s*absolute/);
  assert.match(cubes, /pointer-events:\s*none/);
  assert.match(cubes, /z-index:\s*8/);
  assert.match(label, /z-index:\s*15/);
  assert.match(label, /background-color:\s*#f8fbff/);
  assert.match(mapCss, /\.city\.is-current-city \.dot::after/);
  assert.match(mapCss, /\.pawn\.is-current-pawn::after/);
});

test('research stations use rounded square city markers', () => {
  const stationMarker = rule(mapCss, /\.map-inner \.city\.has-station \.dot\s*\{(?<body>[^}]*)\}/);

  assert.match(stationMarker, /width:\s*16px/);
  assert.match(stationMarker, /height:\s*16px/);
  assert.match(stationMarker, /border-radius:\s*3px/);
  assert.match(mapCss, /\.city\.has-station\.is-current-city \.dot::after\s*\{[^}]*border-radius:\s*4px/);
  assert.doesNotMatch(mapCss, /\.research-station\s*\{/);
});

test('roster keeps hands open with one visible scroll affordance', () => {
  const playerList = rule(panelCss, /\.player-list\s*\{(?<body>[^}]*)\}/);
  const roster = rule(panelCss, /\.player-roster\s*\{(?<body>[^}]*)\}/);
  const summary = rule(panelCss, /\.player-summary\s*\{(?<body>[^}]*)\}/);
  const handDetails = rule(panelCss, /\.player-hand-details\s*\{(?<body>[^}]*)\}/);
  const handPreview = rule(panelCss, /\.player-hand-preview\s*\{(?<body>[^}]*)\}/);
  const cardPreview = rule(cardCss, /\.hand-card-preview\s*\{(?<body>[^}]*)\}/);

  assert.doesNotMatch(handDetails, /max-height|overflow-y|display:\s*none/);
  assert.match(handPreview, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(cardPreview, /white-space:\s*normal/);
  assert.doesNotMatch(cardPreview, /overflow:\s*hidden|text-overflow/);
  assert.doesNotMatch(playerPanelJs, /expandedPlayers/);
  assert.match(panelCss, /\.player-panel-scroll-hint/);
  assert.match(playerPanelJs, /scrollHeight\s*-\s*playerList\.scrollTop\s*-\s*playerList\.clientHeight/);
  assert.match(playerPanelJs, /scrollIntoView\(\{\s*block:\s*'nearest'\s*\}\)/);

  // Ruby's String#[] gave nil (to_i 0) when there was no match.
  const px = (body, pattern) => Number(body.match(pattern)?.[1] ?? 0);
  const summaryHeight = px(summary, /min-height:\s*(\d+)px/);
  const cardHeight = px(cardPreview, /min-height:\s*(\d+)px/);
  const cardGap = px(handPreview, /gap:\s*(\d+)px/);
  const rosterGap = px(roster, /gap:\s*(\d+)px/);
  const listPadding = px(playerList, /padding:\s*(\d+)px/) * 2;
  const handPadding = 7; // 3px top + 4px bottom
  const metadataHeight = 18; // 10px hash plus the player-list gap
  const playerHeight = summaryHeight + 1 + 4 * cardHeight + 3 * cardGap + handPadding + 2;
  const totalHeight = 4 * playerHeight + 3 * rosterGap + listPadding + metadataHeight;

  assert.ok(totalHeight <= 500, `four players with four cards need ${totalHeight}px`);
});

test('build button warns and disables when the research station limit is reached', () => {
  assert.match(actionButtonsJs, /stationsAvailable\s*<=\s*0/);
  assert.match(actionButtonsJs, /Maximum number of research stations reached\./);
  assert.match(actionButtonsJs, /button\.title\s*=\s*reason/);
  assert.match(actionButtonsJs, /button\.dataset\.disabledReason\s*=\s*reason/);
});

test('enabling all buttons preserves buttons with a disabled reason', () => {
  assert.match(actionButtonsJs, /if\s*\(button\.dataset\.disabledReason\)\s*\{\s*return;\s*\}/);
});

test('build click handler rejects stale clicks at the research station limit', () => {
  assert.match(ordinaryPlayerActionsJs, /gameState\.researchStations\?\.available\s*<=\s*0/);
  assert.match(ordinaryPlayerActionsJs, /showInvalidActionMessage\('Maximum number of research stations reached\.'\)/);
});
