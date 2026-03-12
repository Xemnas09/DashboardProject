## [2.8.2] - 2026-03-12

### Refactored
- **Domain-Driven Design (DDD) Cleanup**: Refactored the `database.py` router to move complex data processing logic into a dedicated `data_service.py`.
- **Atomic Operations**: Implemented a resilient, retry-based file saving system to prevent Windows `PermissionError` (file locking) during data retyping.
- **Enhanced Documentation**: Added comprehensive docstrings, type-hints, and internal explanations to all core services (`file_processor.py`, `type_inference.py`, `column_classifier.py`).

### Fixed
- **Excel Import Stability**: Resolved a critical regression where multi-sheet Excel files would lock the process or fail during preview generation.
- **Improved Date Inference**: Refined the `smart_cast_to_date` logic to handle year-only formats as actual dates by auto-appending month and day.

## [2.6.5] - 2026-03-06

### Refactored
- **Domain-Driven Design (DDD) Migration**: Completely restructured the backend and frontend codebases into isolated, business-centric features (`auth`, `users`, `realtime`, `admin`, `shared`).
- **Code Maintainability**:
  - Replaced magic strings/numbers with typed constants.
  - Added intensive Python type-hints to all functions, methods, and Pydantic schemas.
  - Drafted immense JSDoc standards on all React components for robust IDE intellisense.
  - Reorganized absolute and relative imports structurally to reduce clutter.

### Added
- **WebSockets Core Integration**: Phase 1 & 2 integration providing real-time state, live presence tracking, and global push notifications.
- **Strict Single-Session Auth**: Super admins are strictly limited to one active WebSocket connection, avoiding dashboard abuse.
- **Token Revocation Table**: Built an integration table specifically handling force-logouts via SQLite checks on `jti` matching.

### Fixed
- Addressed React StrictMode duplicate renders in `useWebSocketInit.js` with hash deduplication.
- Removed state flashing by utilizing pure synchronous context initialization from `sessionStorage` in `AuthContext.jsx`.

## [2.6.4] - 2026-03-03
### Added
- Implemented realtime viewing of users (connection and disconnection).

## [2.6.3.2] - 2026-02-28
### Security
- Migrated default admin generation to `init_db.py` to prevent repeated lifecycle injections of sensitive hardcoded passwords.
