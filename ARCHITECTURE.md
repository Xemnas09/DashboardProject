# System Architecture & Technical Specifications

This document outlines the architecture of the Dashboard Project. The codebase is organized using a **Feature-Based Architecture (Domain-Driven Design)**, which groups files by their business domain rather than their technical layer. This ensures maximum maintainability and scalability for cross-functional teams.

---

## 1. Backend Architecture (FastAPI)

The backend is built with FastAPI, SQLAlchemy, asyncpg, and PyJWT.

### Directory Structure
```text
dashboard_app/
├── core/                   # System Foundation
│   ├── settings.py         # Environment variables & Pydantic BaseSettings
│   ├── database.py         # SQLAlchemy async engine & session management
│   ├── security.py         # Password hashing & JWT token validation
│   └── exceptions.py       # Custom HTTP exceptions and error handlers
│
├── api/                    # API Entrypoints
│   ├── auth/               # Domain: Authentication & Sessions
│   │   ├── router.py       # Login, token issuance
│   │   ├── schemas.py      # Login credentials validation
│   │   └── services.py     # Revoked tokens logic
│   │
│   ├── users/              # Domain: User Management & RBAC
│   │   ├── router.py       # CRUD endpoints
│   │   ├── models.py       # SQLAlchemy ORM definitions
│   │   ├── schemas.py      # Pydantic serialization
│   │   └── crud.py         # Database interactions
│   │
│   └── realtime/           # Domain: WebSockets & Broadcasting
│       ├── router.py       # WS connection endpoints
│       └── manager.py      # ConnectionManager singleton (presence, broadcast)
│
├── services/               # Shared Business Logic (Service Layer)
│   ├── file_processor.py   # Lock-free reading & preview generation (Calamine)
│   ├── type_inference.py   # Advanced casting heuristics (Date, Bool, Numeric)
│   ├── column_classifier.py# Semantic labeling (NUM, CAT, ID)
│   ├── data_service.py     # Batch operations & atomic saving
│   ├── anomaly_detector.py # Isolation Forest & IQR outliers
│   └── llm_interpreter.py  # LLM interpretation of data patterns
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
