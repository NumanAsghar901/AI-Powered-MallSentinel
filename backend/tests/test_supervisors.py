import pytest
from sqlalchemy import select

from app.models import AuditLog, EmployeeProfile, RefreshToken
from tests.conftest import API, PASSWORD, login

NEW_PW = "Zz9" + "unique-pw-1"


def _payload(world, **over):
    body = {
        "email": "new.supervisor@mallsentinel-tests.com", "full_name": "New Supervisor",
        "password": NEW_PW, "department_id": world.security.id,
    }
    body.update(over)
    return body


# ------------------------------------------------------------------ RBAC matrix


@pytest.mark.parametrize("method,path", [
    ("get", "/supervisors"), ("post", "/supervisors"), ("get", "/supervisors/{id}"), ("patch", "/supervisors/{id}"),
    ("post", "/supervisors/{id}/disable"), ("post", "/supervisors/{id}/enable"), ("post", "/supervisors/{id}/unlock"),
])
async def test_supervisor_endpoints_forbidden_for_supervisor_and_employee(client, world, sup_h, emp_h, method, path):
    url = API + path.format(id=world.meat_sup.id)
    for headers in (sup_h, emp_h):
        r = await getattr(client, method)(url, headers=headers, **({"json": {}} if method in ("post", "patch") else {}))
        assert r.status_code == 403 and r.json()["code"] == "FORBIDDEN"


async def test_old_admin_users_routes_are_gone(client, admin_h):
    assert (await client.get(f"{API}/users", headers=admin_h)).status_code == 404


async def test_supervisor_endpoints_require_authentication(client, world):
    assert (await client.get(f"{API}/supervisors")).status_code == 401


async def test_departments_list_available_to_all_roles(client, world, admin_h, sup_h, emp_h):
    for h in (admin_h, sup_h, emp_h):
        r = await client.get(f"{API}/departments", headers=h)
        assert r.status_code == 200 and [d["code"] for d in r.json()] == ["bakery", "meat_shop", "security"]
    assert (await client.get(f"{API}/departments")).status_code == 401


# ------------------------------------------------------------------ list / filter


async def test_list_shows_only_supervisors_with_search_and_pagination(client, world, admin_h):
    r = await client.get(f"{API}/supervisors", headers=admin_h)
    assert r.status_code == 200 and r.json()["total"] == 2
    assert {u["role"] for u in r.json()["items"]} == {"supervisor"}
    assert "password_hash" not in r.text

    r = await client.get(f"{API}/supervisors", headers=admin_h, params={"search": "murad"})
    assert [u["email"] for u in r.json()["items"]] == ["sup.meat@mallsentinel-tests.com"]
    r = await client.get(f"{API}/supervisors", headers=admin_h, params={"department_id": world.bakery.id})
    assert r.json()["total"] == 1
    r = await client.get(
        f"{API}/supervisors", headers=admin_h, params={"page_size": 1, "page": 2, "sort": "email", "order": "asc"}
    )
    assert len(r.json()["items"]) == 1 and r.json()["total"] == 2


async def test_list_validation_errors(client, admin_h):
    assert (await client.get(f"{API}/supervisors", headers=admin_h, params={"page": 0})).status_code == 422
    assert (await client.get(f"{API}/supervisors", headers=admin_h, params={"status": "boss"})).status_code == 422
    assert (await client.get(f"{API}/supervisors", headers=admin_h, params={"sort": "password_hash"})).status_code == 422


# ------------------------------------------------------------------ create


async def test_admin_creates_supervisor_who_can_login(client, world, admin_h):
    r = await client.post(f"{API}/supervisors", headers=admin_h, json=_payload(world, designation="Head of Security"))
    assert r.status_code == 201
    body = r.json()
    assert body["role"] == "supervisor" and body["department"]["code"] == "security"
    assert body["designation"] == "Head of Security"
    login_r = await client.post(
        f"{API}/auth/login", json={"email": "new.supervisor@mallsentinel-tests.com", "password": NEW_PW}
    )
    assert login_r.status_code == 200 and login_r.json()["user"]["role"] == "supervisor"


async def test_create_ignores_a_role_field_and_rejects_bad_input(client, world, admin_h):
    # a role in the body is not part of the schema: the account is always a supervisor
    r = await client.post(f"{API}/supervisors", headers=admin_h, json=_payload(world, role="admin"))
    assert r.status_code == 201 and r.json()["role"] == "supervisor"
    for bad in (
        _payload(world, email="bad"),
        _payload(world, password="short1"),
        _payload(world, password="allletters"),
        _payload(world, full_name="x"),
        {},
    ):
        assert (await client.post(f"{API}/supervisors", headers=admin_h, json=bad)).status_code == 422


async def test_create_duplicate_email_and_bad_department(client, world, admin_h):
    r = await client.post(
        f"{API}/supervisors", headers=admin_h, json=_payload(world, email=world.bakery_sup.email.upper())
    )
    assert r.status_code == 409 and r.json()["code"] == "EMAIL_TAKEN"
    r = await client.post(f"{API}/supervisors", headers=admin_h, json=_payload(world, department_id=999))
    assert r.status_code == 400 and r.json()["code"] == "INVALID_DEPARTMENT"


