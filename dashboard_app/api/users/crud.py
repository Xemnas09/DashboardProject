"""
Database CRUD operations for the Users domain.
Provides asynchronous functions to create, read, update, and delete users.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.users.models import User
from api.users.schemas import UserCreate
from core.security import get_password_hash as hash_password, verify_password


async def get_user_by_username(db: AsyncSession, username: str) -> User | None:
    """Retrieves a single user by their exact username."""
    result = await db.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_all_users(db: AsyncSession) -> list[User]:
    """Retrieves all users sorted by creation date."""
    result = await db.execute(select(User).order_by(User.created_at))
    return list(result.scalars().all())


async def create_user(db: AsyncSession, data: UserCreate) -> User:
    """Creates a new user and safely hashes their password."""
    user = User(
        username=data.username,
        hashed_password=hash_password(data.password),
        role=data.role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def update_password(db: AsyncSession, user: User, new_password: str) -> User:
    user.hashed_password = hash_password(new_password)
    await db.commit()
    await db.refresh(user)
    return user


async def update_role(db: AsyncSession, user: User, new_role: str) -> User:
    user.role = new_role
    await db.commit()
    await db.refresh(user)
    return user


async def rename_user(db: AsyncSession, user: User, new_username: str) -> User:
    user.username = new_username
    await db.commit()
    await db.refresh(user)
    return user


async def delete_user(db: AsyncSession, user: User) -> None:
    await db.delete(user)
    await db.commit()


async def authenticate_user(db: AsyncSession, username: str, password: str) -> User | None:
    """Return user if credentials are valid, None otherwise."""
    user = await get_user_by_username(db, username)
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    if not user.is_active:
        return None
    return user
