import { MAP_WIDTH } from './constants.js';

const MAP_Y_OFFSET = 165;
const ORBIT_RADIUS = 18;
const CUBE_SIZE = 9;
// Include the rotated outline and room for the blurred, offset shadow.
const ORBIT_EXTENT = Math.ceil(ORBIT_RADIUS + (CUBE_SIZE + 2) / Math.SQRT2 + 6);
const ORBIT_SPEED = 0.00035;
const MAX_PIXEL_RATIO = 2;
const FALLBACK_COLORS = {
  blue: '#3b90ff',
  yellow: '#ffd700',
  black: '#444',
  red: '#ff5e5e'
};

let stopActiveLayer = null;

function stablePhase(cityName) {
  let hash = 0;

  for (const character of cityName) {
    hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  }

  return hash / 0xffffffff * Math.PI * 2;
}

function diseaseColor(color) {
  if (typeof getComputedStyle !== 'function' || !document.documentElement) {
    return FALLBACK_COLORS[color] ?? '#fff';
  }

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${color}-disease`)
    .trim();
  return value || FALLBACK_COLORS[color] || '#fff';
}

function orbitBounds(pandemicMap) {
  const bounds = { left: 0, top: 0, right: MAP_WIDTH * 3, bottom: 1 };

  for (const city of Object.values(pandemicMap)) {
    bounds.left = Math.min(bounds.left, Math.floor(city.x - ORBIT_EXTENT));
    bounds.top = Math.min(bounds.top, Math.floor(city.y - MAP_Y_OFFSET - ORBIT_EXTENT));
    bounds.right = Math.max(bounds.right, Math.ceil(city.x + MAP_WIDTH * 2 + ORBIT_EXTENT));
    bounds.bottom = Math.max(bounds.bottom, Math.ceil(city.y - MAP_Y_OFFSET + ORBIT_EXTENT));
  }

  return bounds;
}

function resizeCanvas(canvas, mapInner, bounds) {
  const width = Math.max(bounds.right, mapInner.clientWidth || MAP_WIDTH * 3) - bounds.left;
  const height = Math.max(bounds.bottom, mapInner.clientHeight || mapInner.parentElement?.clientHeight || 1) - bounds.top;
  const devicePixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const pixelRatio = Math.min(devicePixelRatio, MAX_PIXEL_RATIO);
  const pixelWidth = Math.round(width * pixelRatio);
  const pixelHeight = Math.round(height * pixelRatio);

  canvas.style.left = `${bounds.left}px`;
  canvas.style.top = `${bounds.top}px`;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  return { width, height, pixelRatio };
}

function drawCube(context, x, y, angle, color) {
  context.save();
  context.translate(x, y);
  context.rotate(angle + Math.PI / 4);
  context.shadowColor = 'rgba(0, 0, 0, 0.65)';
  context.shadowBlur = 2;
  context.shadowOffsetX = 1;
  context.shadowOffsetY = 2;
  context.fillStyle = '#15223a';
  context.fillRect(-CUBE_SIZE / 2 - 1, -CUBE_SIZE / 2 - 1, CUBE_SIZE + 2, CUBE_SIZE + 2);
  context.shadowColor = 'transparent';
  context.fillStyle = '#fff';
  context.fillRect(-CUBE_SIZE / 2, -CUBE_SIZE / 2, CUBE_SIZE, CUBE_SIZE);
  context.fillStyle = color;
  context.fillRect(-CUBE_SIZE / 2 + 1, -CUBE_SIZE / 2 + 1, CUBE_SIZE - 2, CUBE_SIZE - 2);
  context.restore();
}

function drawLayer(context, canvas, mapInner, bounds, cubeCities, elapsed) {
  const { width, height, pixelRatio } = resizeCanvas(canvas, mapInner, bounds);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);

  for (const { cityName, cityData, cubeCount, color } of cubeCities) {
    const cityPhase = stablePhase(cityName);
    const orbitSpeed = ORBIT_SPEED * (1 + (cubeCount - 1) * 0.25);

    for (let panel = 0; panel < 3; panel++) {
      const cityX = cityData.x + panel * MAP_WIDTH;
      const cityY = cityData.y - MAP_Y_OFFSET;

      for (let index = 0; index < cubeCount; index++) {
        const angle = cityPhase + elapsed * orbitSpeed + index * Math.PI * 2 / cubeCount;
        const x = cityX + Math.cos(angle) * ORBIT_RADIUS;
        const y = cityY + Math.sin(angle) * ORBIT_RADIUS;
        drawCube(context, x - bounds.left, y - bounds.top, angle, color);
      }
    }
  }
}

// Render disease pieces independently from the interactive city DOM. Keeping the
// canvas inside map-inner makes it inherit the exact map pan and scale transform.
export function renderDiseaseCubeCanvas(mapInner, pandemicMap) {
  stopActiveLayer?.();

  const canvas = document.createElement('canvas');
  canvas.classList.add('disease-cube-layer');
  canvas.setAttribute('aria-hidden', 'true');
  mapInner.appendChild(canvas);

  const context = canvas.getContext?.('2d');
  if (!context) return canvas;

  const bounds = orbitBounds(pandemicMap);
  const cubeCities = Object.entries(pandemicMap).flatMap(([cityName, cityData]) => {
    const cubeCount = Number(cityData.cubes) || 0;
    if (cubeCount <= 0) return [];

    return [{
      cityName,
      cityData,
      cubeCount,
      color: diseaseColor(cityData.color)
    }];
  });
  const motionQuery = typeof matchMedia === 'function'
    ? matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  let animationFrame = null;
  let resizeObserver = null;
  let stopped = false;

  const drawStaticLayer = () => drawLayer(context, canvas, mapInner, bounds, cubeCities, 0);
  const animate = elapsed => {
    if (stopped || ('isConnected' in canvas && !canvas.isConnected)) return;
    drawLayer(context, canvas, mapInner, bounds, cubeCities, elapsed);
    animationFrame = requestAnimationFrame(animate);
  };
  const updateMotion = () => {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;

    if (cubeCities.length === 0 || motionQuery?.matches || typeof requestAnimationFrame !== 'function') {
      drawStaticLayer();
    } else {
      animationFrame = requestAnimationFrame(animate);
    }
  };
  const redraw = () => {
    if (motionQuery?.matches || animationFrame === null) drawStaticLayer();
  };

  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(redraw);
    resizeObserver.observe(mapInner);
  } else if (typeof window !== 'undefined') {
    window.addEventListener('resize', redraw);
  }
  motionQuery?.addEventListener?.('change', updateMotion);

  stopActiveLayer = () => {
    stopped = true;
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    resizeObserver?.disconnect();
    if (!resizeObserver && typeof window !== 'undefined') {
      window.removeEventListener('resize', redraw);
    }
    motionQuery?.removeEventListener?.('change', updateMotion);
    stopActiveLayer = null;
  };

  updateMotion();
  return canvas;
}
