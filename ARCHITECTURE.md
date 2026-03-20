# System Architecture & Technical Specifications

This document outlines the architecture of the Dashboard Project. The codebase is organized using a **Feature-Based Architecture (Domain-Driven Design)**, which groups files by their business domain rather than their technical layer. This ensures maximum maintainability and scalability for cross-functional teams.

---

## 1. Backend Architecture (FastAPI)

The backend is built with FastAPI, SQLAlchemy, asyncpg, and PyJWT.

### Directory Structure
```text
dashboard_app/
├── core/                   # ── INFRASTRUCTURE LAYER ──
│   ├── settings.py         #   Pydantic-settings loaded from .env
│   ├── database.py         #   SQLAlchemy async engine & session management
│   ├── security.py         #   Password hashing & JWT token validation
│   ├── exceptions.py       #   Centralized exception hierarchy (AppException)
│   └── dependencies.py     #   FastAPI Depends(): JWT auth, RBAC, rate limiter
│
├── api/                    # ── INTERFACE LAYER (DDD) ──
│   ├── router.py           #   Central router aggregating all domain routers
│   ├── auth/               #   Domain: Authentication & Sessions
│   │   ├── router.py       #     Login, logout, refresh, ws-token
│   │   ├── schemas.py      #     Login credentials validation
│   │   └── token_service.py#     Token revocation with in-memory cache
│   │
│   ├── users/              #   Domain: User Management & RBAC
│   │   ├── router.py       #     CRUD endpoints
│   │   ├── schemas.py      #     Pydantic serialization
│   │   └── crud.py         #     Database interactions
│   │
│   └── realtime/           #   Domain: WebSockets
│       └── router.py       #     WS endpoint, ping/pong
│
├── routers/                # ── APPLICATION LAYER (Thin Controllers) ──
│   ├── upload.py           #   File upload (local + URL)
│   ├── database.py         #   View & Anomaly entrypoints (delegates to services)
│   ├── reports.py          #   Charts & Pivots entrypoints (delegates to services)
│   ├── dashboard.py        #   Dashboard summary (delegates to services)
│   └── notifications.py    #   Read/history notifications
│
├── services/               # ── DOMAIN SERVICES (Business Logic) ──
│   ├── data_service.py     #   Central computing engine (Stats, Anomaly logic)
│   ├── file_processor.py   #   File reading pipeline (CSV, TSV, XLSX, JSON, Parquet)
│   ├── url_importer.py     #   URL-based file import with streaming
│   ├── data_cache.py       #   In-memory data cache with TTL eviction
│   ├── type_inference.py   #   Advanced casting heuristics
│   ├── column_classifier.py#   Semantic labeling (NUM, CAT, ID)
│   ├── expression_parser.py#   Safe math expression → Polars expression
│   ├── anomaly_detector.py #   Statistical anomaly detection (IQR, Z-Score)
│   ├── connection_manager.py#  WebSocket manager (presence, broadcast)
│   ├── notifications.py    #   In-memory notification store
│   └── llm_interpreter.py  #   LLM interpretation of data patterns
│
├── schemas/                # ── DATA TRANSFER OBJECTS ──
│   └── [domain].py         #   Pydantic models per domain
│
├── models/                 # ── PERSISTENCE LAYER ──
│   ├── user.py             #   User SQLAlchemy model
│   └── revoked_token.py    #   RevokedToken SQLAlchemy model
│
└── main.py                 # Application factory & global router registry
```

### Core Mechanisms
- **JWT & RBAC**: Stateless authentication. Tokens include the user's role. If a role is changed or a user is deleted, their existing tokens are blacklisted synchronously using the `revoked_tokens` table.
- **WebSocket Lifecyle**: 
  - Connections are authenticated via short-lived (`5 min`), single-use WS-specific JWTs.
  - The `ConnectionManager` maintains a presence dictionary (`username -> [websockets]`).
  - Active pings keep the connections alive. Disconnections broadcast presence updates to the network.

---

## 2. Frontend Architecture (React + Vite)

The frontend is built with React 18, React Router DOM, and TailwindCSS.

### Directory Structure
```text
frontend/src/
├── core/                   # Global Setup
│   ├── App.jsx             # Provider wrapping & global overlays (Toasts)
│   ├── Layout.jsx          # Main application shell (Sidebar, Header)
│   ├── Router.jsx          # Route definitions & ProtectedRoute wrapper
│   └── main.jsx            # React root injection
│
├── features/               # Isolated Business Domains
│   ├── auth/
│   │   ├── AuthContext.jsx # Stable authentication state
│   │   ├── Login.jsx       # Login interface
│   │   └── session.js      # LocalStorage & fetch wrappers
│   │
│   ├── admin/
│   │   └── AdminUsers.jsx  # Complex user management dashboard
│   │
│   └── realtime/
│       ├── RealtimeContext.jsx  # Volatile state (online users, notifications)
│       ├── OnlineUsers.jsx      # Presence UI component
│       └── useWebSocketInit.js  # WS connection lifecycle hook
│
└── shared/                 # Generic UI Components
    ├── ui/                 # Buttons, Modals, Inputs
    └── utils/              # Formatting helpers
```

### Core Mechanisms
- **Zero-Flash Auth**: User data is read synchronously from `sessionStorage` during the initial render before React paints the screen.
- **Context Separation**: `AuthContext` (stable, slow) is strictly separated from `RealtimeContext` (volatile, fast). This prevents the entire UI tree from re-rendering when a WebSocket ping is received.
- **Deduplication**: In development (`StrictMode`), `useWebSocketInit` relies on connection locks (`isConnecting`) to prevent dual-socket mounting.

### Technical Refinements (v0.3.3) 
- **Unified Classification**: The backend and frontend now share the same column_classifier.py logic for consistent data types.
- **Immersion Portals**: Immersive modes use React Portals to cover the entire viewport with a system-level z-index (9999).
- **Hybrid Caching**: Data access is optimized via RAM (session) and IPC (Parquet/Arrow disk) caching layers.
