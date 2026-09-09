// map.js
import { MAP_WIDTH } from './constants.js';
import { createSimpleElement } from './dom.js';

// Store the current transform state so it can be preserved during re-renders
let currentTransform = {
  translateX: -MAP_WIDTH,
  translateY: 0,
  scale: 1
};

const LABEL_HEIGHT = 16;
const LABEL_GAP = 10;
const LABEL_POSITIONS = [
  'below',
  'right',
  'left',
  'above',
  'below-right',
  'below-left',
  'above-right',
  'above-left'
];

function formatRoleName(role) {
  return String(role)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, character => character.toUpperCase());
}

function cityDescription(cityName, cityData) {
  const details = [];
  const cubeCount = Number(cityData.cubes) || 0;

  if (cityData.isCurrentCity) details.push('current player location');
  if (cityData.hasStation) details.push('research station');
  if (cubeCount > 0) details.push(`${cubeCount} disease ${cubeCount === 1 ? 'cube' : 'cubes'}`);
  if (cityData.pawns?.length) {
    const roles = cityData.pawns.map(pawn => formatRoleName(pawn.role ?? pawn));
    details.push(`${roles.length} ${roles.length === 1 ? 'pawn' : 'pawns'}: ${roles.join(', ')}`);
  }

  return details.length ? `${cityName}. ${details.join('. ')}` : cityName;
}

// Create a fixed-size city hit target with independently layered board pieces.
export function createCityOnPanel(cityData, cityName, panel) {
  const city = createSimpleElement('button', ['city', cityData.color]);
  city.type = 'button';

  // Position the city div at the exact coordinate (dot will be centered)
  const xPos = cityData.x + panel * MAP_WIDTH;
  city.style.left = `${xPos}px`;
  city.style.top = `${cityData.y - 165}px`;

  // Keep the coordinate and interaction target independent from the piece layout.
  city.dataset.cityName = cityName;
  city.dataset.labelPosition = cityData.labelPosition ?? 'below';
  city.classList.add(`label-${city.dataset.labelPosition}`);
  city.setAttribute('aria-label', cityDescription(cityName, cityData));

  if (cityData.isCurrentCity) {
    city.classList.add('is-current-city');
    city.setAttribute('aria-current', 'location');
  }

  const cubeCount = Number(cityData.cubes) || 0;
  if (cubeCount > 0) city.classList.add('has-cubes', `cube-count-${cubeCount}`);
  if (cityData.pawns?.length) city.classList.add('has-pawns');

  // City dot (centered at the city coordinates)
  const dot = createSimpleElement('span', 'dot');
  dot.title = cityName;
  city.appendChild(dot);

  // City label (positioned below the dot)
  const label = createSimpleElement('span', 'city-label', cityName.replace(/ /g, '\u00A0'));
  city.appendChild(label);

  // Disease cubes remain individually visible and carry an explicit count.
  if (cubeCount > 0) {
    const cubes = createSimpleElement('span', 'cubes');
    cubes.dataset.count = cubeCount;
    cubes.setAttribute('aria-hidden', 'true');

    for (let i = 0; i < cubeCount; i++) {
      const cube = createSimpleElement('span', ['cube', cityData.color]);
      cubes.appendChild(cube);
    }

    const cubeCountBadge = createSimpleElement('span', 'cube-count-badge', cubeCount);
    cubes.appendChild(cubeCountBadge);

    city.appendChild(cubes);
  }

  // Pawns use separate silhouettes instead of overlapping font glyphs.
  if (cityData.pawns && cityData.pawns.length > 0) {
    const pawns = createSimpleElement('span', 'pawns');
    pawns.setAttribute('aria-hidden', 'true');

    cityData.pawns.forEach(pawnData => {
      const role = String(pawnData.role ?? pawnData).toLowerCase();
      const isCurrent = Boolean(pawnData.isCurrent);
      const pawn = createSimpleElement('span', ['pawn', role.replaceAll('_', '-')]);
      if (isCurrent) pawn.classList.add('is-current-pawn');
      pawn.dataset.playerIndex = pawnData.playerIndex ?? '';
      pawn.title = `${formatRoleName(role)}${isCurrent ? ' (current player)' : ''}`;
      pawn.appendChild(createSimpleElement('span', 'pawn-head'));
      pawn.appendChild(createSimpleElement('span', 'pawn-body'));
      pawns.appendChild(pawn);
    });

    city.appendChild(pawns);
  }

  // A station is its own building silhouette; the circular city marker remains visible.
  if (cityData.hasStation) {
    city.classList.add('has-station');
    const station = createSimpleElement('span', 'research-station', 'R');
    station.setAttribute('aria-hidden', 'true');
    city.appendChild(station);
  }

  return city;
}

