#!/usr/bin/env python3
"""
init_db.py — Database initialization script for Datavera.

Usage:
  python init_db.py                     # Create tables + seed default users
  python init_db.py --list-users        # List all users
  python init_db.py --add-user          # Add a user interactively
  python init_db.py --delete-user NAME  # Delete a user
  python init_db.py --update-password NAME  # Reset a user's password
"""

import argparse
import asyncio
import sys
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

# Load settings
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from settings import settings
from models.user import User
from models.revoked_token import RevokedToken  # ensure table is created
from database import Base
from crud.user import (
    get_user_by_username, create_user, get_all_users,
    delete_user, update_password, hash_password
)
from schemas.user import UserCreate

# Colors for terminal output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
BOLD = "\033[1m"
RESET = "\033[0m"

def ok(msg): print(f"  {GREEN}✓{RESET} {msg}")
def err(msg): print(f"  {RED}✗{RESET} {msg}")
def info(msg): print(f"  {BLUE}→{RESET} {msg}")
def header(msg): print(f"\n{BOLD}{msg}{RESET}")


async def init(session_factory):
    """Create all tables and seed default users."""
    engine = session_factory.kw["bind"]

    header("Creating tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    ok("Tables created (or already exist)")

    header("Seeding default users...")
    async with session_factory() as db:
        # admin → super_admin
        existing_admin = await get_user_by_username(db, settings.super_admin_username)
        if not existing_admin:
            await create_user(db, UserCreate(
                username=settings.super_admin_username,
                password=settings.admin_password,
                role="super_admin",
            ))
            ok(f"Created super_admin: '{settings.super_admin_username}'")
        else:
            info(f"super_admin '{settings.super_admin_username}' already exists — skipped")

        # user → user role
        existing_user = await get_user_by_username(db, "user")
        if not existing_user:
            await create_user(db, UserCreate(
                username="user",
                password=settings.user_password,
                role="user",
            ))
            ok("Created user: 'user'")
        else:
            info("User 'user' already exists — skipped")

    header("Database initialized successfully ✓\n")


async def list_users(session_factory):
    """Print all users in a formatted table."""
    async with session_factory() as db:
        users = await get_all_users(db)

    header(f"Users ({len(users)} total)")
    print(f"  {'ID':<4} {'Username':<20} {'Role':<12} {'Active':<8} {'Created'}")
    print(f"  {'-'*4} {'-'*20} {'-'*12} {'-'*8} {'-'*20}")
    for u in users:
        role_color = GREEN if u.role == "super_admin" else BLUE if u.role == "admin" else RESET
        print(
            f"  {u.id:<4} {u.username:<20} "
            f"{role_color}{u.role:<12}{RESET} "
            f"{'Yes' if u.is_active else 'No':<8} "
            f"{u.created_at.strftime('%Y-%m-%d %H:%M')}"
        )
    print()


async def add_user(session_factory):
    """Add a user interactively."""
    header("Add a new user")
    username = input("  Username: ").strip().lower()
    password = input("  Password: ").strip()
    print("  Role options: super_admin / admin / user")
    role = input("  Role [user]: ").strip() or "user"

    if role not in ("super_admin", "admin", "user"):
        err(f"Invalid role: {role}")
        return

    async with session_factory() as db:
        existing = await get_user_by_username(db, username)
        if existing:
            err(f"User '{username}' already exists")
            return
        user = await create_user(db, UserCreate(username=username, password=password, role=role))
        ok(f"Created user '{user.username}' with role '{user.role}'")


async def delete_user_cmd(session_factory, username: str):
    """Delete a user by username."""
    async with session_factory() as db:
        user = await get_user_by_username(db, username)
        if not user:
            err(f"User '{username}' not found")
            return
        if user.role == "super_admin":
            err("Cannot delete the super_admin user")
            return
        confirm = input(f"  Delete user '{username}'? [y/N]: ").strip().lower()
        if confirm != "y":
            info("Cancelled")
            return
        await delete_user(db, user)
        ok(f"Deleted user '{username}'")


async def update_password_cmd(session_factory, username: str):
    """Reset a user's password."""
    async with session_factory() as db:
        user = await get_user_by_username(db, username)
        if not user:
            err(f"User '{username}' not found")
            return
        new_password = input(f"  New password for '{username}': ").strip()
        if not new_password:
            err("Password cannot be empty")
            return
        await update_password(db, user, new_password)
        ok(f"Password updated for '{username}'")


def main():
    parser = argparse.ArgumentParser(description="Datavera database management")
    parser.add_argument("--list-users", action="store_true", help="List all users")
    parser.add_argument("--add-user", action="store_true", help="Add a user interactively")
    parser.add_argument("--delete-user", metavar="USERNAME", help="Delete a user")
    parser.add_argument("--update-password", metavar="USERNAME", help="Reset a user password")
    args = parser.parse_args()

    # Create engine and session factory
    from database import engine
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def run():
        if args.list_users:
            await list_users(session_factory)
        elif args.add_user:
            await add_user(session_factory)
        elif args.delete_user:
            await delete_user_cmd(session_factory, args.delete_user)
        elif args.update_password:
            await update_password_cmd(session_factory, args.update_password)
        else:
            await init(session_factory)
        # ──────────────────────────────────────────────────────────────────
        # IMPORTANT: DEALLOCATE ALL before returning connections to PgBouncer.
        # Without this, stale named prepared statements from init_db.py remain
        # on the backend PostgreSQL connection. When FastAPI starts and reuses
        # that same backend connection, the first request will fail with
        # DuplicatePreparedStatementError (only on first attempt).
        # ──────────────────────────────────────────────────────────────────
        from settings import settings as _s
        if _s.database_url.startswith("postgres"):
            try:
                async with engine.connect() as conn:
                    await conn.execute(text("DEALLOCATE ALL"))
                    await conn.commit()
            except Exception:
                pass  # Best-effort — don't crash startup over cleanup
        await engine.dispose()

    asyncio.run(run())


if __name__ == "__main__":
    main()
