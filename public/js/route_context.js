// Presentation-only projection. Ordering follows PlayerActions#move.
export function canonicalRouteId(first, second) {
  return JSON.stringify([first, second].sort());
}

export function projectDestinations(cities, state, actingIndex, pawnIndex) {
  const destinations = new Map();
  const actor = state?.players?.find(player => player.index === actingIndex);
  const pawn = state?.players?.find(player => player.index === pawnIndex);
  if (!actor || !pawn || !cities?.[pawn.location] ||
      (actingIndex !== pawnIndex && actor.role !== 'dispatcher')) {
    return { source: null, destinations };
  }
  const source = pawn.location;
  const cards = new Set((actor.hand ?? []).filter(card => card.type === 'city').map(card => card.name));
  const stations = new Set(state.researchStations?.locations ?? []);
  const expertBranch = actor.role === 'operations_expert' && actingIndex === pawnIndex &&
    stations.has(source) && cards.size > 0;
  for (const destination of Object.keys(cities)) {
    if (destination === source) continue;
    const types = [];
    if (cities[source].connections?.includes(destination)) types.push('drive / ferry');
    if (stations.has(source) && stations.has(destination)) types.push('shuttle flight');
    // The backend's used-Expert branch rejects even otherwise available flights.
    if (expertBranch && state.gameStatus?.operations_expert_move_used) {
      if (types.length) destinations.set(destination, types);
      continue;
    }
    if (expertBranch) types.push('Operations Expert station move');
    if (actor.role === 'dispatcher' && state.players.some(player =>
      player.index !== pawnIndex && player.location === destination)) types.push('Dispatcher gather');
    if (cards.has(destination)) types.push('direct flight');
    if (cards.has(source)) types.push('charter flight');
    if (types.length) destinations.set(destination, types);
  }
  return { source, destinations };
}

const CITY_STATES = ['move-source', 'move-valid', 'move-invalid', 'move-hovered', 'move-focused'];
const ROUTE_STATES = ['route-dimmed', 'route-adjacent', 'route-hovered', 'route-focused'];

// Apply logical state to every physical copy; geometry is deliberately untouched.
export function applyRouteContext(root, projection, hovered = null, focused = null) {
  const source = projection?.source;
  const valid = name => projection?.destinations.has(name);
  for (const route of root.querySelectorAll('.board-route')) {
    route.classList.remove(...ROUTE_STATES);
    if (!source) continue;
    const { routeFrom, routeTo } = route.dataset;
    const adjacent = routeFrom === source || routeTo === source;
    const destination = routeFrom === source ? routeTo : routeFrom;
    route.classList.add(adjacent ? 'route-adjacent' : 'route-dimmed');
    if (adjacent && valid(destination)) {
      if (destination === hovered) route.classList.add('route-hovered');
      if (destination === focused) route.classList.add('route-focused');
    }
  }
  for (const city of root.querySelectorAll('.city')) {
    city.classList.remove(...CITY_STATES);
    const name = city.dataset.cityName;
    const base = city.dataset.baseDescription ?? city.getAttribute('aria-label') ?? name;
    city.dataset.baseDescription = base;
    let description = base;
    if (source) {
      const isSource = name === source;
      city.classList.add(isSource ? 'move-source' : valid(name) ? 'move-valid' : 'move-invalid');
      if (name === hovered || (isSource && valid(hovered))) city.classList.add('move-hovered');
      if (name === focused || (isSource && valid(focused))) city.classList.add('move-focused');
      description += isSource ? '. Move source' : valid(name)
        ? `. Valid destination: ${projection.destinations.get(name).join(', ')}` : '. Invalid destination';
    }
    city.setAttribute('aria-label', description);
  }
}

export function createRouteController(root, announce) {
  let context = {};
  let projection = null;
  let hovered = null;
  let focused = null;
  let lastAnnouncement = '';
  const render = () => applyRouteContext(root, projection, hovered, focused);
  return {
    update(next) {
      context = { ...context, ...next };
      hovered = focused = null;
      const { cities, state, mode, pawnIndex, blocked } = context;
      const status = state?.gameStatus;
      const actorIndex = status?.currentPlayerIndex;
      const actor = state?.players?.find(player => player.index === actorIndex);
      const active = !blocked && status?.phase === 'player_actions' && status.actions_remaining > 0 &&
        !status.pending_hand_limit && !status.gameOver && ['move', 'moveSelectedPlayer'].includes(mode);
      const selectedIndex = actor?.role === 'dispatcher' ? pawnIndex : actorIndex;
      projection = active ? projectDestinations(cities, state, actorIndex, selectedIndex) : null;
      const pawn = state?.players?.find(player => player.index === selectedIndex);
      const announcement = projection?.source
        ? `Moving player ${selectedIndex + 1}, ${pawn.role.replaceAll('_', ' ')}, from ${projection.source}. ${projection.destinations.size} valid destinations.`
        : active && actor?.role === 'dispatcher' ? 'Select a pawn to move.' : '';
      if (announcement !== lastAnnouncement) {
        announce(announcement);
        lastAnnouncement = announcement;
      }
      render();
    },
    hover(name) { hovered = name; render(); },
    focus(name) { focused = name; render(); },
    redraw() { render(); }
  };
}