// This function should be called whenever scrolling.js updates the transform
export function saveCurrentTransform(translateX, translateY, scale) {
  currentTransform = { translateX, translateY, scale };
}

// Updated render function preserving the current transform
export function renderPandemicCities(pandemicMap) {
  const container = document.querySelector('.map-container');

  // Save current transform if it exists
  const currentMapInner = document.querySelector('.map-inner');
  if (currentMapInner) {
    const transform = currentMapInner.style.transform;
    const translateMatch = transform.match(/translate\((-?\d+\.?\d*)px,\s*(-?\d+\.?\d*)px\)/);
    const scaleMatch = transform.match(/scale\((\d+\.?\d*)\)/);

    if (translateMatch && scaleMatch) {
      currentTransform.translateX = parseFloat(translateMatch[1]);
      currentTransform.translateY = parseFloat(translateMatch[2]);
      currentTransform.scale = parseFloat(scaleMatch[1]);
    }
  }

  // Clear previous content
  container.innerHTML = '';

  // Create inner container for proper sizing
  const mapInner = createSimpleElement('div', 'map-inner');

  // Apply the saved transform instead of always resetting to initial
  mapInner.style.transform = `translate(${currentTransform.translateX}px, ${currentTransform.translateY}px) scale(${currentTransform.scale})`;

  // Add the SVG layer back
  const svgLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svgLayer.classList.add('connections-layer');
  svgLayer.setAttribute('width', '100%');
  svgLayer.setAttribute('height', '100%');
  mapInner.appendChild(svgLayer);

  // Track which cities we've rendered to avoid duplicates
  const renderedCities = new Set();

  const labelPositions = layoutCityLabels(pandemicMap);

  // First, render all the base cities, three copies of each
  for (const [cityName, cityData] of Object.entries(pandemicMap)) {
    const renderData = { ...cityData, labelPosition: labelPositions[cityName] };
    mapInner.appendChild(createCityOnPanel(renderData, cityName, 0));
    mapInner.appendChild(createCityOnPanel(renderData, cityName, 1));
    mapInner.appendChild(createCityOnPanel(renderData, cityName, 2));
    renderedCities.add(cityName);
  }

  // Append the inner container to the scrollable container
  container.appendChild(mapInner);

  // Set initial cursor style
  container.style.cursor = 'grab';

  // Render the connections after creating all cities
  renderConnections(pandemicMap);

  // Dispatch an event to notify that the map has been updated
  const mapUpdatedEvent = new CustomEvent('mapUpdated');
  document.dispatchEvent(mapUpdatedEvent);
}

function estimatedLabelWidth(cityName) {
  return Math.min(92, Math.max(30, cityName.length * 5.8 + 8));
}

// Return the estimated label rectangle in map coordinates. Keeping this pure makes
// collision handling independent from browser font metrics and stable across panels.
export function getCityLabelBounds(cityName, city, position) {
  const width = estimatedLabelWidth(cityName);
  const height = LABEL_HEIGHT;
  const x = city.x;
  const y = city.y;

  switch (position) {
    case 'right':
      return { x: x + LABEL_GAP, y: y - height / 2, width, height };
    case 'left':
      return { x: x - LABEL_GAP - width, y: y - height / 2, width, height };
    case 'above':
      return { x: x - width / 2, y: y - LABEL_GAP - height, width, height };
    case 'below-right':
      return { x: x + LABEL_GAP, y: y + LABEL_GAP, width, height };
    case 'below-left':
      return { x: x - LABEL_GAP - width, y: y + LABEL_GAP, width, height };
    case 'above-right':
      return { x: x + LABEL_GAP, y: y - LABEL_GAP - height, width, height };
    case 'above-left':
      return { x: x - LABEL_GAP - width, y: y - LABEL_GAP - height, width, height };
    default:
      return { x: x - width / 2, y: y + LABEL_GAP, width, height };
  }
}

