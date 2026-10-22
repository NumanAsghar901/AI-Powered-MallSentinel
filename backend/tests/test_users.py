import pytest
from sqlalchemy import select

from app.models import AuditLog, EmployeeProfile, RefreshToken, User, UserStatus
from tests.conftest import API, PASSWORD, login

NEW_PW = "Zz9" + "unique-pw-1"


def _payload(world, **over):
    body = {
        "email": "new.person@mallsentinel-tests.com", "full_name": "New Person", "role": "employee",
        "password": NEW_PW, "department_id": world.bakery.id,
    }
    body.update(over)
    return body


# ------------------------------------------------------------------ RBAC matrix


@pytest.mark.parametrize("method,path", [
    ("get", "/users"), ("post", "/users"), ("get", "/users/{id}"), ("patch", "/users/{id}"),
    ("post", "/users/{id}/disable"), ("post", "/users/{id}/enable"), ("post", "/users/{id}/unlock"),
])
async def test_admin_endpoints_forbidden_for_supervisor_and_employee(client, world, sup_h, emp_h, method, path):
    url = API + path.format(id=world.bakery_emp.id)
    for headers in (sup_h, emp_h):
        r = await getattr(client, method)(url, headers=headers, **({"json": {}} if method in ("post", "patch") else {}))
        assert r.status_code == 403 and r.json()["code"] == "FORBIDDEN"


async def test_admin_endpoints_require_authentication(client, world):
    assert (await client.get(f"{API}/users")).status_code == 401


async def test_departments_list_available_to_all_roles(client, world, admin_h, sup_h, emp_h):
    for h in (admin_h, sup_h, emp_h):
        r = await client.get(f"{API}/departments", headers=h)
        assert r.status_code == 200 and [d["code"] for d in r.json()] == ["bakery", "meat_shop", "security"]
    assert (await client.get(f"{API}/departments")).status_code == 401


# ------------------------------------------------------------------ list / filter


async def test_list_search_filter_pagination(client, world, admin_h):
    r = await client.get(f"{API}/users", headers=admin_h)
    assert r.status_code == 200 and r.json()["total"] == 5
    assert "password_hash" not in r.text

    r = await client.get(f"{API}/users", headers=admin_h, params={"role": "supervisor"})
    assert r.json()["total"] == 2
    r = await client.get(f"{API}/users", headers=admin_h, params={"search": "bashir"})
    assert [u["email"] for u in r.json()["items"]] == ["emp.bakery@mallsentinel-tests.com"]
    r = await client.get(f"{API}/users", headers=admin_h, params={"department_id": world.meat.id})
    assert r.json()["total"] == 2
    r = await client.get(f"{API}/users", headers=admin_h, params={"page_size": 2, "page": 3, "sort": "email", "order": "asc"})
    assert len(r.json()["items"]) == 1 and r.json()["total"] == 5


async def test_list_validation_errors(client, admin_h):
    assert (await client.get(f"{API}/users", headers=admin_h, params={"page": 0})).status_code == 422
    assert (await client.get(f"{API}/users", headers=admin_h, params={"role": "boss"})).status_code == 422
    assert (await client.get(f"{API}/users", headers=admin_h, params={"sort": "password_hash"})).status_code == 422


# ------------------------------------------------------------------ create


async def test_admin_creates_employee_and_supervisor_who_can_login(client, world, admin_h):
    r = await client.post(f"{API}/users", headers=admin_h, json=_payload(world, shift="morning", designation="Baker"))
    assert r.status_code == 201
    body = r.json()
    assert body["role"] == "employee" and body["department"]["code"] == "bakery" and body["shift"] == "morning"
    assert (await client.post(f"{API}/auth/login", json={"email": "new.person@mallsentinel-tests.com", "password": NEW_PW})).status_code == 200

    r = await client.post(f"{API}/users", headers=admin_h, json=_payload(world, email="sv@mallsentinel-tests.com", role="supervisor"))
    assert r.status_code == 201 and r.json()["role"] == "supervisor"


