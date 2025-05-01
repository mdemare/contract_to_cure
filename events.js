function enableDragScroll(container, mapController) {
  let isDown = false;
  let startX;
  let startOffset;

  container.addEventListener('mousedown', (e) => {
    isDown = true;
    container.classList.add('grabbing');
    startX = e.pageX - container.offsetLeft;
    startOffset = globalMapOffset;
    e.preventDefault();
  });

  container.addEventListener('mouseleave', () => {
    isDown = false;
    container.classList.remove('grabbing');
  });

  container.addEventListener('mouseup', () => {
    isDown = false;
    container.classList.remove('grabbing');
  });

  container.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - container.offsetLeft;
    const walkX = (x - startX); // How far the mouse has moved

    // Update the map offset directly
    const newOffset = startOffset + walkX;
    updateMapOffset(newOffset);
  });
}
