import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import (
    CctvEvidence,
    Department,
    EvidenceReviewStatus,
    PenaltySeverity,
    User,
    UserRole,
    UserStatus,
)
from tests.conftest import API, PASSWORD, World, _user


@pytest.fixture
async def evidence_world(db: AsyncSession, world: World) -> list[CctvEvidence]:
    # Ensure storage dir exists and has dummy test image
    Path(settings.EVIDENCE_DIR).mkdir(parents=True, exist_ok=True)
    test_img = Path(settings.EVIDENCE_DIR) / "test_evidence.jpg"
    if not test_img.exists():
        test_img.write_bytes(b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xdb\x00C\x00\xff\xd9")

    evidences = [
        CctvEvidence(
            id=uuid.uuid4(),
            evidence_source="DUMMY",
            department_id=world.bakery.id,
            employee_id=world.bakery_emp.id,
            camera_id="CAM-BK-01",
            camera_location="Bakery Station A",
            violation_type="No Hairnet",
            severity=PenaltySeverity.high,
            confidence_score=0.94,
            detection_labels=[{"label": "No Hairnet", "confidence": 0.94, "box": [10, 10, 50, 50]}],
            image_url=f"/api/v1/evidence/test/image",
            image_filename="test_evidence.jpg",
            cloudinary_public_id="mallsentinel/evidence/bakery_01",
            captured_at=datetime.now(timezone.utc),
            review_status=EvidenceReviewStatus.pending,
        ),
        CctvEvidence(
            id=uuid.uuid4(),
            evidence_source="DUMMY",
            department_id=world.meat.id,
            employee_id=world.meat_emp.id,
            camera_id="CAM-MT-01",
            camera_location="Meat Block 1",
            violation_type="No Cut-Resistant Gloves",
            severity=PenaltySeverity.critical,
            confidence_score=0.96,
            detection_labels=[{"label": "No Cut-Resistant Gloves", "confidence": 0.96, "box": [20, 20, 60, 60]}],
            image_url=f"/api/v1/evidence/test/image",
            image_filename="test_evidence.jpg",
            cloudinary_public_id="mallsentinel/evidence/meat_01",
            captured_at=datetime.now(timezone.utc),
            review_status=EvidenceReviewStatus.pending,
        ),
    ]
    for ev in evidences:
        db.add(ev)
    await db.commit()
    return evidences


async def _token(client: AsyncClient, email: str) -> str:
    res = await client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


@pytest.mark.asyncio
async def test_admin_can_list_all_evidence(client: AsyncClient, world: World, evidence_world: list[CctvEvidence]) -> None:
    token = await _token(client, world.admin.email)
    res = await client.get(f"{API}/evidence", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 2


@pytest.mark.asyncio
async def test_supervisor_department_scoping(client: AsyncClient, world: World, evidence_world: list[CctvEvidence]) -> None:
    bakery_token = await _token(client, world.bakery_sup.email)
    meat_token = await _token(client, world.meat_sup.email)

    # Bakery supervisor only gets Bakery evidence
    res_b = await client.get(f"{API}/evidence", headers={"Authorization": f"Bearer {bakery_token}"})
    assert res_b.status_code == 200
    items_b = res_b.json()["items"]
    assert all(item["department"]["code"] == "bakery" for item in items_b)

    # Meat supervisor only gets Meat evidence
    res_m = await client.get(f"{API}/evidence", headers={"Authorization": f"Bearer {meat_token}"})
    assert res_m.status_code == 200
    items_m = res_m.json()["items"]
    assert all(item["department"]["code"] == "meat_shop" for item in items_m)


@pytest.mark.asyncio
async def test_supervisor_cannot_access_other_department_evidence(
    client: AsyncClient, world: World, evidence_world: list[CctvEvidence]
) -> None:
    bakery_token = await _token(client, world.bakery_sup.email)
    meat_evidence = evidence_world[1]

    # Bakery supervisor tries to access meat evidence
    res = await client.get(f"{API}/evidence/{meat_evidence.id}", headers={"Authorization": f"Bearer {bakery_token}"})
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_supervisor_can_review_evidence(
    client: AsyncClient, world: World, evidence_world: list[CctvEvidence]
) -> None:
    bakery_token = await _token(client, world.bakery_sup.email)
    bakery_evidence = evidence_world[0]

    # Approve
    res = await client.post(
        f"{API}/evidence/{bakery_evidence.id}/review",
        json={"action": "approve", "remarks": "Violation verified by supervisor."},
        headers={"Authorization": f"Bearer {bakery_token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["review_status"] == "approved"
    assert data["supervisor_remarks"] == "Violation verified by supervisor."
    assert data["reviewed_by"]["id"] == str(world.bakery_sup.id)

    # Verify persistence by re-fetching
    get_res = await client.get(f"{API}/evidence/{bakery_evidence.id}", headers={"Authorization": f"Bearer {bakery_token}"})
    assert get_res.status_code == 200
    assert get_res.json()["review_status"] == "approved"
    assert get_res.json()["supervisor_remarks"] == "Violation verified by supervisor."


@pytest.mark.asyncio
async def test_evidence_source_filter(client: AsyncClient, world: World, evidence_world: list[CctvEvidence]) -> None:
    token = await _token(client, world.admin.email)
    res = await client.get(f"{API}/evidence?evidence_source=DUMMY", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    items = res.json()["items"]
    assert all(item["evidence_source"] == "DUMMY" for item in items)


@pytest.mark.asyncio
async def test_evidence_image_endpoint(client: AsyncClient, world: World, evidence_world: list[CctvEvidence]) -> None:
    token = await _token(client, world.admin.email)
    ev = evidence_world[0]
    res = await client.get(f"{API}/evidence/{ev.id}/image", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/jpeg"

