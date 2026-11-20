from sqlalchemy import Column, Integer, String
from database import Base


class Equipment(Base):
    __tablename__ = "equipment"

    id = Column(Integer, primary_key=True, index=True)
    item_name = Column(String, nullable=False, index=True)
    category = Column(String, nullable=False, index=True)
    lab_room = Column(String, nullable=False, index=True)
    status = Column(String, nullable=False, default="Available", server_default="Available")
    assigned_to = Column(String, nullable=True)
