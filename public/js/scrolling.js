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

  // Add event listeners for scrolling
  container.addEventListener('mousedown', startDrag);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', endDrag);

  // Add event listeners for touch devices
  container.addEventListener('touchstart', startDragTouch);
  document.addEventListener('touchmove', dragTouch);
  document.addEventListener('touchend', endDragTouch);

  // Debug message
  console.log('Map scrolling initialized');

  // VERY IMPORTANT DEBUG CODE: Modified to catch clicks on cities and ensure they propagate
  // This stops map dragging from intercepting city clicks
  document.addEventListener('click', function(e) {
    // Check if the clicked element is a city or its child
    let targetElement = e.target;
    let isCity = false;

    // Traverse up the DOM tree to find if any parent is a city
    while (targetElement && targetElement !== document.body) {
      if (targetElement.classList && targetElement.classList.contains('city')) {
        isCity = true;
        console.log('City click detected on:', targetElement.dataset.cityName);
        console.log('Click event:', e);
        // Stop here, don't prevent default for city clicks
        break;
      }
      targetElement = targetElement.parentNode;
    }

    // Only log, don't interfere with the event
    if (isCity) {
      console.log('City was clicked:', targetElement.dataset.cityName);
    }
  }, true); // Use capturing phase to see all clicks
}

// Start drag
function startDrag(e) {
  // Very important debug: Only start dragging if not clicking on a city
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
  document.querySelector('.map-container').style.cursor = 'grabbing';

  e.preventDefault();
}

// Drag
function drag(e) {
  if (!isDragging) return;

  const deltaX = e.clientX - lastX;
  const deltaY = e.clientY - lastY;

  offsetX += deltaX;
  // offsetY += deltaY;

  lastX = e.clientX;
  lastY = e.clientY;

  updateTransform();

  e.preventDefault();
}

// End drag
function endDrag() {
  isDragging = false;

  // Change cursor back
  document.querySelector('.map-container').style.cursor = 'grab';
}

// Touch support
function startDragTouch(e) {
  if (e.touches.length !== 1) return;

  // Crucial debug: check if touching a city
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

  offsetX += deltaX;
  offsetY += deltaY;

  lastX = e.touches[0].clientX;
  lastY = e.touches[0].clientY;

  updateTransform();

  e.preventDefault();
}

function endDragTouch() {
  isDragging = false;
}

// Update the transform style
function updateTransform() {
  const inner = document.querySelector('.map-inner');
  if (inner) {
    inner.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;

    // Save the current transform to be preserved during re-renders
    saveCurrentTransform(offsetX, offsetY, scale);
  }
}
