
// Load cities from JSON file and render the map
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

function renderPandemicCities(pandemicMap, offset = 0) {
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

  for (const [cityName, cityData] of Object.entries(pandemicMap)) {
    const city = document.createElement('div');
    city.classList.add('city', cityData.color);

    // Apply modular arithmetic to x position
    const adjustedX = mod(cityData.x + offset, 1200);
    city.style.left = `${adjustedX}px`;
    city.style.top = `${cityData.y}px`;

    // City dot
    const dot = document.createElement('div');
    dot.classList.add('dot');
    dot.title = cityName;
    city.appendChild(dot);

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
  }

  // Append the inner container to the scrollable container
  container.appendChild(mapInner);

  return {
    // Return an update function that can be used to adjust the offset
    updateOffset: (newOffset) => {
      for (const city of mapInner.querySelectorAll('.city')) {
        const cityName = city.querySelector('.dot').title;
        const cityData = pandemicMap[cityName];
        const adjustedX = mod(cityData.x + newOffset, 1200);
        city.style.left = `${adjustedX}px`;
      }
    }
  };
}

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

function renderConnections(map) {
  const svg = document.querySelector('.connections-layer');

  for (const [city, data] of Object.entries(map)) {
    const { x, y, connections } = data;

    connections.forEach(connectedCity => {
      const target = map[connectedCity];

      // Avoid duplicate lines by only drawing one direction
      if (!target) return;
      if (city > connectedCity) return;
      if (Math.abs(x - target.x) > 500) return;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x);
      line.setAttribute('y1', y);
      line.setAttribute('x2', target.x);
      line.setAttribute('y2', target.y);
      line.setAttribute('stroke', '#aaa');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-linecap', 'round');

      svg.appendChild(line);
    });
  }
}
