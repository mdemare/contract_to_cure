# Architecture Documentation

## Overview

This document describes the architecture of the Pandemic game implementation, a web-based cooperative board game built with a Go backend (game state in Redis) and a vanilla JavaScript frontend. The system follows a traditional client-server architecture with clear separation between game logic and presentation layers.

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
│                 Server (Go, net/http)                      │
├─────────────────────────────────────────────────────────────┤
│  HTTP Router │  Game Logic Modules │  Persistence          │
│  ────────────┼───────────────────────┼────────────────────  │
│  • Endpoints │  • Player Actions    │  • Redis (JSON save) │
│  • Validation│  • End Turn Events   │  • Atomic updates    │
│  • Responses │  • Action Cards      │  • Game State Load    │
└─────────────────────────────────────────────────────────────┘
```

## Backend Architecture (Go)

### Core Structure

The backend is a single Go binary (`src/main.go`, built with `make build`) split into packages by concern. The `game` package holds the rules; the other packages adapt it to HTTP, Redis, authentication and error reporting.

| Package | Purpose | Key files |
|---------|---------|-----------|
| `src/game` | Game model and rules | `model.go` (GameState, City, Player, Card), `setup.go`, `actions.go` (player actions and guards), `events.go` (event cards), `endturn.go` (draw, infect, discard), `view.go` (JSON view), `save.go` (save format) |
| `src/store` | Redis persistence | `store.go`, `save.go` (save codec), `jsonsave.go` (versioned JSON save), `rubyyaml.go` (reads legacy YAML saves), `atomic.go` (WATCH/MULTI optimistic updates) |
| `src/web` | HTTP layer | `server.go` (routes, index page, static files), `game.go` (per-route guards and handlers), `params.go` (request validation) |
| `src/auth` | JWT authentication, sessions and CSRF | see AUTH.md |
| `src/observe` | Sentry, request logging, panic recovery | `sentry.go`, `middleware.go` |
| `src/contract` | Loads the API contract fixtures in `testdata/contract` for the replay tests | `contract.go` |

#### Design Patterns

1. **Plain domain model**: `*game.GameState` methods implement the rules and return result values; they know nothing about HTTP or Redis
2. **Guard pipeline**: each game route runs the Forecast guard, the game-over guard and the phase check before reading its parameters (`gameRoutes()` in `src/web/game.go`)
3. **Optimistic concurrency**: every game request loads, mutates and commits the save inside `store.AtomicUpdate`; a concurrent change returns 409 with the current state
4. **Result types**: actions return `Result`, `Rejection` or response structs whose field order matches the JSON the frontend expects

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

The full route table is in `src/web/server.go` (and `noca view Q45-cc`).

### State Management

#### Persistence Strategy
- **Redis**: The whole game is one JSON document under the key `contract-to-cure/current-game`
- **Reload per request**: Each request loads the game from Redis; nothing is kept in memory between requests
- **Atomic saves**: A request saves only if the key did not change since it was read
- **State Recovery**: A missing or undecodable save starts a new game; older saves load with defaults for fields they lack
- **Format**: The save is versioned JSON (`{"version": 2, ...}`), with the fields and order of the Ruby/Psych YAML the former Rails backend wrote. YAML saves (version 1, symbol keys such as `:game_status:`) are still read, and the next write turns them into JSON
- **Format migration**: cc-487 shipped reading JSON while still writing YAML; cc-490 switched writes to JSON. Rolling back to a release before cc-487 cannot read the JSON save and starts a new game

#### State Structure
```jsonc
{
  "version": 2,
  "game_status": {
    "actions_remaining": 4,
    "phase": "player_actions",
    "current_player_idx": 0
    // ... other status fields
  },
  "disease_cubes": { /* cured flag and supply per color */ },
  "cities": { /* disease cubes and research station per city */ },
  "research_stations": { /* available count and locations */ },
  "players": [ /* role, location and hand per player */ ],
  "decks": { /* player deck, infection deck and discard piles */ }
}
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
│  game_state.js (Central Game State)                        │
│  action_mode.js (Current Action Mode)                      │
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
│  movement_actions.js (Map & Movement Workflows)            │
│  ordinary_player_actions.js (Ordinary Player Actions)      │
│  action_card_requests.js (Event-card Requests)             │
│  player_actions.js (Compatibility Facade)                  │
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
- Action mode state isolated in `action_mode.js`
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
| **Go** | Programming language | Static binary, standard-library HTTP server, simple deployment |
| **net/http** | Web server and routing | `ServeMux` method patterns cover the routes without a framework |
| **Redis** (go-redis) | State persistence | Shared state with atomic WATCH/MULTI updates |
| **JSON** | Save format | Versioned (`"version": 2`); YAML saves written by the former Rails backend are still read (cc-487, cc-490) |
| **JWT** (golang-jwt) | Authentication | Tokens issued by an external auth service |
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
- **Efficient State Storage**: One Redis GET and one transactional SET per request
- **Minimal Processing**: Simple request/response cycle
- **Stateless Server**: No game state kept in memory between requests

### Frontend Performance
- **Efficient DOM Updates**: Targeted updates instead of full re-renders
- **Event Delegation**: Minimal event listeners
- **Modular Loading**: ES6 modules loaded on demand
- **CSS Optimization**: Component-based stylesheets

## Deployment Architecture

### Development Setup
```
Local Machine
├── Go server: make build && DEPLOYMENT_ENV=development ./main (Port 2583)
├── Static File Serving (public/)
└── Redis (localhost:6379)
```

### Production
- **Container**: `make` builds the static binary, then a small Alpine image (`Dockerfile`, docker-compose files) that runs it as a non-root user on port 2583
- **Reverse Proxy**: Nginx serves `public/` and proxies the API (`nginx.conf`)
- **SSL/TLS**: HTTPS for secure communication
- **Authentication**: JWT cookie from an external auth service (AUTH.md)
- **Monitoring**: Sentry for errors, `/up` and `/health` for health checks

## Strengths and Trade-offs

### Architectural Strengths
1. **Clear Separation**: Clean boundaries between client and server
2. **Modular Design**: Well-organized, maintainable code structure
3. **Consistency**: Uniform patterns throughout codebase
4. **Extensibility**: Easy to add new features and game mechanics
5. **Testability**: Clear interfaces enable unit testing
6. **Simplicity**: No over-engineering, appropriate for game complexity

### Trade-offs and Limitations
1. **Single Shared Game**: All authenticated users share one game; no real-time multiplayer updates
2. **Single Save Key**: The whole game is one Redis value, so concurrent requests conflict (409) rather than merge
3. **External Authentication**: Users are managed by a separate auth service
4. **Client-Server Coupling**: Tight coupling between frontend and backend APIs (see "Proposals, not implemented" below)
5. **State Size**: Large game state in memory and serialization

## Proposals, not implemented

The frontend calls the backend's JSON endpoints directly and reads the game state in the shape the server sends it, so changes to endpoint parameters, state fields or response statuses must be made on both sides together. Earlier versions of this document proposed ways to loosen that coupling: an API client class, DTO wrappers for the game state, command/query objects, a DOM event bus, and a versioned `/api/v1` route prefix. None of these were built.

## Future Architectural Considerations

- **Real-time Features**: WebSocket integration for live multiplayer
- **Documentation**: API documentation with OpenAPI/Swagger
