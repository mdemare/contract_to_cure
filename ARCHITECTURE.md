# Architecture Documentation

## Overview

This document describes the architecture of the Pandemic game implementation, a web-based cooperative board game built with Ruby/Sinatra backend and vanilla JavaScript frontend. The system follows a traditional client-server architecture with clear separation between game logic and presentation layers.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Client (Browser)                        │
├─────────────────────────────────────────────────────────────┤
│  HTML/CSS UI │  JavaScript Modules │  Event Handling       │
│  ─────────────┼────────────────────┼─────────────────────   │
│  • Map        │  • Game State      │  • User Interactions   │
│  • Panels     │  • Player Actions  │  • API Communication   │
│  • Cards      │  • UI Updates      │  • State Sync          │
└─────────────────┬───────────────────────────────────────────┘
                  │
              HTTP/JSON API
                  │
┌─────────────────▼───────────────────────────────────────────┐
│                 Server (Ruby/Sinatra)                      │
├─────────────────────────────────────────────────────────────┤
│  HTTP Router │  Game Logic Modules │  Persistence          │
│  ────────────┼───────────────────────┼────────────────────  │
│  • Endpoints │  • Player Actions    │  • YAML Serialization│
│  • Validation│  • End Turn Events   │  • Game State Save   │
│  • Responses │  • Action Cards      │  • Game State Load    │
└─────────────────────────────────────────────────────────────┘
```

## Backend Architecture (Ruby/Sinatra)

### Core Structure

The backend follows a **modular monolith** pattern with the main `GameState` class serving as the central coordinator that includes specialized modules.

#### Module Architecture

```ruby
class GameState
  include ActionCards      # Special event card effects
  include GameStateConfig  # Constants and configuration
  include PlayerActions    # Core player action logic
  include EndTurnEvents    # End-of-turn disease spreading
  include JsonGenerator    # State serialization
  include Setup           # Game initialization
end
```

#### Design Patterns

1. **Mixin Pattern**: Modules are included as mixins to extend GameState functionality
2. **Template Method**: `after_action` provides consistent post-action processing
3. **Strategy Pattern**: Different roles and card types have specialized behaviors
4. **Command Pattern**: Complex operations like end-turn events encapsulated in dedicated classes

#### Module Responsibilities

| Module | Purpose | Key Methods |
|--------|---------|-------------|
| `GameStateConfig` | Constants and game rules | Configuration values |
| `PlayerActions` | Core game actions | `move`, `treat_disease`, `cure_disease`, `share_knowledge` |
| `ActionCards` | Special event cards | `use_airlift`, `use_forecast`, `quiet_night!` |
| `EndTurnEvents` | Turn-end processing | `draw_cards`, `infect_cities` |
| `JsonGenerator` | State serialization | `to_json_state` |
| `Setup` | Game initialization | `initialize_game` |

#### Supporting Classes

- **City**: Represents game board locations with disease cubes and connections
- **Player**: Manages player state, location, hand, and role abilities
- **Card**: Polymorphic card representation (city, action, epidemic, infection)
- **EndTurn**: Encapsulates complex end-turn event processing

### API Design

The server exposes a RESTful-style API with the following characteristics:

- **Stateful**: Game state maintained server-side
- **Synchronous**: All operations complete before response
- **JSON-based**: Consistent request/response format
- **Action-oriented**: Endpoints map to game actions

#### Key Endpoints

```
GET  /game_state.json      # Current game state
POST /move                 # Move a player
POST /treat                # Treat disease
POST /cure_disease         # Discover cure
POST /share_knowledge      # Share city cards
POST /build_research_station # Build facility
POST /action_card          # Use special cards
POST /restart_game         # New game
```

### State Management

#### Persistence Strategy
- **YAML Serialization**: Complete game state saved to `current_game.yaml`
- **Automatic Saving**: State persisted after each action
- **State Recovery**: Ability to resume games after server restart
- **Validation**: State consistency checks during load/save

#### State Structure
```yaml
game_status:
  actions_remaining: 4
  phase: "player_actions"
  current_player_idx: 0
  # ... other status fields

disease_cubes:
  blue: { cured: false, in_supply: 24 }
  # ... other colors

cities:
  Atlanta:
    name: "Atlanta"
    color: blue
    disease_cubes: 2
    has_research_station: true
    # ... connections

players:
  - role: medic
    location: "Atlanta"
    hand: [...]
    # ... player data

decks:
  player_deck: [...]
  infection_deck: [...]
  # ... deck states
