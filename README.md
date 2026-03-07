# Datavera

Datavera is a high-performance data science dashboard application built with **FastAPI**, **React**, and **Tailwind CSS**. It features robust Role-Based Access Control (RBAC), real-time WebSocket communication, and a modern, glassmorphic UI.

## Features

- **Secure Authentication & RBAC**: JWT-based authentication with dynamic role changes and immediate token revocation.
- **Real-Time Presence & Broadcasts**: WebSockets provide live user presence tracking and instant system-wide notifications.
- **Domain-Driven Design (DDD)**: Clean, modular architecture separating Authentication, User Management, and Realtime domains on both the frontend and backend.
- **Responsive UI**: Built with Tailwind CSS and Framer Motion for a fluid, dynamic experience.

## Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+
- SQLite (Development) / PostgreSQL (Production)

### Backend Setup
```bash
cd dashboard_app
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python init_db.py  # Initialize the database and create the super_admin
uvicorn main:app --reload
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

## Documentation
- [Architecture](ARCHITECTURE.md) - Detailed overview of the backend and frontend DDD structure.
- [Changelog](CHANGELOG.md) - Version history and tracking.