function rectanglesOverlap(left, right, padding = 0) {
  return left.x < right.x + right.width + padding &&
    left.x + left.width + padding > right.x &&
    left.y < right.y + right.height + padding &&
    left.y + left.height + padding > right.y;
}

// Piece footprints mirror map.css and let labels move away from occupied cities.
export function getCityPieceBounds(city) {
  const bounds = [];

  if ((Number(city.cubes) || 0) > 0) {
    bounds.push({ x: city.x + 8, y: city.y + 8, width: 20, height: 20 });
  }

  if (city.pawns?.length) {
    const width = city.pawns.length * 13 + (city.pawns.length - 1) * 2;
    bounds.push({ x: city.x - width / 2, y: city.y - 29, width, height: 19 });
  }

  if (city.hasStation) {
    bounds.push({ x: city.x + 7, y: city.y - 22, width: 20, height: 21 });
  }

  return bounds;
}

function labelPositionScore(cityName, map, layouts, position) {
  const bounds = getCityLabelBounds(cityName, map[cityName], position);
  let score = LABEL_POSITIONS.indexOf(position);

  // Labels should never cover a city marker, including their own marker.
  for (const city of Object.values(map)) {
    const markerBounds = { x: city.x - 9, y: city.y - 9, width: 18, height: 18 };
    if (rectanglesOverlap(bounds, markerBounds, 2)) score += 10_000;

    for (const pieceBounds of getCityPieceBounds(city)) {
      if (rectanglesOverlap(bounds, pieceBounds, 2)) score += 10_000;
    }
  }

  // Repeated relaxation considers every other label rather than just a nearest pair.
  for (const [otherName, otherPosition] of Object.entries(layouts)) {
    if (otherName === cityName) continue;
    const otherBounds = getCityLabelBounds(otherName, map[otherName], otherPosition);
    if (rectanglesOverlap(bounds, otherBounds, 2)) score += 1_000;
  }

  return score;
}

// Place labels around all eight sides of a marker, then repeatedly resolve collisions.
// The stable ordering and fixed size estimate prevent labels from jumping between
// equivalent positions on identical game-state renders.
export function layoutCityLabels(map) {
  const cityNames = Object.keys(map).sort();
  const layouts = Object.fromEntries(cityNames.map(cityName => [cityName, 'below']));

  for (let pass = 0; pass < 6; pass++) {
    for (const cityName of cityNames) {
      layouts[cityName] = LABEL_POSITIONS.reduce((best, candidate) => {
        const candidateScore = labelPositionScore(cityName, map, layouts, candidate);
        const bestScore = labelPositionScore(cityName, map, layouts, best);
        return candidateScore < bestScore ? candidate : best;
      }, layouts[cityName]);
    }
  }

  return layouts;
}

// Prepare the raw city data for rendering by adding default properties
export function prepareMapForRendering(rawMap) {
  const fullMap = {};

  for (const [cityName, data] of Object.entries(rawMap)) {
    fullMap[cityName] = {
      ...data,
      cubes: 0,           // No disease cubes by default
      pawns: [],          // No pawns by default
      hasStation: false,  // No research station by default
      isCurrentCity: false
    };
  }

  return fullMap;
}

