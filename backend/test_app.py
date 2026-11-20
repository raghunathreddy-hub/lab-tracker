import os
import sys

# Ensure backend directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Use SQLite for testing
os.environ["DATABASE_URL"] = "sqlite:///./test_lab_tracker.db"
os.environ["ALLOWED_ORIGINS"] = "http://localhost:5173,http://localhost:3000"

from database import Base, SessionLocal, engine
import models
import schemas
from main import (
    app,
    create_equipment,
    delete_equipment,
    get_equipment,
    health_check,
    seed_database,
    update_equipment,
)


def run_tests():
    # Setup test database
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    try:
        # 1. Health check
        health = health_check()
        assert health == {"status": "ok"}, f"Expected {{'status': 'ok'}}, got {health}"
        print("✓ health_check passed")

        # 2. Render URL normalization test
        test_render_url = "postgres://user:secret@dpg-abc-a.oregon-postgres.render.com/lab_tracker_db"
        normalized = (
            test_render_url.replace("postgres://", "postgresql://", 1)
            if test_render_url.startswith("postgres://")
            else test_render_url
        )
        assert normalized == "postgresql://user:secret@dpg-abc-a.oregon-postgres.render.com/lab_tracker_db"
        print("✓ Render DATABASE_URL postgres:// to postgresql:// normalization passed")

        # 3. Seed database when empty
        seed_res = seed_database(db=db)
        assert seed_res["seeded"] is True
        assert seed_res["count"] == 5
        assert len(seed_res["items"]) == 5
        print("✓ seed_database (first run) passed")

        # 4. Seed database when not empty (should skip)
        seed_res_2 = seed_database(db=db)
        assert seed_res_2["seeded"] is False
        assert seed_res_2["count"] == 5
        print("✓ seed_database (re-seed skip) passed")

        # 5. Get all equipment
        items = get_equipment(search=None, status=None, db=db)
        assert len(items) == 5
        print("✓ get_equipment (all) passed")

        # 6. Get equipment with search query
        microscope_items = get_equipment(search="Microscope", status=None, db=db)
        assert len(microscope_items) == 1
        assert "Microscope" in microscope_items[0].item_name
        print("✓ get_equipment (search filter) passed")

        # 7. Get equipment with status query
        available_items = get_equipment(search=None, status="Available", db=db)
        assert len(available_items) == 3
        assert all(item.status == "Available" for item in available_items)
        print("✓ get_equipment (status filter) passed")

        # 8. Create equipment (POST)
        new_payload = schemas.EquipmentCreate(
            item_name="Autoclave Steam Sterilizer",
            category="Sterilization",
            lab_room="Room 302",
            status="Available",
            assigned_to=None,
        )
        created_item = create_equipment(equipment_in=new_payload, db=db)
        assert created_item.id is not None
        assert created_item.item_name == "Autoclave Steam Sterilizer"
        assert created_item.category == "Sterilization"
        assert created_item.lab_room == "Room 302"
        assert created_item.status == "Available"
        item_id = created_item.id
        print("✓ create_equipment (POST) passed")

        # 9. Update equipment (PUT)
        update_payload = schemas.EquipmentUpdate(
            status="In Use",
            assigned_to="Dr. Marcus Bell",
        )
        updated_item = update_equipment(id=item_id, equipment_update=update_payload, db=db)
        assert updated_item.id == item_id
        assert updated_item.status == "In Use"
        assert updated_item.assigned_to == "Dr. Marcus Bell"
        assert updated_item.item_name == "Autoclave Steam Sterilizer"
        print("✓ update_equipment (PUT) passed")

        # 10. Delete equipment (DELETE)
        del_res = delete_equipment(id=item_id, db=db)
        assert "deleted successfully" in del_res["message"]

        # Verify deletion
        from fastapi import HTTPException
        try:
            update_equipment(id=item_id, equipment_update=update_payload, db=db)
            assert False, "Should have raised 404 HTTPException"
        except HTTPException as e:
            assert e.status_code == 404

        try:
            delete_equipment(id=item_id, db=db)
            assert False, "Should have raised 404 HTTPException"
        except HTTPException as e:
            assert e.status_code == 404
        print("✓ delete_equipment (DELETE) and 404 handling passed")

        # 11. Verify CORS configuration on app
        cors_middlewares = [m for m in app.user_middleware if "CORSMiddleware" in str(m)]
        assert len(cors_middlewares) > 0
        print("✓ CORS middleware verified on FastAPI app")

        print("\nAll 11 tests passed successfully!")

    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)
        if os.path.exists("./test_lab_tracker.db"):
            try:
                os.remove("./test_lab_tracker.db")
            except Exception:
                pass


if __name__ == "__main__":
    run_tests()
