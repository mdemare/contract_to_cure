// scrolling.js
import { MAP_WIDTH } from './constants.js';
import { saveCurrentTransform } from './map.js';

// Store the current transform state
let scale = 1;
let offsetX = -MAP_WIDTH; // Initial centering
let offsetY = 0;
let isDragging = false;
let startX = 0;
let startY = 0;
let lastX = 0;
let lastY = 0;

// Track if listeners have been initialized
let listenersInitialized = false;

// Initialize scrolling and zooming
export function initScrolling() {
  console.log('Initializing map scrolling...');

  const container = document.querySelector('.map-container');
  if (!container) {
    console.error('Map container not found!');
    return;
  }

  // Set initial transform
  updateTransform();

  // Remove previous event listeners if they exist to prevent duplicates
  if (listenersInitialized) {
    removeEventListeners();
  }

  // Add event listeners for scrolling
  container.addEventListener('mousedown', startDrag);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', endDrag);

  // Add event listeners for touch devices
  container.addEventListener('touchstart', startDragTouch);
  document.addEventListener('touchmove', dragTouch);
  document.addEventListener('touchend', endDragTouch);

  // Set flag that listeners are initialized
  listenersInitialized = true;

  // Debug message
  console.log('Map scrolling initialized');
}

// Remove event listeners to prevent duplicates
function removeEventListeners() {
  const container = document.querySelector('.map-container');
  if (container) {
    container.removeEventListener('mousedown', startDrag);
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', endDrag);

    container.removeEventListener('touchstart', startDragTouch);
    document.removeEventListener('touchmove', dragTouch);
    document.removeEventListener('touchend', endDragTouch);

    console.log('Previous event listeners removed');
  }
}

// Start drag
function startDrag(e) {
  // Only start dragging if not clicking on a city
  let targetElement = e.target;
  while (targetElement && targetElement !== document.body) {
    if (targetElement.classList && targetElement.classList.contains('city')) {
      console.log('Preventing map drag on city:', targetElement.dataset.cityName);
      return; // Don't start dragging if clicking on a city
    }
    targetElement = targetElement.parentNode;
  }

  isDragging = true;
  startX = e.clientX;
  startY = e.clientY;
  lastX = startX;
  lastY = startY;

  // Change cursor
  const mapContainer = document.querySelector('.map-container');
  if (mapContainer) {
    mapContainer.style.cursor = 'grabbing';
  }

  e.preventDefault();
}

// Drag
function drag(e) {
  if (!isDragging) return;

  const deltaX = e.clientX - lastX;
  const deltaY = e.clientY - lastY;

  // Update the offsets with the horizontal wrapping logic
  updateScroll(deltaX);

  // Update vertical offset directly (no wrapping needed)
  offsetY += deltaY;

  lastX = e.clientX;
  lastY = e.clientY;

  // Only update vertical transform since horizontal is handled by updateScroll
  updateVerticalTransform();

  e.preventDefault();
}

// End drag
function endDrag() {
  isDragging = false;

  // Change cursor back
  const mapContainer = document.querySelector('.map-container');
  if (mapContainer) {
    mapContainer.style.cursor = 'grab';
  }
}

// Touch support
function startDragTouch(e) {
  if (e.touches.length !== 1) return;

  // Check if touching a city
  let targetElement = e.touches[0].target;
  while (targetElement && targetElement !== document.body) {
    if (targetElement.classList && targetElement.classList.contains('city')) {
      console.log('Touch on city detected:', targetElement.dataset.cityName);
      return; // Don't start dragging if touching a city
    }
    targetElement = targetElement.parentNode;
  }

  isDragging = true;
  startX = e.touches[0].clientX;
  startY = e.touches[0].clientY;
  lastX = startX;
  lastY = startY;

  e.preventDefault();
}

function dragTouch(e) {
  if (!isDragging || e.touches.length !== 1) return;

  const deltaX = e.touches[0].clientX - lastX;
  const deltaY = e.touches[0].clientY - lastY;

  // Update the offsets with the horizontal wrapping logic
  updateScroll(deltaX);

  // Update vertical offset directly (no wrapping needed)
  offsetY += deltaY;

  lastX = e.touches[0].clientX;
  lastY = e.touches[0].clientY;

  // Only update vertical transform since horizontal is handled by updateScroll
  updateVerticalTransform();

  e.preventDefault();
}

function endDragTouch() {
  isDragging = false;
}

// Handle the scroll update and wrapping logic
function updateScroll(deltaX) {
  // Get current transformation values
  const inner = document.querySelector('.map-inner');
  if (!inner) return;

  // Calculate new position - inverted direction
  offsetX += deltaX;

  // Check if we need to wrap around
  const threshold = MAP_WIDTH * 0.25;
  const leftEdge = -2 * MAP_WIDTH;  // Left section start (0-based)
  const rightEdge = 0;              // Right section start

  // For debugging
  let jumpOccurred = false;
  let jumpDirection = "";
  let oldX = offsetX;

  // If we're in left section and close to the left edge
  if (offsetX < leftEdge + threshold) {
    // Jump right by exactly one panel width
    offsetX += MAP_WIDTH;
    jumpOccurred = true;
    jumpDirection = "right";
  }
  // If we're in right section and close to the right edge
  else if (offsetX > rightEdge - threshold) {
    // Jump left by exactly one panel width
    offsetX -= MAP_WIDTH;
    jumpOccurred = true;
    jumpDirection = "left";
  }

  // Log jump details if one occurred
  if (jumpOccurred) {
    console.log(`Jump ${jumpDirection}: ${oldX.toFixed(2)} -> ${offsetX.toFixed(2)}`);
  }

  // Update the transform without any transition
  inner.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;

  // Save the current transform to be preserved during re-renders
  saveCurrentTransform(offsetX, offsetY, scale);
}

// Helper function to get current transform string
function getTransformString(x, y, s) {
  return `translate(${x}px, ${y}px) scale(${s})`;
}

// Update only the vertical part of the transform
function updateVerticalTransform() {
  const inner = document.querySelector('.map-inner');
  if (inner) {
    inner.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;

    // Save the current transform to be preserved during re-renders
    saveCurrentTransform(offsetX, offsetY, scale);
  }
}

// Update the transform style (combined horizontal and vertical)
function updateTransform() {
  const inner = document.querySelector('.map-inner');
  if (inner) {
    inner.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;

    // Save the current transform to be preserved during re-renders
    saveCurrentTransform(offsetX, offsetY, scale);
  }
}

// Export a function to clean up event listeners
export function cleanupScrolling() {
  if (listenersInitialized) {
    removeEventListeners();
    listenersInitialized = false;
    console.log('Scrolling event listeners cleaned up');
  }
}
