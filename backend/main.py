import os
from contextlib import asynccontextmanager
from typing import List, Optional
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

import models
import schemas
from database import Base, engine, get_db

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print(f"Database table creation warning: {e}")
    yield


app = FastAPI(title="Lab Tracker API", lifespan=lifespan)

# CORS configuration
allowed_origins_raw = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
origins = [origin.strip() for origin in allowed_origins_raw.split(",") if origin.strip()]
if not origins:
    origins = ["http://localhost:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Router for /api/equipment
equipment_router = APIRouter(prefix="/api/equipment", tags=["equipment"])


@app.get("/health")
def health_check():
    return {"status": "ok"}


SAMPLE_EQUIPMENT = [
    {
        "item_name": "Centrifuge 5424 R",
        "category": "Centrifuges",
        "lab_room": "Room 101",
        "status": "Available",
        "assigned_to": None,
    },
    {
        "item_name": "Binocular Compound Microscope",
        "category": "Microscopes",
        "lab_room": "Room 102",
        "status": "In Use",
        "assigned_to": "Dr. Aris Thorne",
    },
    {
        "item_name": "Thermal Cycler PCR Machine",
        "category": "Molecular Biology",
        "lab_room": "Room 103",
        "status": "Available",
        "assigned_to": None,
    },
    {
        "item_name": "UV-Vis Spectrophotometer",
        "category": "Spectroscopy",
        "lab_room": "Room 101",
        "status": "Maintenance",
        "assigned_to": None,
    },
    {
        "item_name": "Analytical Balance 0.1mg",
        "category": "Balances",
        "lab_room": "Room 104",
        "status": "Available",
        "assigned_to": "Sarah Jenkins",
    },
]


@app.post("/api/seed")
def seed_database(db: Session = Depends(get_db)):
    existing_count = db.query(models.Equipment).count()
    if existing_count > 0:
        return {
            "message": f"Database already contains {existing_count} items. Seeding skipped.",
            "seeded": False,
            "count": existing_count,
        }

    created_items = []
    for item_data in SAMPLE_EQUIPMENT:
        item = models.Equipment(**item_data)
        db.add(item)
        created_items.append(item)
    db.commit()

    for item in created_items:
        db.refresh(item)

    return {
        "message": "Successfully inserted 5 sample lab items.",
        "seeded": True,
        "count": len(created_items),
        "items": [
            schemas.EquipmentResponse.model_validate(item)
            if hasattr(schemas.EquipmentResponse, "model_validate")
            else schemas.EquipmentResponse.from_orm(item)
            for item in created_items
        ],
    }


@equipment_router.get("", response_model=List[schemas.EquipmentResponse])
@equipment_router.get("/", response_model=List[schemas.EquipmentResponse], include_in_schema=False)
def get_equipment(
    search: Optional[str] = Query(None, description="Search term for item_name, category, lab_room, or assigned_to"),
    status: Optional[str] = Query(None, description="Filter by status (e.g. Available, In Use, Maintenance)"),
    db: Session = Depends(get_db),
):
    query = db.query(models.Equipment)

    if status:
        query = query.filter(func.lower(models.Equipment.status) == status.strip().lower())

    if search:
        search_term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                models.Equipment.item_name.ilike(search_term),
                models.Equipment.category.ilike(search_term),
                models.Equipment.lab_room.ilike(search_term),
                models.Equipment.assigned_to.ilike(search_term),
            )
        )

    return query.order_by(models.Equipment.id.asc()).all()


@equipment_router.post("", response_model=schemas.EquipmentResponse, status_code=status.HTTP_201_CREATED)
@equipment_router.post("/", response_model=schemas.EquipmentResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_equipment(
    equipment_in: schemas.EquipmentCreate,
    db: Session = Depends(get_db),
):
    new_equipment = models.Equipment(
        item_name=equipment_in.item_name,
        category=equipment_in.category,
        lab_room=equipment_in.lab_room,
        status=equipment_in.status if equipment_in.status is not None else "Available",
        assigned_to=equipment_in.assigned_to,
    )
    db.add(new_equipment)
    db.commit()
    db.refresh(new_equipment)
    return new_equipment


@equipment_router.put("/{id}", response_model=schemas.EquipmentResponse)
def update_equipment(
    id: int,
    equipment_update: schemas.EquipmentUpdate,
    db: Session = Depends(get_db),
):
    equipment = db.query(models.Equipment).filter(models.Equipment.id == id).first()
    if not equipment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Equipment with id {id} not found",
        )

    update_data = (
        equipment_update.model_dump(exclude_unset=True)
        if hasattr(equipment_update, "model_dump")
        else equipment_update.dict(exclude_unset=True)
    )

    for field, value in update_data.items():
        setattr(equipment, field, value)

    db.commit()
    db.refresh(equipment)
    return equipment


@equipment_router.delete("/{id}")
def delete_equipment(
    id: int,
    db: Session = Depends(get_db),
):
    equipment = db.query(models.Equipment).filter(models.Equipment.id == id).first()
    if not equipment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Equipment with id {id} not found",
        )

    db.delete(equipment)
    db.commit()
    return {"message": f"Equipment with id {id} deleted successfully"}


app.include_router(equipment_router)