```

## Frontend Architecture (JavaScript)

### Module System

The frontend uses **ES6 modules** with a clear dependency hierarchy and separation of concerns.

#### Core Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                       │
├─────────────────────────────────────────────────────────────┤
│  events.js (Application Bootstrap & Coordination)          │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                  State Management                          │
├─────────────────────────────────────────────────────────────┤
│  game_state.js (Central State, Mode Management)            │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                    UI Layer                                │
├─────────────────────────────────────────────────────────────┤
│  ui.js (High-level UI Coordination)                        │
│  ├─ Map Rendering (map.js)                                 │
│  ├─ Player Panels (player_panel.js, current_player.js)     │
│  ├─ Action Buttons (action_buttons.js)                     │
│  └─ Card Systems (select_cards.js, action_cards.js)        │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                  Action Layer                              │
├─────────────────────────────────────────────────────────────┤
│  player_actions.js (Game Action Implementations)           │
│  player_action_utils.js (API Communication)                │
│  share_knowledge.js, end_turn_events.js (Specialized)      │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                 Foundation Layer                           │
├─────────────────────────────────────────────────────────────┤
│  dom.js (DOM Utilities)                                    │
│  constants.js (Configuration)                              │
└─────────────────────────────────────────────────────────────┘
```

#### Design Patterns

1. **Module Pattern**: Clean public/private interfaces with ES6 modules
2. **Observer Pattern**: Custom DOM events for cross-module communication
3. **Command Pattern**: Action functions encapsulate game operations
4. **Factory Pattern**: DOM element creation utilities
5. **Strategy Pattern**: Role-specific behaviors and movement types

#### State Management

**Centralized State Pattern:**
- Single source of truth in `game_state.js`
- Global state access via exported functions
- Mode management for current action context
- Event-driven UI updates

**State Flow:**
```
User Action → API Call → Backend Processing → State Update → UI Refresh
     ↑                                                           ↓
     └─────────────── Event Handlers ←───────────────────────────┘
```

#### Communication Patterns

**API Communication:**
- Centralized API requests in `player_action_utils.js`
- Consistent error handling and response processing
- Automatic game state refresh after successful operations
- Optimistic UI updates where appropriate

**Event System:**
```javascript
// Custom events for cross-module communication
document.dispatchEvent(new CustomEvent('playerMoved', { detail: data }));
document.dispatchEvent(new CustomEvent('actionModeReset'));
document.dispatchEvent(new CustomEvent('mapUpdated'));
```

## Data Flow

### Typical User Action Flow

1. **User Interaction**: User clicks button or map element
2. **Event Handler**: JavaScript event handler captures interaction
3. **Mode Check**: Current action mode determines behavior
4. **Validation**: Client-side validation (optional)
5. **API Request**: HTTP POST to appropriate endpoint
6. **Server Processing**: 
   - Validate action
   - Update game state
   - Apply game rules
   - Save state
7. **Response**: JSON response with results
8. **Client Update**:
   - Process response
   - Update local state
   - Refresh UI components
   - Trigger custom events

### State Synchronization

```
Client State ←→ Server State
      ↑              ↑
      │              │
  UI Updates    Game Logic
      ↑              ↑
      │              │
 User Actions   Rule Enforcement
```

## Technology Choices

### Backend Technology Stack

| Technology | Purpose | Rationale |
|------------|---------|-----------|
| **Ruby** | Programming language | Readable syntax, good for complex business logic |
| **Sinatra** | Web framework | Lightweight, perfect for API-focused applications |
| **YAML** | State persistence | Human-readable, easy debugging |
| **JSON** | API communication | Standard web API format |

### Frontend Technology Stack

| Technology | Purpose | Rationale |
|------------|---------|-----------|
| **Vanilla JavaScript** | Application logic | Direct control, no framework overhead |
| **ES6 Modules** | Code organization | Native module system, clean dependencies |
| **CSS Grid/Flexbox** | Layout | Modern layout techniques |
| **SVG** | Game map graphics | Scalable vector graphics for game board |

## Security Considerations

### Server-Side Security
- **Input Validation**: All user inputs validated against game rules
- **State Integrity**: Server maintains authoritative game state
- **Action Validation**: All actions checked for legality
- **No Client Trust**: Client input treated as untrusted

### Client-Side Security
- **No Sensitive Data**: Client receives only necessary game state
- **State Verification**: Server validates all state transitions
- **XSS Prevention**: DOM creation through safe utility functions

## Performance Considerations

### Backend Performance
- **Efficient State Storage**: YAML files provide fast read/write
- **Minimal Processing**: Simple request/response cycle
- **Memory Management**: Single game state object in memory

