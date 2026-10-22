import pytest
from sqlalchemy import select

from app.models import AuditLog, User, UserStatus
from tests.conftest import API, PASSWORD

PW = "Cc3" + "emp-secret-1"


def _body(**over):
    body = {"email": "fresh.hire@mallsentinel-tests.com", "full_name": "Fresh Hire", "password": PW}
    body.update(over)
    return body


@pytest.mark.parametrize("method,path", [
    ("get", "/employees"), ("post", "/employees"), ("get", "/employees/{id}"),
    ("patch", "/employees/{id}"), ("delete", "/employees/{id}"),
])
async def test_employees_endpoints_forbidden_for_admin_and_employee(client, world, admin_h, emp_h, method, path):
    url = API + path.format(id=world.bakery_emp.id)
    for headers in (admin_h, emp_h):
        r = await getattr(client, method)(url, headers=headers, **({"json": {}} if method in ("post", "patch") else {}))
        assert r.status_code == 403 and r.json()["code"] == "FORBIDDEN"


async def test_supervisor_lists_only_own_department(client, world, sup_h):
    r = await client.get(f"{API}/employees", headers=sup_h)
    assert r.status_code == 200
    assert [u["email"] for u in r.json()["items"]] == [world.bakery_emp.email]
    assert all(u["role"] == "employee" and u["department"]["code"] == "bakery" for u in r.json()["items"])


async def test_create_employee_is_forced_into_supervisors_department(client, world, sup_h, db):
    # department_id / role in the body are ignored (not part of the schema)
    r = await client.post(f"{API}/employees", headers=sup_h,
                          json=_body(department_id=world.meat.id, role="supervisor", shift="evening"))
    assert r.status_code == 201
    body = r.json()
    assert body["role"] == "employee" and body["department"]["code"] == "bakery"
    assert body["supervisor_id"] == str(world.bakery_sup.id) and body["shift"] == "evening"
    row = await db.scalar(select(AuditLog).where(AuditLog.action == "user.created", AuditLog.entity_id == body["id"]))
    assert row.actor_user_id == world.bakery_sup.id


async def test_create_validation_and_duplicates(client, world, sup_h):
    assert (await client.post(f"{API}/employees", headers=sup_h, json={})).status_code == 422
    assert (await client.post(f"{API}/employees", headers=sup_h, json=_body(password="short"))).status_code == 422
    assert (await client.post(f"{API}/employees", headers=sup_h, json=_body(phone="abc"))).status_code == 422
    assert (await client.post(f"{API}/employees", headers=sup_h, json=_body(shift="lunch"))).status_code == 422
    r = await client.post(f"{API}/employees", headers=sup_h, json=_body(email=world.meat_emp.email))
    assert r.status_code == 409 and r.json()["code"] == "EMAIL_TAKEN"


async def test_cannot_see_edit_or_remove_other_department(client, world, sup_h):
    other = world.meat_emp.id
    assert (await client.get(f"{API}/employees/{other}", headers=sup_h)).status_code == 404
    assert (await client.patch(f"{API}/employees/{other}", headers=sup_h, json={"full_name": "Intruder"})).status_code == 404
    assert (await client.delete(f"{API}/employees/{other}", headers=sup_h)).status_code == 404


async def test_cannot_touch_supervisors_or_admins_via_employee_endpoints(client, world, sup_h):
    for uid in (world.meat_sup.id, world.bakery_sup.id, world.admin.id):
        assert (await client.get(f"{API}/employees/{uid}", headers=sup_h)).status_code == 404
        assert (await client.delete(f"{API}/employees/{uid}", headers=sup_h)).status_code == 404


async def test_update_own_employee(client, world, sup_h):
    uid = world.bakery_emp.id
    r = await client.patch(f"{API}/employees/{uid}", headers=sup_h,
                           json={"full_name": "Bashir Senior", "assigned_area": "Counter 2", "status": "disabled"})
    assert r.status_code == 200
    assert r.json()["full_name"] == "Bashir Senior" and r.json()["assigned_area"] == "Counter 2"
    assert r.json()["status"] == "disabled"
    assert (await client.patch(f"{API}/employees/{uid}", headers=sup_h, json={})).status_code == 422
    assert (await client.patch(f"{API}/employees/{uid}", headers=sup_h, json={"status": "removed"})).status_code == 422


async def test_supervisor_cannot_change_role_or_department_via_patch(client, world, sup_h):
    uid = world.bakery_emp.id
    r = await client.patch(f"{API}/employees/{uid}", headers=sup_h,
                           json={"role": "supervisor", "department_id": world.meat.id, "full_name": "Still Baker"})
    assert r.status_code == 200 and r.json()["role"] == "employee" and r.json()["department"]["code"] == "bakery"


async def test_remove_is_soft_delete_hides_and_blocks_login(client, world, sup_h, db):
    uid = world.bakery_emp.id
    assert (await client.delete(f"{API}/employees/{uid}", headers=sup_h)).status_code == 204
    assert (await client.get(f"{API}/employees", headers=sup_h)).json()["total"] == 0
    assert (await client.get(f"{API}/employees/{uid}", headers=sup_h)).status_code == 404
    db.expire_all()
    row = await db.scalar(select(User).where(User.id == uid))
    assert row is not None and row.status == UserStatus.removed
    r = await client.post(f"{API}/auth/login", json={"email": world.bakery_emp.email, "password": PASSWORD})
    assert r.status_code == 403 and r.json()["code"] == "ACCOUNT_DISABLED"
    assert (await db.scalar(select(AuditLog).where(AuditLog.action == "user.removed", AuditLog.entity_id == str(uid)))) is not None
    assert (await client.delete(f"{API}/employees/{uid}", headers=sup_h)).status_code == 404


async def test_removed_employee_visible_to_admin_for_history(client, world, sup_h, admin_h):
    await client.delete(f"{API}/employees/{world.bakery_emp.id}", headers=sup_h)
    r = await client.get(f"{API}/users", headers=admin_h, params={"status": "removed"})
    assert r.json()["total"] == 1


async def test_employee_can_read_only_self(client, world, emp_h):
    r = await client.get(f"{API}/auth/me", headers=emp_h)
    assert r.json()["email"] == world.bakery_emp.email
