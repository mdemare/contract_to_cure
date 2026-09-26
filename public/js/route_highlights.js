import { revealFocusedCity } from './scrolling.js';
import { createRouteController } from './route_context.js';
import { CITIES, getCurrentGameState } from './game_state.js';
import { getCurrentMode, resetMode } from './action_mode.js';

let initialized = false;

export function initRouteHighlights() {
  if (initialized) return;
  initialized = true;
  const live = document.createElement('div');
  live.className = 'route-announcement';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  document.body.appendChild(live);
  const controller = createRouteController(document, message => { live.textContent = message; });
  let pawnIndex = null;
  const isMove = () => ['move', 'moveSelectedPlayer'].includes(getCurrentMode());
  const refresh = () => {
    const state = getCurrentGameState();
    const status = state?.gameStatus;
    if (isMove() && (status?.phase !== 'player_actions' || status.actions_remaining <= 0 ||
        status.pending_hand_limit || status.gameOver)) {
      resetMode();
      return;
    }
    controller.update({ cities: CITIES, state, mode: getCurrentMode(), pawnIndex });
  };
  document.addEventListener('actionModeChanged', event => {
    if (event.detail.mode !== 'moveSelectedPlayer') pawnIndex = null;
    refresh();
  });
  document.addEventListener('movePawnChanged', event => {
    pawnIndex = event.detail.playerIndex;
    refresh();
  });
  document.addEventListener('gameStateLoaded', refresh);
  document.addEventListener('mapUpdated', () => controller.redraw());
  document.addEventListener('movementRequestFailed', () => { if (isMove()) resetMode(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isMove()) resetMode();
  });
  // Immediate actions do not all use modes. Clear before their click handlers run.
  document.addEventListener('click', event => {
    const button = event.target.closest('.action-btn');
    if (button && button.id !== 'move-btn' && isMove()) resetMode();
  }, true);
  const bindCities = () => {
    document.querySelectorAll('.city').forEach(city => {
      city.onpointerenter = () => controller.hover(city.dataset.cityName);
      city.onpointerleave = () => controller.hover(null);
      city.onfocus = () => {
        revealFocusedCity(city);
        controller.focus(city.dataset.cityName);
      };
      city.onblur = () => controller.focus(null);
    });
  };
  document.addEventListener('mapUpdated', bindCities);
  bindCities();
  // Existing workflows mount several kinds of blocking surface. Observe only
  // their visibility, never infer interaction mode from DOM classes.
  new MutationObserver(() => {
    if (!isMove()) return;
    const blockers = document.querySelectorAll('.modal-backdrop, [aria-modal="true"], .game-over-overlay');
    if ([...blockers].some(element => element.getClientRects().length > 0 &&
        getComputedStyle(element).visibility !== 'hidden')) resetMode();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  refresh();
}