### Frontend Performance
- **Efficient DOM Updates**: Targeted updates instead of full re-renders
- **Event Delegation**: Minimal event listeners
- **Modular Loading**: ES6 modules loaded on demand
- **CSS Optimization**: Component-based stylesheets

## Deployment Architecture

### Development Setup
```
Local Machine
├── Ruby/Sinatra Server (Port 4567)
├── Static File Serving (Public folder)
└── File-based Persistence (YAML)
```

### Production Considerations
- **Process Management**: Use process manager (PM2, systemd)
- **Reverse Proxy**: Nginx for static files and load balancing
- **SSL/TLS**: HTTPS for secure communication
- **Database Migration**: Consider database for persistence at scale
- **Session Management**: Add user authentication and session handling

## Strengths and Trade-offs

### Architectural Strengths
1. **Clear Separation**: Clean boundaries between client and server
2. **Modular Design**: Well-organized, maintainable code structure
3. **Consistency**: Uniform patterns throughout codebase
4. **Extensibility**: Easy to add new features and game mechanics
5. **Testability**: Clear interfaces enable unit testing
6. **Simplicity**: No over-engineering, appropriate for game complexity

### Trade-offs and Limitations
1. **Single-User**: No multi-user or real-time multiplayer support
2. **File-based Storage**: YAML persistence limits scalability
3. **No Authentication**: No user management or security
4. **Client-Server Coupling**: Tight coupling between frontend and backend APIs (see detailed analysis below)
5. **State Size**: Large game state in memory and serialization

## Client-Server Coupling Analysis

### Current Coupling Issues

The current architecture exhibits **tight coupling** between the frontend and backend, which creates several architectural challenges:

#### 1. **API Contract Dependency**

**Problem**: The frontend is tightly bound to specific API endpoints and response formats.

**Current Implementation**:
```javascript
// Frontend directly depends on specific endpoint structure
async function movePlayer(playerIndex, destination, cardName) {
  const response = await fetch('/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      player_index: playerIndex,    // Specific parameter name
      destination: destination,     // Specific format expected
      card_name: cardName          // Backend expects this exact field
    })
  });
}
```

**Issues**:
- Frontend breaks if backend changes parameter names
- No API versioning strategy
- Direct dependency on backend response structure
- Difficult to mock or test independently

#### 2. **State Structure Dependency**

**Problem**: Frontend assumes specific game state structure from backend.

**Current Implementation**:
```javascript
// Frontend directly accesses nested state properties
function updatePlayerPanel() {
  const gameState = getCurrentGameState();
  // Tightly coupled to backend state structure
  gameState.players.forEach((player, index) => {
    document.getElementById(`player-${index}-role`).textContent = player.role;
    document.getElementById(`player-${index}-location`).textContent = player.location;
    // Assumes exact property names and structure
    player.hand.forEach(card => {
      // Assumes card.name, card.type, card.color exist
    });
  });
}
```

**Issues**:
- Frontend breaks if backend changes state structure
- No abstraction layer for state access
- Difficult to evolve data models independently
- Testing requires full backend state objects

#### 3. **Business Logic Coupling**

**Problem**: Game rules and validation logic scattered between frontend and backend.

**Current Implementation**:
```javascript
// Frontend duplicates backend validation logic
function canMoveToCity(fromCity, toCity) {
  const cities = getCurrentGameState().cities;
  // Frontend reimplements backend logic
  return cities[fromCity].connections.includes(toCity);
}

// Backend has similar logic in Ruby
def move(player_index, destination, card_name = nil)
  # Validation logic duplicated here
  if @cities[current_location].connections.include?(destination)
    move_type = 'drive / ferry'
  # ... more validation
end
```

**Issues**:
- Game rules duplicated in two places
- Inconsistencies between frontend and backend validation
- Changes require updates in multiple locations
- Frontend makes assumptions about game mechanics

#### 4. **Error Handling Coupling**

**Problem**: Frontend tightly coupled to backend error response formats.

**Current Implementation**:
```javascript
// Frontend assumes specific error response structure
if (result.status === 'error') {
  showNotification(result.message, 'error');
} else if (result.status === 'card_required') {
  // Specific backend response type
  showCardSelectionModal(result.movement_type, result.options);
}
```

**Issues**:
- Frontend depends on specific error codes and structures
- No error response versioning
- Difficult to change error handling without coordinated updates

### Decoupling Strategies

#### 1. **API Abstraction Layer**

**Solution**: Create an API client abstraction.

