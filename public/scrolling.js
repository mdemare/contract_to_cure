// scrolling.js
import { MAP_WIDTH } from './constants.js';

let isDragging = false;
let lastX = 0;
let lastY = 0;
let mapContainer;
let mapInner;

// Initialize the scrolling functionality
export function initScrolling() {
  mapContainer = document.querySelector('.map-container');
  mapInner = document.querySelector('.map-inner');

  if (!mapContainer || !mapInner) {
    console.error('Map container or inner element not found');
    return;
  }

  // Initial position - center on the middle panel
  mapInner.style.transform = `translate(-${MAP_WIDTH}px) scale(1)`;

  // Set up event listeners for mouse-based scrolling
  setupMouseScrolling();

  // Set up event listeners for touch-based scrolling
  setupTouchScrolling();
}

// Get the current transform values
function getTransformValues() {
  const transform = mapInner.style.transform || '';
  const translateMatch = transform.match(/translate\((-?\d+\.?\d*)px/);
  const scaleMatch = transform.match(/scale\((\d+\.?\d*)\)/);

  const translateX = translateMatch ? parseFloat(translateMatch[1]) : -MAP_WIDTH;
  const translateY = 0; // Y is fixed at 0 for horizontal scrolling
  const scale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;

  return { translateX, translateY, scale };
}

// Create a transform string with the given values
function getTransformString(translateX, translateY, scale) {
  return `translate(${translateX}px) scale(${scale})`;
}

// Handle the scroll update and wrapping logic
function updateScroll(deltaX) {
  const { translateX, translateY, scale } = getTransformValues();

  // Calculate new position - inverted direction
  let newX = translateX + deltaX;

  // Check if we need to wrap around
  const threshold = MAP_WIDTH * 0.25;
  const leftEdge = -2 * MAP_WIDTH;  // Left section start (0-based)
  const middleEdge = -MAP_WIDTH;    // Middle section start
  const rightEdge = 0;              // Right section start

  // For debugging
  let jumpOccurred = false;
  let jumpDirection = "";
  let oldX = newX;

  // If we're in left section and close to the left edge
  if (newX < leftEdge + threshold) {
    // Jump right by exactly one panel width
    newX += MAP_WIDTH;
    jumpOccurred = true;
    jumpDirection = "right";
  }
  // If we're in right section and close to the right edge
  else if (newX > rightEdge - threshold) {
    // Jump left by exactly one panel width
    newX -= MAP_WIDTH;
    jumpOccurred = true;
    jumpDirection = "left";
  }

  // Log jump details if one occurred
  if (jumpOccurred) {
    console.log(`Jump ${jumpDirection}: ${oldX.toFixed(2)} -> ${newX.toFixed(2)}`);
  }

  // Update the transform without any transition
  mapInner.style.transform = getTransformString(newX, translateY, scale);
}

// Mouse-based scrolling event handlers
function setupMouseScrolling() {
  mapContainer.addEventListener('mousedown', (e) => {
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    mapContainer.style.cursor = 'grabbing';

    // Disable any pointer events during dragging to ensure smooth performance
    mapInner.style.pointerEvents = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const deltaX = e.clientX - lastX;

    // Skip tiny movements to avoid performance issues
    if (Math.abs(deltaX) < 0.5) return;

    updateScroll(deltaX);

    lastX = e.clientX;
    lastY = e.clientY;

    // Prevent default to avoid text selection
    e.preventDefault();
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    mapContainer.style.cursor = 'grab';

    // Re-enable pointer events
    mapInner.style.pointerEvents = 'auto';
  });

  // Prevent context menu when right-clicking on the map
  mapContainer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });
}

// Touch-based scrolling event handlers
function setupTouchScrolling() {
  mapContainer.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      isDragging = true;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;

      // Disable pointer events for better performance
      mapInner.style.pointerEvents = 'none';
    }
  });

  mapContainer.addEventListener('touchmove', (e) => {
    if (!isDragging || e.touches.length !== 1) return;

    const deltaX = e.touches[0].clientX - lastX;

    // Skip tiny movements to avoid performance issues
    if (Math.abs(deltaX) < 0.5) return;

    updateScroll(deltaX);

    lastX = e.touches[0].clientX;
    lastY = e.touches[0].clientY;

    // Prevent default to avoid page scrolling
    e.preventDefault();
  });

  mapContainer.addEventListener('touchend', () => {
    isDragging = false;

    // Re-enable pointer events
    mapInner.style.pointerEvents = 'auto';
  });

  mapContainer.addEventListener('touchcancel', () => {
    isDragging = false;

    // Re-enable pointer events
    mapInner.style.pointerEvents = 'auto';
  });
}
