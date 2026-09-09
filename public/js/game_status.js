const MAX_ACTIONS = 4;
const MAX_OUTBREAKS = 8;
const MAX_CUBES = 24;

const DISEASE_COLORS = ['blue', 'yellow', 'black', 'red'];

export function actionRisk(actionsRemaining) {
  if (actionsRemaining === 0) return 'critical';
  if (actionsRemaining === 1) return 'warning';
  return 'normal';
}

export function outbreakRisk(outbreaks) {
  if (outbreaks >= MAX_OUTBREAKS - 1) return 'critical';
  if (outbreaks >= MAX_OUTBREAKS - 3) return 'warning';
  return 'normal';
}

export function supplyRisk(cubesRemaining) {
  if (cubesRemaining <= 3) return 'critical';
  if (cubesRemaining <= 8) return 'warning';
  return 'normal';
}

export function formatPhase(phase) {
  if (!phase) return 'Unknown';

  return phase
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function riskLabel(risk) {
  return { normal: 'Stable', warning: 'Low', critical: 'Critical' }[risk];
}

function updateRisk(element, risk) {
  if (!element) return;

  element.dataset.risk = risk;
  const label = element.querySelector('.risk-label');
  if (label) label.textContent = riskLabel(risk);
}

function updateActions(actionsRemaining) {
  const actions = Math.max(0, Math.min(MAX_ACTIONS, Number(actionsRemaining)));
  const status = document.getElementById('actions-status');
  const counter = document.getElementById('action-counter');
  const risk = actionRisk(actions);

  if (counter) counter.textContent = actions;
  updateRisk(status, risk);
  if (status) {
    status.setAttribute('aria-label', `${actions} of ${MAX_ACTIONS} actions remaining, ${riskLabel(risk).toLowerCase()}`);
    status.querySelectorAll('.action-pip').forEach((pip, index) => {
      pip.classList.toggle('is-remaining', index < actions);
    });
  }
}

function updateOutbreaks(outbreakCount) {
  const outbreaks = Math.max(0, Number(outbreakCount));
  const status = document.getElementById('outbreak-status');
  const counter = document.getElementById('outbreak-counter');
  const meter = document.getElementById('outbreak-meter');
  const risk = outbreakRisk(outbreaks);

  if (counter) counter.textContent = outbreaks;
  updateRisk(status, risk);
  if (status) {
    status.setAttribute('aria-label', `${outbreaks} of ${MAX_OUTBREAKS} outbreaks, ${riskLabel(risk).toLowerCase()}`);
  }
  if (meter) {
    meter.setAttribute('aria-valuenow', outbreaks);
    meter.setAttribute('aria-label', `${outbreaks} of ${MAX_OUTBREAKS} outbreaks`);
    meter.style.setProperty('--meter-value', `${Math.min(outbreaks / MAX_OUTBREAKS, 1) * 100}%`);
  }
}

function updateDisease(color, diseaseInfo) {
  if (!diseaseInfo) return;

  const item = document.querySelector(`.cure-item.${color}`);
  const cure = document.getElementById(`${color}-cure`);
  const cubes = document.getElementById(`${color}-cubes`);
  const meter = document.getElementById(`${color}-cube-meter`);
  const cubeCount = Math.max(0, Number(diseaseInfo.inSupply ?? 0));
  const risk = supplyRisk(cubeCount);
  const cureStatus = diseaseInfo.eradicated ? 'Eradicated' : diseaseInfo.cured ? 'Cured' : 'Not cured';

  if (item) {
    item.dataset.risk = risk;
    const warning = item.querySelector('.supply-warning');
    if (warning) warning.textContent = risk === 'normal' ? '' : riskLabel(risk);
  }
  if (cure) {
    cure.textContent = cureStatus;
    cure.classList.toggle('cured', Boolean(diseaseInfo.cured));
    cure.classList.toggle('eradicated', Boolean(diseaseInfo.eradicated));
  }
  if (cubes) cubes.textContent = `${cubeCount} of ${MAX_CUBES} cubes`;
  if (meter) {
    meter.setAttribute('aria-valuenow', cubeCount);
    meter.setAttribute('aria-label', `${cubeCount} of ${MAX_CUBES} ${color} disease cubes remaining, ${riskLabel(risk).toLowerCase()}`);
    meter.style.setProperty('--meter-value', `${Math.min(cubeCount / MAX_CUBES, 1) * 100}%`);
  }
}

export function updateGameStatus(gameState) {
  const status = gameState?.gameStatus;
  if (!status) return;

  if (status.actions_remaining !== undefined) updateActions(status.actions_remaining);
  if (status.outbreaks !== undefined) updateOutbreaks(status.outbreaks);

  const turn = document.getElementById('turn-counter');
  if (turn && status.turn !== undefined) turn.textContent = status.turn;

  const phase = document.getElementById('phase-status');
  if (phase) phase.textContent = formatPhase(status.phase);

  const playerCards = document.getElementById('player-cards');
  if (playerCards && gameState.decks?.playerDeck !== undefined) {
    playerCards.textContent = gameState.decks.playerDeck;
  }

  DISEASE_COLORS.forEach(color => updateDisease(color, gameState.diseaseCubes?.[color]));
}