```javascript
// api/GameAPI.js - Abstract API interface
class GameAPI {
  constructor(baseURL, version = 'v1') {
    this.baseURL = baseURL;
    this.version = version;
  }

  async movePlayer(request) {
    // Abstract the API call details
    return this.post(`/${this.version}/actions/move`, {
      action: 'move',
      parameters: request
    });
  }

  async treatDisease(request) {
    return this.post(`/${this.version}/actions/treat`, {
      action: 'treat',
      parameters: request
    });
  }

  private async post(endpoint, data) {
    // Centralized request handling with error mapping
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    return this.handleResponse(response);
  }
}
```

#### 2. **Data Transfer Objects (DTOs)**

**Solution**: Define explicit contracts between frontend and backend.

```javascript
// models/GameStateDTO.js
export class GameStateDTO {
  constructor(rawData) {
    this.gameStatus = new GameStatusDTO(rawData.game_status);
    this.players = rawData.players.map(p => new PlayerDTO(p));
    this.cities = this.mapCities(rawData.cities);
    this.diseaseCubes = new DiseaseCubesDTO(rawData.disease_cubes);
  }

  // Abstract away backend structure changes
  getCurrentPlayer() {
    return this.players[this.gameStatus.currentPlayerIndex];
  }
}

// Usage - frontend doesn't depend on backend structure
const gameState = new GameStateDTO(backendResponse);
const currentPlayer = gameState.getCurrentPlayer();
```

#### 3. **Command/Query Separation**

**Solution**: Separate read and write operations with different contracts.

```javascript
// commands/PlayerCommands.js
export class MovePlayerCommand {
  constructor(playerId, destination, options = {}) {
    this.type = 'MOVE_PLAYER';
    this.playerId = playerId;
    this.destination = destination;
    this.options = options;
  }

  toAPIRequest() {
    // Convert to backend-specific format
    return {
      player_index: this.playerId,
      destination: this.destination,
      card_name: this.options.cardName
    };
  }
}

// queries/GameQueries.js
export class GameQueries {
  static canPlayerMove(gameState, playerId, destination) {
    // Centralized business logic
    const player = gameState.getPlayer(playerId);
    const currentCity = gameState.getCity(player.location);
    return currentCity.isConnectedTo(destination);
  }
}
```

#### 4. **Event-Driven Architecture**

**Solution**: Use events to decouple components.

```javascript
// events/GameEvents.js
export class GameEventBus {
  static dispatch(eventType, payload) {
    document.dispatchEvent(new CustomEvent(eventType, { 
      detail: payload 
    }));
  }

  static on(eventType, handler) {
    document.addEventListener(eventType, handler);
  }
}

// Usage - loose coupling between components
GameEventBus.dispatch('PLAYER_MOVED', {
  playerId: 0,
  from: 'Atlanta',
  to: 'Chicago'
});

// Components listen for events instead of direct calls
GameEventBus.on('PLAYER_MOVED', (event) => {
  updateMapDisplay(event.detail);
  updatePlayerPanel(event.detail);
});
```

#### 5. **Backend API Versioning**

**Solution**: Version the API to enable independent evolution.

```ruby
# Backend API versioning
class SinatraApp < Sinatra::Base
  namespace '/api/v1' do
    post '/actions/move' do
      # Version 1 of move API
      handle_move_v1(JSON.parse(request.body.read))
    end
  end

  namespace '/api/v2' do
    post '/actions/move' do
      # Version 2 with different structure
      handle_move_v2(JSON.parse(request.body.read))
    end
  end
end
```

### Benefits of Decoupling

1. **Independent Evolution**: Frontend and backend can evolve separately
2. **Better Testing**: Each layer can be tested in isolation
3. **Flexibility**: Easier to swap implementations
4. **Maintainability**: Changes localized to specific layers
5. **Reusability**: API abstraction can be reused across different frontends
6. **Error Resilience**: Better handling of API changes and failures

### Implementation Priority

1. **High Priority**: API abstraction layer and DTOs
2. **Medium Priority**: Command/Query separation and event-driven architecture
3. **Low Priority**: Full API versioning (when multiple clients exist)

This decoupling strategy would significantly improve the architecture's flexibility and maintainability while preserving the current functionality.

## Future Architectural Considerations

### Scalability Improvements
- **Database Integration**: PostgreSQL or Redis for state persistence
- **User Management**: Authentication and authorization system
- **Real-time Features**: WebSocket integration for live multiplayer
- **Caching**: Redis for session management and game state caching

### Development Improvements
- **Testing**: Unit tests for both frontend and backend
- **CI/CD**: Automated testing and deployment pipeline
- **Documentation**: API documentation with OpenAPI/Swagger
- **Monitoring**: Application monitoring and error tracking