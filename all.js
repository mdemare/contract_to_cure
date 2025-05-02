// Load cities from JSON file
async function loadCities(jsonUrl) {
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

// Updated render function using the global offset variable
function renderPandemicCities(pandemicMap, offset = 0) {
  // Update global offset value
  globalMapOffset = offset;

  const container = document.querySelector('.map-container');

  // Clear previous content
  container.innerHTML = '';

  // Create inner container for proper sizing
  const mapInner = document.createElement('div');
  mapInner.classList.add('map-inner');

  // Add the SVG layer back
  const svgLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svgLayer.classList.add('connections-layer');
  svgLayer.setAttribute('width', '100%');
  svgLayer.setAttribute('height', '100%');
  mapInner.appendChild(svgLayer);

  // Modular arithmetic helper function that doesn't return negative values
  const mod = (n, m) => ((n % m) + m) % m;

  // Optional optimization: clone cities that are close to the edge
  // This helps visually with the wrap-around effect
  const enhancedMap = JSON.parse(JSON.stringify(pandemicMap));
  const MAP_WIDTH = 1300;
  const CLONE_THRESHOLD = 200; // Cities this close to the edge get cloned

  // Track which cities we've rendered to avoid duplicates
  const renderedCities = new Set();

  // First, render all the base cities
  for (const [cityName, cityData] of Object.entries(pandemicMap)) {
    const city = document.createElement('div');
    city.classList.add('city', cityData.color);

    // Apply modular arithmetic to x position
    const adjustedX = mod(cityData.x + offset, MAP_WIDTH);
    city.style.left = `${adjustedX}px`;
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

    mapInner.appendChild(city);
    renderedCities.add(cityName);
  }

  // Append the inner container to the scrollable container
  container.appendChild(mapInner);

  // Enable drag scrolling
  enableDragScroll(container);

  // Render the connections after creating all cities
  renderConnections(pandemicMap, globalMapOffset);
}

// Prepare the raw city data for rendering by adding default properties
function prepareMapForRendering(rawMap) {
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

// Global function to update the map offset
function updateMapOffset(newOffset) {
  console.log("updateOffset(" + newOffset + ")");
  globalMapOffset = newOffset;

  const MAP_WIDTH = 1300;
  const CLONE_THRESHOLD = 200;
  const mod = (n, m) => ((n % m) + m) % m;

  // First, remove all existing clones
  document.querySelectorAll('.city.clone').forEach(clone => {
    clone.remove();
  });

  // Update position of original cities
  const allOriginalCities = document.querySelectorAll('.city:not(.clone)');
  allOriginalCities.forEach(cityElement => {
    const cityName = cityElement.dataset.cityName;
    const cityData = pandemicMapData[cityName];

    if (!cityData) return; // Skip if we can't find data

    // Update original city position
    const adjustedX = mod(cityData.x + newOffset, MAP_WIDTH);
    cityElement.style.left = `${adjustedX}px`;
  });

  // Re-create necessary clones based on new offset
  const mapInner = document.querySelector('.map-inner');

  // Update connections
  renderConnections(pandemicMapData, globalMapOffset);
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

// Improved renderConnections function that handles wrap-around connections properly
function renderConnections(map, currentOffset = 0) {
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
  const mod = (n, m) => ((n % m) + m) % m;

  // Map width used for modular arithmetic
  const MAP_WIDTH = 1300;

  for (const [city, data] of Object.entries(map)) {
    const { connections } = data;
    if (!connections) continue;

    // Get the current adjusted position with modular arithmetic
    const x1 = mod(data.x + currentOffset, MAP_WIDTH);
    const y1 = data.y;

    connections.forEach(connectedCity => {
      const target = map[connectedCity];

      // Skip if connected city doesn't exist
      if (!target) return;

      // Avoid duplicate connections by only drawing from one direction
      if (city > connectedCity) return;

      // Get the target's adjusted position
      const x2 = mod(target.x + currentOffset, MAP_WIDTH);
      const y2 = target.y;

      // Calculate the direct distance and the wrap-around distance
      const directDistance = Math.abs(x2 - x1);
      const wrapDistance = MAP_WIDTH - directDistance;

      // Determine if we should draw direct or wrap-around connection
      const shouldWrap = directDistance > wrapDistance;

      if (shouldWrap) {
        // Draw two line segments for wrap-around connection

        if (x1 < x2) {
          // City is on left, target on right - draw to left edge
          const leftEdgeY = calculateEdgeIntersection(x1, y1, x2 - MAP_WIDTH, y2, 0);
          drawStyledLine(svg, x1, y1, 0, leftEdgeY, true);

          // Second segment - from right edge to target
          drawStyledLine(svg, MAP_WIDTH, leftEdgeY, x2, y2, true);
        } else {
          // City is on right, target on left - draw to right edge
          const rightEdgeY = calculateEdgeIntersection(x1, y1, x2 + MAP_WIDTH, y2, MAP_WIDTH);
          drawStyledLine(svg, x1, y1, MAP_WIDTH, rightEdgeY, true);

          // Second segment - from left edge to target
          drawStyledLine(svg, 0, rightEdgeY, x2, y2, true);
        }
      } else {
        // Draw direct connection (no wrap needed)
        drawStyledLine(svg, x1, y1, x2, y2);
      }
    });
  }
}
