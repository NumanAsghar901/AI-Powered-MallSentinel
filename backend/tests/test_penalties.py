import uuid

import pytest
from sqlalchemy import select, update

from app.models import AuditLog, Penalty, User, UserStatus
from app.services import email_service
from tests.conftest import API, login


class Outbox:
    def __init__(self) -> None:
        self.sent: list[tuple[str, email_service.PenaltyNotice]] = []
        self.fail = False


@pytest.fixture
def mail(monkeypatch) -> Outbox:
    """Captures penalty emails instead of talking to Gmail."""
    box = Outbox()

    async def fake(to: str, notice: email_service.PenaltyNotice) -> None:
        if box.fail:
            raise RuntimeError("smtp is down")
        box.sent.append((to, notice))

    monkeypatch.setattr(email_service, "send_penalty_notice", fake)
    return box


def _body(world, **over):
    body = {
        "employee_id": str(world.bakery_emp.id), "reason": "missing_gloves",
        "severity": "high", "action": "written_warning", "notes": "Seen handling dough without gloves.",
    }
    body.update(over)
    return body


# ------------------------------------------------------------------ issuing


async def test_supervisor_issues_penalty_and_employee_is_emailed(client, world, sup_h, mail, db):
    emp_email, sup_name = world.bakery_emp.email, world.bakery_sup.full_name
    r = await client.post(f"{API}/penalties", headers=sup_h, json=_body(world, action="fine", amount_pkr=500))
    assert r.status_code == 201
    p = r.json()
    assert p["action_label"] == "Fine: PKR 500" and p["reason_label"] == "Gloves not worn"
    assert p["severity"] == "high" and p["department"]["code"] == "bakery"
    assert p["employee"]["email"] == emp_email and p["issued_by"]["full_name"] == sup_name
    assert p["email_status"] == "sent" and p["email_sent_at"] is not None
    assert "email_error" not in p

    assert len(mail.sent) == 1
    to, notice = mail.sent[0]
    assert to == emp_email
    assert notice.penalty == "Fine: PKR 500" and notice.severity == "High" and notice.section == "Bakery"
    assert notice.supervisor_name == sup_name and notice.notes == "Seen handling dough without gloves."

    row = await db.scalar(select(AuditLog).where(AuditLog.action == "penalty.issued", AuditLog.entity_id == p["id"]))
    assert row and row.details["action"] == "fine" and row.details["amount_pkr"] == 500
    assert "Seen handling" not in str(row.details)


async def test_penalty_is_kept_when_email_fails_and_can_be_resent(client, world, sup_h, mail, db):
    mail.fail = True
    r = await client.post(f"{API}/penalties", headers=sup_h, json=_body(world))
    assert r.status_code == 201 and r.json()["email_status"] == "failed"
    assert "smtp is down" not in r.text  # delivery errors are not exposed through the API
    pid = r.json()["id"]
    assert (await db.scalar(select(Penalty.email_error).where(Penalty.id == uuid.UUID(pid)))) is not None

    mail.fail = False
    r = await client.post(f"{API}/penalties/{pid}/resend-email", headers=sup_h)
    assert r.status_code == 200 and r.json()["email_status"] == "sent" and len(mail.sent) == 1
    actions = [a.action for a in (await db.scalars(select(AuditLog).where(AuditLog.entity_id == pid))).all()]
    assert "penalty.issued" in actions and "penalty.email_resent" in actions


async def test_without_gmail_credentials_status_is_not_configured(client, world, sup_h):
    # no mail fixture: the real sender runs and SMTP_USER / SMTP_PASSWORD are empty in the test environment
    r = await client.post(f"{API}/penalties", headers=sup_h, json=_body(world))
    assert r.status_code == 201 and r.json()["email_status"] == "not_configured"


# ------------------------------------------------------------------ validation