// Add live game pieces without mutating the authoritative game-state objects.
export function prepareMapWithGameState(rawMap, gameState) {
  const updatedMap = prepareMapForRendering(rawMap);
  const currentPlayerIndex = gameState.gameStatus?.currentPlayerIndex;

  for (const diseaseInfo of Object.values(gameState.diseaseCubes ?? {})) {
    for (const [cityName, cubeCount] of Object.entries(diseaseInfo?.onBoard ?? {})) {
      if (updatedMap[cityName]) updatedMap[cityName].cubes = cubeCount;
    }
  }

  for (const cityName of gameState.researchStations?.locations ?? []) {
    if (updatedMap[cityName]) updatedMap[cityName].hasStation = true;
  }

  const players = Array.isArray(gameState.players) ? gameState.players : [];
  const playerCount = players.length;
  const orderedPlayers = [...players].sort((left, right) => {
    const leftOrder = (playerCount + left.index - currentPlayerIndex) % playerCount;
    const rightOrder = (playerCount + right.index - currentPlayerIndex) % playerCount;
    return leftOrder - rightOrder;
  });

  for (const player of orderedPlayers) {
    const city = updatedMap[player?.location];
    if (!city) continue;

    const isCurrent = player.index === currentPlayerIndex;
    city.pawns.push({
      role: String(player.role).toLowerCase(),
      playerIndex: player.index,
      isCurrent
    });
    if (isCurrent) city.isCurrentCity = true;
  }

  return updatedMap;
}

// Helper function to draw a styled line in the SVG
function drawStyledLine(svg, x1, y1, x2, y2, isDashed = false) {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  line.setAttribute('stroke', '#aaa');
  line.setAttribute('stroke-width', '2');

  if (isDashed) {
    line.setAttribute('stroke-dasharray', '5,3');
  }

  line.setAttribute('stroke-linecap', 'round');
  svg.appendChild(line);

  return line;
}

// Helper function to calculate where a line would intersect the map edge
function calculateEdgeIntersection(x1, y1, x2, y2, edgeX, isWrapAround = false) {
  // If the line is vertical, there's no well-defined intersection
  if (x2 === x1) {
    return y1;
  }

  // When creating wrap-around connections, we need to adjust x2
  // The incoming x2 should already be adjusted for wrap-around if isWrapAround is true

  // Now calculate the y value at the specified edge x
  return y1 + (y2 - y1) / (x2 - x1) * (edgeX - x1);
}

function renderConnection(svg, x1, y1, target) {
  // Get the target's adjusted position
  // The target is target.x + k*MAP_WIDTH.
  // k is chosen so that 2 * Math.abs(x1 - target.x + k*MAP_WIDTH) < MAP_WIDTH
  const dx = target.x - x1;
  const k = Math.floor(0.5 - dx / MAP_WIDTH);
  const x2 = target.x + k * MAP_WIDTH;

  if (x2 >= 0 && x2 < 3*MAP_WIDTH) {
    drawStyledLine(svg, x1, y1 - 165, x2, target.y - 165);
  } else {
    // Target connection is out of bounds. Only draw to the edge of the map
    if (x2 < 0) {
      // City is on left, target on right - draw to left edge
      const leftEdgeY = calculateEdgeIntersection(x1, y1 - 165, x2, target.y - 165, 0);
      drawStyledLine(svg, x1, y1 - 165, 0, leftEdgeY - 165, true);
    } else {
      // City is on right, target on left - draw to right edge
      const rightEdgeY = calculateEdgeIntersection(x1, y1, x2, target.y, 3*MAP_WIDTH);
      drawStyledLine(svg, x1, y1 - 165, 3*MAP_WIDTH, rightEdgeY - 165, true);
    }
  }
}

// Improved renderConnections function that handles wrap-around connections properly
function renderConnections(map) {
  const svg = document.querySelector('.connections-layer');
  if (!svg) {
    console.error('SVG layer not found');
    return;
  }

  // Clear existing connections
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }

  // Modular arithmetic helper function that doesn't return negative values
  for (const [cityName, data] of Object.entries(map)) {
    const { connections } = data;
    if (!connections) continue;

    // Get the current adjusted position with modular arithmetic
    const x1 = data.x;
    const y1 = data.y;
    connections.forEach(connectedCityName => {
    // Avoid duplicate connections by only drawing from one direction
    if(cityName < connectedCityName) {
        renderConnection(svg, x1, y1, map[connectedCityName]);
        renderConnection(svg, x1+1300, y1, map[connectedCityName]);
        renderConnection(svg, x1+2600, y1, map[connectedCityName]);
      }
    });
  }
}
