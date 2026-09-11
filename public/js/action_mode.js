// Owns the currently selected player-action mode. UI modules react to the
// emitted events instead of being imported here, keeping mode state acyclic.
let currentMode = null;

export function getCurrentMode() {
  return currentMode;
}

export function toggleMode(mode) {
  if (currentMode === mode) {
    resetMode();
    return;
  }

  currentMode = mode;
  updateActiveModeButtons();
  document.dispatchEvent(new CustomEvent('actionModeChanged', {
    detail: { mode: currentMode }
  }));
}

export function resetMode() {
  currentMode = null;
  updateActiveModeButtons();
  document.dispatchEvent(new CustomEvent('actionModeChanged', {
    detail: { mode: currentMode }
  }));
  document.dispatchEvent(new CustomEvent('actionModeReset'));
}

function updateActiveModeButtons() {
  document.querySelectorAll('.action-btn').forEach(button => {
    button.classList.remove('active');
  });

  if (!currentMode) return;

  const activeButton = document.getElementById(`${currentMode}-btn`);
  if (activeButton) {
    activeButton.classList.add('active');
  }
}
