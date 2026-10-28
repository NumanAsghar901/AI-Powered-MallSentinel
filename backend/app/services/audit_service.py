"""Tamper-evident audit ledger.

Each row stores `prev_hash` and `hash = sha256(prev_hash + canonical_json(row))`. Appends take a
transaction-scoped advisory lock so concurrent writers cannot fork the chain. A DB trigger
(migration 0001) rejects UPDATE, DELETE and TRUNCATE on the table.
"""

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import utcnow
from app.models import AuditLog, User

GENESIS_HASH = "0" * 64
_LOCK_KEY = 0x4D53_4155  # "MSAU"


class AuditAction:
    LOGIN_SUCCESS = "auth.login_success"
    LOGIN_FAILED = "auth.login_failed"
    LOGIN_BLOCKED = "auth.login_blocked"
    ACCOUNT_LOCKED = "auth.account_locked"
    LOGOUT = "auth.logout"
    REFRESH_REUSE = "auth.refresh_token_reuse"
    PASSWORD_RESET_REQUESTED = "auth.password_reset_requested"
    PASSWORD_RESET_COMPLETED = "auth.password_reset_completed"
    USER_CREATED = "user.created"
    USER_UPDATED = "user.updated"
    USER_ROLE_CHANGED = "user.role_changed"
    USER_DISABLED = "user.disabled"
    USER_ENABLED = "user.enabled"
    USER_UNLOCKED = "user.unlocked"
    USER_REMOVED = "user.removed"
    PENALTY_ISSUED = "penalty.issued"
    PENALTY_EMAIL_RESENT = "penalty.email_resent"


def _canonical(
    *,
    occurred_at: datetime,
    actor_user_id: uuid.UUID | None,
    actor_email: str | None,
    action: str,
    entity_type: str | None,
    entity_id: str | None,
    details: dict[str, Any],
    ip: str | None,
    prev_hash: str,
) -> str:
    body = {
        "occurred_at": occurred_at.isoformat(),
        "actor_user_id": str(actor_user_id) if actor_user_id else None,
        "actor_email": actor_email,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "details": details,
        "ip": ip,
        "prev_hash": prev_hash,
    }
    return json.dumps(body, sort_keys=True, separators=(",", ":"), default=str)


def compute_hash(prev_hash: str, canonical: str) -> str:
    return hashlib.sha256((prev_hash + canonical).encode()).hexdigest()


async def record(
    db: AsyncSession,
    action: str,
    *,
    actor: User | None = None,
    actor_email: str | None = None,
    entity_type: str | None = None,
    entity_id: str | uuid.UUID | None = None,
    details: dict[str, Any] | None = None,
    ip: str | None = None,
) -> AuditLog:
    """Append a ledger row. Caller owns the transaction (commit happens with the business change)."""
    await db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _LOCK_KEY})
    prev = await db.scalar(select(AuditLog.hash).order_by(AuditLog.id.desc()).limit(1))
    prev_hash = prev or GENESIS_HASH

    # JSONB round-trips through Python types; normalise now so the hash is reproducible.
    clean_details = json.loads(json.dumps(details or {}, default=str))
    fields = dict(
        occurred_at=utcnow(),
        actor_user_id=actor.id if actor else None,
        actor_email=actor.email if actor else actor_email,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        details=clean_details,
        ip=ip,
    )
    row_hash = compute_hash(prev_hash, _canonical(**fields, prev_hash=prev_hash))
    entry = AuditLog(**fields, prev_hash=prev_hash, hash=row_hash)
    db.add(entry)
    await db.flush()
    return entry


@dataclass
class ChainVerification:
    ok: bool
    checked: int
    broken_at_id: int | None = None


async def verify_chain(db: AsyncSession) -> ChainVerification:
    rows = (await db.scalars(select(AuditLog).order_by(AuditLog.id))).all()
    prev_hash = GENESIS_HASH
    for row in rows:
        expected = compute_hash(
            prev_hash,
            _canonical(
                occurred_at=row.occurred_at,
                actor_user_id=row.actor_user_id,
                actor_email=row.actor_email,
                action=row.action,
                entity_type=row.entity_type,
                entity_id=row.entity_id,
                details=row.details,
                ip=row.ip,
                prev_hash=row.prev_hash,
            ),
        )
        if row.prev_hash != prev_hash or row.hash != expected:
            return ChainVerification(ok=False, checked=len(rows), broken_at_id=row.id)
        prev_hash = row.hash
    return ChainVerification(ok=True, checked=len(rows))
