import { MAP_WIDTH, COLORS } from './constants.js';

// Load cities from JSON file
export async function loadCities(jsonUrl) {
  try {
    // Fetch the JSON file
    const response = await fetch(jsonUrl);

    if (!response.ok) {
      throw new Error(`Failed to load cities: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error loading cities:', error);

    // Display error message on the map container
    const container = document.querySelector('.map-container');
    container.innerHTML = `<div class="error-message">Failed to load cities data: ${error.message}</div>`;
    return null;
  }
}

// Create city div on numbered panel
function createCityOnPanel(cityData, cityName, panel) {
  const city = document.createElement('div');
  city.classList.add('city', cityData.color);

  // Apply modular arithmetic to x position
  city.style.left = `${cityData.x + panel * MAP_WIDTH}px`;
  city.style.top = `${cityData.y}px`;

  // Add data attribute for city name (useful for debugging)
  city.dataset.cityName = cityName;

  // City dot
  const dot = document.createElement('div');
  dot.classList.add('dot');
  dot.title = cityName;
  city.appendChild(dot);

  // City label
  const label = document.createElement('div');
  label.classList.add('city-label');
  label.textContent = cityName;
  city.appendChild(label);

  // Disease cubes (if any)
  if (cityData.cubes) {
    const cubes = document.createElement('div');
    cubes.classList.add('cubes');
    for (const [color, count] of Object.entries(cityData.cubes)) {
      for (let i = 0; i < count; i++) {
        const cube = document.createElement('div');
        cube.classList.add('cube', color);
        cubes.appendChild(cube);
      }
    }
    city.appendChild(cubes);
  }

  // Pawns (if any)
  if (cityData.pawns && cityData.pawns.length > 0) {
    const pawns = document.createElement('div');
    pawns.classList.add('pawns');
    for (const color of cityData.pawns) {
      const pawn = document.createElement('div');
      pawn.classList.add('pawn', color);
      pawns.appendChild(pawn);
    }
    city.appendChild(pawns);
  }

  // Research station
  if (cityData.hasStation) {
    const station = document.createElement('div');
    station.classList.add('station');
    station.textContent = '🧪';
    city.appendChild(station);
  }
  return city;
}

// Updated render function using the global offset variable
export function renderPandemicCities(pandemicMap) {
  const container = document.querySelector('.map-container');

  // Clear previous content
  container.innerHTML = '';

  // Create inner container for proper sizing
  const mapInner = document.createElement('div');
  mapInner.classList.add('map-inner');

  // Initial positioning will be handled by the scrolling.js module
  // Initial transform with translate to center the map
  mapInner.style.transform = `translate(-${MAP_WIDTH}px) scale(1)`;

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
    drawStyledLine(svg, x1, y1, x2, target.y);
  } else {
    // Target connection is out of bounds. Only draw to the edge of the map
    if (x2 < 0) {
      // City is on left, target on right - draw to left edge
      const leftEdgeY = calculateEdgeIntersection(x1, y1, x2, target.y, 0);
      drawStyledLine(svg, x1, y1, 0, leftEdgeY, true);
    } else {
      // City is on right, target on left - draw to right edge
      const rightEdgeY = calculateEdgeIntersection(x1, y1, x2, target.y, 3*MAP_WIDTH);
      drawStyledLine(svg, x1, y1, 3*MAP_WIDTH, rightEdgeY, true);
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
