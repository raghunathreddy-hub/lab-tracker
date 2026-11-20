from typing import Optional
from pydantic import BaseModel

try:
    from pydantic import ConfigDict
    HAS_V2 = True
except ImportError:
    HAS_V2 = False


class EquipmentBase(BaseModel):
    item_name: str
    category: str
    lab_room: str
    status: Optional[str] = "Available"
    assigned_to: Optional[str] = None


class EquipmentCreate(EquipmentBase):
    pass


class EquipmentUpdate(BaseModel):
    item_name: Optional[str] = None
    category: Optional[str] = None
    lab_room: Optional[str] = None
    status: Optional[str] = None
    assigned_to: Optional[str] = None


class EquipmentResponse(EquipmentBase):
    id: int
    item_name: str
    category: str
    lab_room: str
    status: str
    assigned_to: Optional[str] = None

    if HAS_V2:
        model_config = ConfigDict(from_attributes=True)
    else:
        class Config:
            orm_mode = True
