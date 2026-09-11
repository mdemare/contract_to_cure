// Compatibility facade for callers that still import the former all-in-one
// player action module. New code should import the owning module directly.
export {
  handleFlightChoice,
  handleOperationsExpertMove,
  initMoveActions,
  setSelectedPlayerIndex
} from './movement_actions.js';

export {
  cureDisease,
  executeShareKnowledge,
  pass,
  treatDisease
} from './ordinary_player_actions.js';

export {
  useActionCard,
  useAirlift,
  useGovernmentGrant,
  useQuietNight,
  useResilientPopulation
} from './action_card_requests.js';