@pytest.mark.parametrize("over", [
    {"action": "fine"},                                          # fine needs an amount
    {"action": "fine", "amount_pkr": -5},
    {"action": "fine", "amount_pkr": 100, "suspension_days": 2},
    {"action": "suspension"},                                    # suspension needs days
    {"action": "suspension", "suspension_days": 0},
    {"action": "suspension", "suspension_days": 3, "amount_pkr": 100},
    {"action": "verbal_warning", "amount_pkr": 100},             # amount only for fines
    {"severity": "catastrophic"},
    {"reason": "made_up"},
    {"notes": "x" * 1001},
    {"employee_id": "not-a-uuid"},
])
async def test_validation_errors(client, world, sup_h, mail, over):
    r = await client.post(f"{API}/penalties", headers=sup_h, json=_body(world, **over))
    assert r.status_code == 422 and r.json()["code"] == "VALIDATION_ERROR"
    assert mail.sent == []


async def test_suspension_with_days_is_accepted(client, world, sup_h, mail):
    r = await client.post(f"{API}/penalties", headers=sup_h, json=_body(world, action="suspension", suspension_days=3))
    assert r.status_code == 201 and r.json()["action_label"] == "Suspension: 3 days"


async def test_reason_must_fit_the_section(client, world, sup_h, mail):
    r = await client.post(f"{API}/penalties", headers=sup_h, json=_body(world, reason="weapon_not_carried"))
    assert r.status_code == 400 and r.json()["code"] == "INVALID_REASON"
    r = await client.post(f"{API}/penalties", headers=sup_h, json=_body(world, reason="other"))
    assert r.status_code == 201


# ------------------------------------------------------------------ who can be penalised


async def test_cannot_penalise_other_department_or_other_roles(client, world, sup_h, mail):
    for target in (world.meat_emp.id, world.meat_sup.id, world.bakery_sup.id, world.admin.id, uuid.uuid4()):
        r = await client.post(f"{API}/penalties", headers=sup_h, json=_body(world, employee_id=str(target)))
        assert r.status_code == 404, target
    assert mail.sent == []


async def test_cannot_penalise_disabled_or_removed_employee(client, world, sup_h, mail, db):
    emp_id = world.bakery_emp.id
    await db.execute(update(User).where(User.id == emp_id).values(status=UserStatus.disabled))
    await db.commit()
    r = await client.post(f"{API}/penalties", headers=sup_h, json=_body(world))
    assert r.status_code == 400 and r.json()["code"] == "EMPLOYEE_DISABLED"
    await db.execute(update(User).where(User.id == emp_id).values(status=UserStatus.removed))
    await db.commit()
    assert (await client.post(f"{API}/penalties", headers=sup_h, json=_body(world))).status_code == 404


# ------------------------------------------------------------------ RBAC


async def test_role_permissions(client, world, admin_h, sup_h, emp_h, mail):
    body = _body(world)
    # admin and employees cannot issue or list penalties
    for headers in (admin_h, emp_h):
        assert (await client.post(f"{API}/penalties", headers=headers, json=body)).status_code == 403
        assert (await client.get(f"{API}/penalties", headers=headers)).status_code == 403
        assert (await client.get(f"{API}/penalties/{uuid.uuid4()}", headers=headers)).status_code == 403
        assert (await client.post(f"{API}/penalties/{uuid.uuid4()}/resend-email", headers=headers)).status_code == 403
    # "mine" is for employees only
    for headers in (admin_h, sup_h):
        r = await client.get(f"{API}/penalties/mine", headers=headers)
        assert r.status_code == 403 and r.json()["code"] == "FORBIDDEN"
    # unauthenticated
    assert (await client.get(f"{API}/penalties")).status_code == 401
    assert (await client.get(f"{API}/penalties/mine")).status_code == 401


# ------------------------------------------------------------------ listing and isolation


async def _issue(client, headers, **body):
    r = await client.post(f"{API}/penalties", headers=headers, json=body)
    assert r.status_code == 201, r.text
    return r.json()


