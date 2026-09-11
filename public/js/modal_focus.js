// Shared lifecycle for body-level card dialogs. Keep this module dependency-free.
const modals = [];
const backgroundInert = new Map();
let observer;

function activeModal() {
  return modals[modals.length - 1];
}

function enabledControls(dialog) {
  return Array.from(dialog.querySelectorAll(
    'button, a[href], input, select, textarea, [tabindex], [contenteditable="true"]'
  )).filter(element => element.tabIndex >= 0 && !element.matches(':disabled') &&
    element.getAttribute('aria-disabled') !== 'true' && !element.closest('[inert]') &&
    element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
}

function focusInside(modal) {
  (enabledControls(modal.dialog)[0] || modal.dialog).focus();
}

function updateBackground() {
  const active = activeModal();
  for (const element of document.body.children) {
    if (!backgroundInert.has(element)) backgroundInert.set(element, element.inert);
    element.inert = element === active?.backdrop ? false : true;
  }
}

function handleKeydown(event) {
  const modal = activeModal();
  if (!modal) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    modal.onCancel?.();
  } else if (event.key === 'Tab') {
    // Recompute each time: selection, dropdowns and Forecast reorder controls change.
    const controls = enabledControls(modal.dialog);
    const index = controls.indexOf(document.activeElement);
    const next = index < 0 ? (event.shiftKey ? controls.length - 1 : 0) :
      (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
    event.preventDefault();
    event.stopImmediatePropagation();
    (controls[next] || modal.dialog).focus();
  } else if (!modal.dialog.contains(event.target)) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

function handleFocus(event) {
  const modal = activeModal();
  if (modal && !modal.dialog.contains(event.target)) focusInside(modal);
}

function handleClick(event) {
  const modal = activeModal();
  if (modal && !modal.dialog.contains(event.target)) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

export function openCardModal(backdrop, dialog, { onCancel, initialFocus, returnFocus = document.activeElement } = {}) {
  const modal = { backdrop, dialog, onCancel, returnFocus };
  dialog.tabIndex = -1;
  document.body.appendChild(backdrop);
  modals.push(modal);
  if (modals.length === 1) {
    document.addEventListener('keydown', handleKeydown, true);
    document.addEventListener('focusin', handleFocus, true);
    document.addEventListener('click', handleClick, true);
    // Newly rendered page controls must also stay inert while a dialog is open.
    observer = new MutationObserver(updateBackground);
    observer.observe(document.body, { childList: true });
  }
  updateBackground();
  if (initialFocus && enabledControls(dialog).includes(initialFocus)) initialFocus.focus();
  else focusInside(modal);

  return function closeModal() {
    const index = modals.indexOf(modal);
    if (index < 0) return;
    const wasActive = modal === activeModal();
    modals.splice(index, 1);
    // An underlying dialog can finish a request while a mandatory prompt is on top.
    for (const remaining of modals) {
      if (dialog.contains(remaining.returnFocus)) remaining.returnFocus = modal.returnFocus;
    }
    backdrop.remove();
    if (modals.length) {
      updateBackground();
    } else {
      observer.disconnect();
      document.removeEventListener('keydown', handleKeydown, true);
      document.removeEventListener('focusin', handleFocus, true);
      document.removeEventListener('click', handleClick, true);
      for (const [element, inert] of backgroundInert) element.inert = inert;
      backgroundInert.clear();
    }
    if (wasActive) {
      // Renders may replace the invoking button; prefer its current counterpart.
      const target = modal.returnFocus?.isConnected ? modal.returnFocus :
        (modal.returnFocus?.id ? document.getElementById(modal.returnFocus.id) : null);
      if (target && !target.closest('[inert]') && !target.matches(':disabled')) target.focus();
      if (activeModal() && !activeModal().dialog.contains(document.activeElement)) focusInside(activeModal());
    }
  };
}