async def test_create_cannot_make_admin_or_bad_input(client, world, admin_h):
    assert (await client.post(f"{API}/users", headers=admin_h, json=_payload(world, role="admin"))).status_code == 422
    assert (await client.post(f"{API}/users", headers=admin_h, json=_payload(world, email="bad"))).status_code == 422
    assert (await client.post(f"{API}/users", headers=admin_h, json=_payload(world, password="short1"))).status_code == 422
    assert (await client.post(f"{API}/users", headers=admin_h, json=_payload(world, password="allletters"))).status_code == 422
    assert (await client.post(f"{API}/users", headers=admin_h, json=_payload(world, full_name="x"))).status_code == 422
    assert (await client.post(f"{API}/users", headers=admin_h, json={})).status_code == 422


async def test_create_duplicate_email_and_bad_department(client, world, admin_h):
    r = await client.post(f"{API}/users", headers=admin_h, json=_payload(world, email=world.bakery_emp.email.upper()))
    assert r.status_code == 409 and r.json()["code"] == "EMAIL_TAKEN"
    r = await client.post(f"{API}/users", headers=admin_h, json=_payload(world, department_id=999))
    assert r.status_code == 400 and r.json()["code"] == "INVALID_DEPARTMENT"


async def test_create_rejects_supervisor_from_other_department(client, world, admin_h):
    r = await client.post(f"{API}/users", headers=admin_h,
                          json=_payload(world, supervisor_id=str(world.meat_sup.id)))
    assert r.status_code == 400 and r.json()["code"] == "INVALID_SUPERVISOR"


async def test_duplicate_employee_code(client, world, admin_h):
    assert (await client.post(f"{API}/users", headers=admin_h, json=_payload(world, employee_code="B-1"))).status_code == 201
    r = await client.post(f"{API}/users", headers=admin_h, json=_payload(world, email="b@mallsentinel-tests.com", employee_code="B-1"))
    assert r.status_code == 409 and r.json()["code"] == "EMPLOYEE_CODE_TAKEN"


# ------------------------------------------------------------------ update / role change


async def test_update_fields_and_empty_body_rejected(client, world, admin_h):
    uid = world.bakery_emp.id
    r = await client.patch(f"{API}/users/{uid}", headers=admin_h, json={"full_name": "Bashir Updated", "shift": "night"})
    assert r.status_code == 200 and r.json()["full_name"] == "Bashir Updated" and r.json()["shift"] == "night"
    assert (await client.patch(f"{API}/users/{uid}", headers=admin_h, json={})).status_code == 422
    assert (await client.patch(f"{API}/users/{uid}", headers=admin_h, json={"email": world.admin.email})).status_code == 409
    assert (await client.patch(f"{API}/users/{uid}", headers=admin_h, json={"role": "admin"})).status_code == 422


async def test_role_change_employee_to_supervisor_and_audit(client, world, admin_h, db):
    uid, admin_id = world.bakery_emp.id, world.admin.id
    r = await client.patch(f"{API}/users/{uid}", headers=admin_h, json={"role": "supervisor"})
    assert r.status_code == 200 and r.json()["role"] == "supervisor" and r.json()["department"]["code"] == "bakery"
    db.expire_all()  # the test session may hold a stale identity-map copy
    assert await db.get(EmployeeProfile, uid) is None
    rows = (await db.scalars(select(AuditLog).where(AuditLog.action == "user.role_changed"))).all()
    assert rows[-1].details == {"from": "employee", "to": "supervisor"} and rows[-1].actor_user_id == admin_id