async def test_supervisors_only_see_their_own_department(client, world, sup_h, mail):
    await _issue(client, sup_h, **_body(world))
    meat_h = await login(client, world.meat_sup)
    meat_p = await _issue(client, meat_h, **_body(world, employee_id=str(world.meat_emp.id)))

    r = await client.get(f"{API}/penalties", headers=sup_h)
    assert r.json()["total"] == 1 and r.json()["items"][0]["department"]["code"] == "bakery"
    r = await client.get(f"{API}/penalties", headers=meat_h)
    assert [p["id"] for p in r.json()["items"]] == [meat_p["id"]]
    # another department's penalty cannot be fetched or re-sent
    assert (await client.get(f"{API}/penalties/{meat_p['id']}", headers=sup_h)).status_code == 404
    assert (await client.post(f"{API}/penalties/{meat_p['id']}/resend-email", headers=sup_h)).status_code == 404


async def test_filters_and_pagination(client, world, sup_h, mail):
    await _issue(client, sup_h, **_body(world, severity="low", action="verbal_warning"))
    await _issue(client, sup_h, **_body(world, severity="critical", action="suspension", suspension_days=2))
    await _issue(client, sup_h, **_body(world, severity="critical", action="written_warning"))

    r = await client.get(f"{API}/penalties", headers=sup_h, params={"severity": "critical"})
    assert r.json()["total"] == 2
    r = await client.get(f"{API}/penalties", headers=sup_h, params={"employee_id": str(world.bakery_emp.id)})
    assert r.json()["total"] == 3
    r = await client.get(f"{API}/penalties", headers=sup_h, params={"search": "bashir"})
    assert r.json()["total"] == 3
    r = await client.get(f"{API}/penalties", headers=sup_h, params={"search": "nobody-by-this-name"})
    assert r.json()["total"] == 0
    r = await client.get(f"{API}/penalties", headers=sup_h, params={"page_size": 2, "page": 2})
    assert len(r.json()["items"]) == 1 and r.json()["total"] == 3
    # newest first
    r = await client.get(f"{API}/penalties", headers=sup_h)
    stamps = [p["created_at"] for p in r.json()["items"]]
    assert stamps == sorted(stamps, reverse=True)
    assert (await client.get(f"{API}/penalties", headers=sup_h, params={"severity": "nope"})).status_code == 422
    assert (await client.get(f"{API}/penalties", headers=sup_h, params={"page": 0})).status_code == 422


async def test_employee_sees_only_their_own_penalties(client, world, sup_h, emp_h, mail, db):
    mine = await _issue(client, sup_h, **_body(world))
    meat_h = await login(client, world.meat_sup)
    await _issue(client, meat_h, **_body(world, employee_id=str(world.meat_emp.id)))

    r = await client.get(f"{API}/penalties/mine", headers=emp_h)
    assert r.status_code == 200 and r.json()["total"] == 1
    assert [p["id"] for p in r.json()["items"]] == [mine["id"]]
    assert "email_error" not in r.text
    # the other employee sees theirs, not this one
    other_h = await login(client, world.meat_emp)
    r = await client.get(f"{API}/penalties/mine", headers=other_h)
    assert r.json()["total"] == 1 and r.json()["items"][0]["id"] != mine["id"]


async def test_employee_with_no_penalties_gets_an_empty_page(client, world, emp_h):
    r = await client.get(f"{API}/penalties/mine", headers=emp_h)
    assert r.status_code == 200 and r.json() == {"items": [], "total": 0, "page": 1, "page_size": 20}


async def test_get_penalty_by_id(client, world, sup_h, mail):
    p = await _issue(client, sup_h, **_body(world))
    r = await client.get(f"{API}/penalties/{p['id']}", headers=sup_h)
    assert r.status_code == 200 and r.json()["id"] == p["id"]
    assert (await client.get(f"{API}/penalties/{uuid.uuid4()}", headers=sup_h)).status_code == 404
    assert (await client.get(f"{API}/penalties/not-a-uuid", headers=sup_h)).status_code == 422
