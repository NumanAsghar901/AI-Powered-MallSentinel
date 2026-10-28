import html
import logging
from dataclasses import dataclass
from datetime import datetime
from email.message import EmailMessage

import aiosmtplib

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailNotConfigured(RuntimeError):
    """SMTP_USER / SMTP_PASSWORD are not set, so nothing can be sent."""


async def send_email(to: str, subject: str, text_body: str, html_body: str | None = None) -> None:
    if not settings.smtp_configured:
        raise EmailNotConfigured("SMTP_USER and SMTP_PASSWORD are not set in backend/.env")
    message = EmailMessage()
    message["From"] = settings.mail_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text_body)
    if html_body:
        message.add_alternative(html_body, subtype="html")

    await aiosmtplib.send(
        message,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER,
        password=settings.SMTP_PASSWORD,
        start_tls=settings.SMTP_STARTTLS,
        timeout=15,
    )


def _shell(inner: str) -> str:
    return f"""\
<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:auto;color:#0f172a">
  <h2 style="color:#0B1F3F;margin-bottom:4px">Mall<span style="color:#0B5C75">Sentinel</span></h2>
  {inner}
  <p style="font-size:12px;color:#64748b;margin-top:28px">This message was sent automatically by MallSentinel.</p>
</div>"""


async def send_password_reset(to: str, full_name: str, reset_url: str) -> None:
    minutes = settings.PASSWORD_RESET_EXPIRE_MINUTES
    text_body = (
        f"Hello {full_name},\n\n"
        "We received a request to reset your MallSentinel password.\n"
        f"Open this link to choose a new password (valid for {minutes} minutes, single use):\n\n"
        f"{reset_url}\n\n"
        "If you did not request this, you can ignore this email. Your password will not change.\n\n"
        "— MallSentinel"
    )
    html_body = _shell(
        f"""
  <p>Hello {html.escape(full_name)},</p>
  <p>We received a request to reset your MallSentinel password.</p>
  <p style="margin:28px 0">
    <a href="{html.escape(reset_url)}" style="background:#0B1F3F;color:#fff;padding:12px 20px;border-radius:6px;
       text-decoration:none;font-weight:600">Reset password</a>
  </p>
  <p style="font-size:13px;color:#475569">This link is valid for {minutes} minutes and can be used once.
  If you did not request this, you can ignore this email.</p>"""
    )
    try:
        await send_email(to, "Reset your MallSentinel password", text_body, html_body)
    except Exception:  # noqa: BLE001 - email failure must not leak whether the account exists
        logger.exception("Failed to send password reset email")


@dataclass
class PenaltyNotice:
    employee_name: str
    supervisor_name: str
    section: str
    reason: str
    severity: str
    penalty: str
    notes: str | None
    issued_at: datetime


async def send_penalty_notice(to: str, n: PenaltyNotice) -> None:
    """Raises on failure; the caller records the outcome on the penalty."""
    when = n.issued_at.strftime("%d %b %Y, %H:%M")
    text_lines = [
        f"Hello {n.employee_name},",
        "",
        f"A penalty has been issued to you by your supervisor, {n.supervisor_name} ({n.section}).",
        "",
        f"  Reason:    {n.reason}",
        f"  Severity:  {n.severity}",
        f"  Penalty:   {n.penalty}",
        f"  Date:      {when}",
    ]
    if n.notes:
        text_lines += ["", "Supervisor's notes:", n.notes]
    text_lines += ["", "If you have questions, please speak to your supervisor.", "", "— MallSentinel"]

    rows = [
        ("Reason", n.reason),
        ("Severity", n.severity),
        ("Penalty", n.penalty),
        ("Date", when),
        ("Issued by", f"{n.supervisor_name} ({n.section})"),
    ]
    table = "".join(
        f'<tr><td style="padding:6px 12px 6px 0;color:#64748b">{html.escape(k)}</td>'
        f'<td style="padding:6px 0;font-weight:600">{html.escape(v)}</td></tr>'
        for k, v in rows
    )
    notes_html = (
        f'<p style="background:#f1f5f9;border-radius:6px;padding:12px;white-space:pre-wrap">{html.escape(n.notes)}</p>'
        if n.notes
        else ""
    )
    html_body = _shell(
        f"""
  <p>Hello {html.escape(n.employee_name)},</p>
  <p>A penalty has been issued to you by your supervisor.</p>
  <table style="border-collapse:collapse;margin:16px 0">{table}</table>
  {notes_html}
  <p style="font-size:13px;color:#475569">If you have questions, please speak to your supervisor.</p>"""
    )
    await send_email(to, f"MallSentinel: penalty issued ({n.penalty})", "\n".join(text_lines), html_body)
