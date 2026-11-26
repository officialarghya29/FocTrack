from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from fastapi.encoders import jsonable_encoder
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import current_user
from app.core.clock import utcnow
from app.database.session import get_db
from app.models import User
from app.services import backup_service, demo_service

router = APIRouter(tags=["data"])


@router.get("/export")
def export_data(db: Session = Depends(get_db), user: User = Depends(current_user)):
    payload = jsonable_encoder(backup_service.export_all(db, user))
    stamp = utcnow().strftime("%Y%m%d-%H%M")
    return Response(
        content=json.dumps(payload, indent=2),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="foctrack-export-{stamp}.json"'
        },
    )


@router.delete("/data")
def delete_data(db: Session = Depends(get_db), user: User = Depends(current_user)):
    removed = backup_service.delete_all_sessions(db, user)
    return {"deletedSessions": removed, "message": "All session history deleted."}


@router.post("/demo/seed")
def seed_demo(db: Session = Depends(get_db), user: User = Depends(current_user)):
    created = demo_service.seed_demo_data(db, user)
    if created == 0:
        return {
            "created": 0,
            "message": "Demo data already present. Reset it first to regenerate.",
        }
    return {
        "created": created,
        "message": f"Added {created} demo sessions. They are labelled as demo data.",
    }


@router.delete("/demo")
def clear_demo(db: Session = Depends(get_db), user: User = Depends(current_user)):
    removed = demo_service.clear_demo_data(db, user)
    return {"removed": removed, "message": f"Removed {removed} demo sessions."}
