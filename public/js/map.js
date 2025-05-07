// map.js
import { MAP_WIDTH, COLORS } from './constants.js';

// Store the current transform state so it can be preserved during re-renders
let currentTransform = {
  translateX: -MAP_WIDTH,
  translateY: 0,
  scale: 1
};

// Create city div with centralized dot
function createCityOnPanel(cityData, cityName, panel) {
  const city = document.createElement('div');
  city.classList.add('city', cityData.color);

  // Position the city div at the exact coordinate (dot will be centered)
  const xPos = cityData.x + panel * MAP_WIDTH;
  city.style.left = `${xPos}px`;
  city.style.top = `${cityData.y - 165}px`;

  // Add data attribute for city name (useful for debugging)
  city.dataset.cityName = cityName;

  // City dot (centered at the city coordinates)
  const dot = document.createElement('div');
  dot.classList.add('dot');
  dot.title = cityName;
  city.appendChild(dot);

  // City label (positioned below the dot)
  const label = document.createElement('div');
  label.classList.add('city-label');
  label.textContent = cityName.replace(/ /g, '\u00A0');
  city.appendChild(label);

  // Disease cubes (if any)
  if (cityData.cubes > 0) {
    const cubes = document.createElement('div');
    cubes.classList.add('cubes');

    for (let i = 0; i < cityData.cubes; i++) {
      const cube = document.createElement('div');
      cube.classList.add('cube', cityData.color);
      cubes.appendChild(cube);
    }

    city.appendChild(cubes);
  }

  // Pawns (if any) - now using chess pawns
  if (cityData.pawns && cityData.pawns.length > 0) {
    const pawns = document.createElement('div');
    pawns.classList.add('pawns');

    // cityData.pawns contain role names
    // It's a stack, visually, so the first pawn in the array should be the last element in the div.
    for (let i = cityData.pawns.length - 1; i >= 0; i--) {
      let role = cityData.pawns[i];
      const pawn = document.createElement('div');
      pawn.classList.add('pawn', role.replaceAll('_','-')); // Use the role directly as the class
      pawn.textContent = '♟';
      pawns.appendChild(pawn);
    };

    city.appendChild(pawns);
  }

  // Add a class to the city if it has a research station
  if (cityData.hasStation) {
    city.classList.add('has-station');
  }

  return city;
}

// This function should be called whenever scrolling.js updates the transform
export function saveCurrentTransform(translateX, translateY, scale) {
  currentTransform = { translateX, translateY, scale };
}

// Updated render function preserving the current transform
export function renderPandemicCities(pandemicMap) {
  console.log("renderPandemicCities", pandemicMap);
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
  const mapInner = document.createElement('div');
  mapInner.classList.add('map-inner');

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

  // First, render all the base cities, three copies of each
  for (const [cityName, cityData] of Object.entries(pandemicMap)) {
    mapInner.appendChild(createCityOnPanel(cityData, cityName, 0));
    mapInner.appendChild(createCityOnPanel(cityData, cityName, 1));
    mapInner.appendChild(createCityOnPanel(cityData, cityName, 2));
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

// Prepare the raw city data for rendering by adding default properties
export function prepareMapForRendering(rawMap) {
  const fullMap = {};

  for (const [cityName, data] of Object.entries(rawMap)) {
    fullMap[cityName] = {
      ...data,
      cubes: {},          // No disease cubes by default
      pawns: [],          // No pawns by default
      hasStation: false   // No research station by default
    };
  }

  return fullMap;
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
