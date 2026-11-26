from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.api.deps import current_user
from app.database.session import get_db
from app.core.errors import bad_request
from app.models import User
from app.schemas.imports import ImportSummary
from app.services import import_service

router = APIRouter(prefix="/import", tags=["import"])


@router.get("/csv/template", response_class=PlainTextResponse)
def csv_template() -> PlainTextResponse:
    """Downloadable CSV header and example rows."""
    return PlainTextResponse(
        content=import_service.template_csv(),
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="foctrack-import-template.csv"'
        },
    )


@router.post("/csv", response_model=ImportSummary)
async def import_csv(
    file: UploadFile = File(..., description="UTF-8 CSV file, maximum 2 MB"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> dict:
    if file.filename and not file.filename.lower().endswith(".csv"):
        raise bad_request("Upload a .csv file.")
    content = await file.read()
    if not content:
        raise bad_request("The uploaded file is empty.")
    return import_service.import_sessions_csv(db, user, content)