async def test_role_change_supervisor_to_employee_detaches_team(client, world, admin_h, db):
    r = await client.patch(f"{API}/users/{world.bakery_sup.id}", headers=admin_h, json={"role": "employee"})
    assert r.status_code == 200 and r.json()["role"] == "employee"
    ep = await db.get(EmployeeProfile, world.bakery_emp.id)
    await db.refresh(ep)
    assert ep.supervisor_id is None


async def test_move_employee_to_other_department(client, world, admin_h):
    r = await client.patch(f"{API}/users/{world.bakery_emp.id}", headers=admin_h, json={"department_id": world.meat.id})
    assert r.status_code == 200 and r.json()["department"]["code"] == "meat_shop" and r.json()["supervisor_id"] is None


async def test_admin_cannot_modify_admins_or_self(client, world, admin_h):
    for path, method in ((f"/users/{world.admin.id}", "patch"), (f"/users/{world.admin.id}/disable", "post")):
        r = await getattr(client, method)(API + path, headers=admin_h, json={"full_name": "Hacker"} if method == "patch" else None)
        assert r.status_code == 400 and r.json()["code"] == "SELF_ACTION"


async def test_not_found_and_bad_uuid(client, admin_h):
    assert (await client.get(f"{API}/users/00000000-0000-0000-0000-000000000000", headers=admin_h)).status_code == 404
    assert (await client.get(f"{API}/users/not-a-uuid", headers=admin_h)).status_code == 422


async def test_admin_password_change_revokes_sessions(client, world, admin_h, db):
    await login(client, world.bakery_emp)
    r = await client.patch(f"{API}/users/{world.bakery_emp.id}", headers=admin_h, json={"password": NEW_PW})
    assert r.status_code == 200
    live = (await db.scalars(select(RefreshToken).where(RefreshToken.user_id == world.bakery_emp.id,
                                                       RefreshToken.revoked_at.is_(None)))).all()
    assert live == []
    assert (await client.post(f"{API}/auth/login", json={"email": world.bakery_emp.email, "password": NEW_PW})).status_code == 200


# ------------------------------------------------------------------ disable / enable / unlock


async def test_disable_enable_cycle(client, world, admin_h, db):
    uid = world.bakery_emp.id
    r = await client.post(f"{API}/users/{uid}/disable", headers=admin_h)
    assert r.status_code == 200 and r.json()["status"] == "disabled"
    assert (await client.post(f"{API}/auth/login", json={"email": world.bakery_emp.email, "password": PASSWORD})).json()["code"] == "ACCOUNT_DISABLED"
    r = await client.post(f"{API}/users/{uid}/enable", headers=admin_h)
    assert r.json()["status"] == "active"
    assert (await client.post(f"{API}/auth/login", json={"email": world.bakery_emp.email, "password": PASSWORD})).status_code == 200
    actions = {a.action for a in (await db.scalars(select(AuditLog).where(AuditLog.entity_id == str(uid)))).all()}
    assert {"user.disabled", "user.enabled"} <= actions


async def test_unlock(client, world, admin_h):
    for _ in range(5):
        await client.post(f"{API}/auth/login", json={"email": world.bakery_emp.email, "password": "wrong-password-1"})
    listing = await client.get(f"{API}/users", headers=admin_h, params={"search": world.bakery_emp.email})
    assert listing.json()["items"][0]["is_locked"] is True
    r = await client.post(f"{API}/users/{world.bakery_emp.id}/unlock", headers=admin_h)
    assert r.status_code == 200 and r.json()["is_locked"] is False
    assert (await client.post(f"{API}/auth/login", json={"email": world.bakery_emp.email, "password": PASSWORD})).status_code == 200


async def test_user_created_audit_row(client, world, admin_h, db):
    r = await client.post(f"{API}/users", headers=admin_h, json=_payload(world))
    row = await db.scalar(select(AuditLog).where(AuditLog.action == "user.created", AuditLog.entity_id == r.json()["id"]))
    assert row and row.actor_email == world.admin.email and row.details["role"] == "employee"
    assert NEW_PW not in str(row.details)
