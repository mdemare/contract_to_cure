let currentActionCardSource = null;

export function getActionCardSource() {
  return currentActionCardSource;
}

export function setActionCardSource(cardSource) {
  currentActionCardSource = cardSource;
}

export function clearActionCardSource() {
  currentActionCardSource = null;
}
