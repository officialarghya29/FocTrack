from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import conflict, not_found
from app.models import Category, FocusSession, User
from app.schemas.category import CategoryCreate, CategoryUpdate


def list_categories(db: Session, user: User) -> list[Category]:
    return list(
        db.scalars(
            select(Category)
            .where(Category.user_id == user.id)
            .order_by(Category.created_at.asc(), Category.id.asc())
        ).all()
    )


def get_category(db: Session, user: User, category_id: int) -> Category:
    category = db.scalar(
        select(Category).where(Category.id == category_id, Category.user_id == user.id)
    )
    if category is None:
        raise not_found("Category not found.")
    return category


def _assert_unique_name(
    db: Session, user: User, name: str, exclude_id: int | None = None
) -> None:
    conditions = [
        Category.user_id == user.id,
        func.lower(Category.name) == name.strip().lower(),
    ]
    if exclude_id is not None:
        conditions.append(Category.id != exclude_id)
    if db.scalar(select(Category.id).where(*conditions)) is not None:
        raise conflict("You already have a category with that name.")


def create_category(db: Session, user: User, payload: CategoryCreate) -> Category:
    _assert_unique_name(db, user, payload.name)
    category = Category(user_id=user.id, name=payload.name, color=payload.color)
    db.add(category)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise conflict("You already have a category with that name.") from None
    db.refresh(category)
    return category


def update_category(
    db: Session, user: User, category_id: int, payload: CategoryUpdate
) -> Category:
    category = get_category(db, user, category_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        _assert_unique_name(db, user, data["name"], exclude_id=category.id)
        category.name = data["name"]
    if "color" in data and data["color"] is not None:
        category.color = data["color"]
    db.commit()
    db.refresh(category)
    return category


def delete_category(db: Session, user: User, category_id: int) -> None:
    category = get_category(db, user, category_id)
    # Sessions keep existing; their category becomes NULL (ON DELETE SET NULL).
    db.execute(
        FocusSession.__table__.update()
        .where(FocusSession.category_id == category.id)
        .values(category_id=None)
    )
    db.delete(category)
    db.commit()