# ------------------------------------------------------------------ update


async def test_update_fields_and_empty_body_rejected(client, world, admin_h):
    uid = world.bakery_sup.id
    r = await client.patch(
        f"{API}/supervisors/{uid}", headers=admin_h, json={"full_name": "Sana Updated", "designation": "Lead"}
    )
    assert r.status_code == 200 and r.json()["full_name"] == "Sana Updated" and r.json()["designation"] == "Lead"
    assert (await client.patch(f"{API}/supervisors/{uid}", headers=admin_h, json={})).status_code == 422
    r = await client.patch(f"{API}/supervisors/{uid}", headers=admin_h, json={"email": world.admin.email})
    assert r.status_code == 409


async def test_role_cannot_be_changed_here(client, world, admin_h):
    r = await client.patch(
        f"{API}/supervisors/{world.bakery_sup.id}", headers=admin_h, json={"role": "employee", "full_name": "Still Sup"}
    )
    assert r.status_code == 200 and r.json()["role"] == "supervisor"


async def test_move_supervisor_detaches_their_employees(client, world, admin_h, db):
    emp_id = world.bakery_emp.id
    r = await client.patch(
        f"{API}/supervisors/{world.bakery_sup.id}", headers=admin_h, json={"department_id": world.security.id}
    )
    assert r.status_code == 200 and r.json()["department"]["code"] == "security"
    db.expire_all()
    ep = await db.get(EmployeeProfile, emp_id)
    assert ep.supervisor_id is None


async def test_admin_password_change_revokes_sessions(client, world, admin_h, db):
    sup_id, sup_email = world.bakery_sup.id, world.bakery_sup.email
    await login(client, world.bakery_sup)
    r = await client.patch(f"{API}/supervisors/{sup_id}", headers=admin_h, json={"password": NEW_PW})
    assert r.status_code == 200
    live = (
        await db.scalars(select(RefreshToken).where(RefreshToken.user_id == sup_id, RefreshToken.revoked_at.is_(None)))
    ).all()
    assert live == []
    assert (await client.post(f"{API}/auth/login", json={"email": sup_email, "password": NEW_PW})).status_code == 200


# ------------------------------------------------------------------ admin cannot reach other roles


async def test_employees_and_admins_are_invisible_and_untouchable(client, world, admin_h):
    for target in (world.bakery_emp.id, world.admin.id):
        assert (await client.get(f"{API}/supervisors/{target}", headers=admin_h)).status_code == 404
        r = await client.patch(f"{API}/supervisors/{target}", headers=admin_h, json={"full_name": "Hacker"})
        assert r.status_code == 404
        assert (await client.post(f"{API}/supervisors/{target}/disable", headers=admin_h)).status_code == 404
        assert (await client.post(f"{API}/supervisors/{target}/unlock", headers=admin_h)).status_code == 404


async def test_not_found_and_bad_uuid(client, admin_h):
    assert (await client.get(f"{API}/supervisors/00000000-0000-0000-0000-000000000000", headers=admin_h)).status_code == 404
    assert (await client.get(f"{API}/supervisors/not-a-uuid", headers=admin_h)).status_code == 422


# ------------------------------------------------------------------ disable / enable / unlock


async def test_disable_enable_cycle(client, world, admin_h, db):
    uid, email = world.bakery_sup.id, world.bakery_sup.email
    r = await client.post(f"{API}/supervisors/{uid}/disable", headers=admin_h)
    assert r.status_code == 200 and r.json()["status"] == "disabled"
    blocked = await client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})
    assert blocked.json()["code"] == "ACCOUNT_DISABLED"
    r = await client.post(f"{API}/supervisors/{uid}/enable", headers=admin_h)
    assert r.json()["status"] == "active"
    assert (await client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})).status_code == 200
    actions = {a.action for a in (await db.scalars(select(AuditLog).where(AuditLog.entity_id == str(uid)))).all()}
    assert {"user.disabled", "user.enabled"} <= actions


async def test_unlock(client, world, admin_h):
    email = world.bakery_sup.email
    for _ in range(5):
        await client.post(f"{API}/auth/login", json={"email": email, "password": "wrong-password-1"})
    listing = await client.get(f"{API}/supervisors", headers=admin_h, params={"search": email})
    assert listing.json()["items"][0]["is_locked"] is True
    r = await client.post(f"{API}/supervisors/{world.bakery_sup.id}/unlock", headers=admin_h)
    assert r.status_code == 200 and r.json()["is_locked"] is False
    assert (await client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})).status_code == 200


async def test_supervisor_created_audit_row(client, world, admin_h, db):
    admin_email = world.admin.email
    r = await client.post(f"{API}/supervisors", headers=admin_h, json=_payload(world))
    row = await db.scalar(
        select(AuditLog).where(AuditLog.action == "user.created", AuditLog.entity_id == r.json()["id"])
    )
    assert row and row.actor_email == admin_email and row.details["role"] == "supervisor"
    assert NEW_PW not in str(row.details)
