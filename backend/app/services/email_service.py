import html
import logging
from email.message import EmailMessage

import aiosmtplib

from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_email(to: str, subject: str, text_body: str, html_body: str | None = None) -> None:
    message = EmailMessage()
    message["From"] = settings.SMTP_FROM
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
        timeout=10,
    )


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
    html_body = f"""\
<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:auto;color:#0f172a">
  <h2 style="color:#0B1F3F;margin-bottom:4px">Mall<span style="color:#0B5C75">Sentinel</span></h2>
  <p>Hello {html.escape(full_name)},</p>
  <p>We received a request to reset your MallSentinel password.</p>
  <p style="margin:28px 0">
    <a href="{html.escape(reset_url)}" style="background:#0B1F3F;color:#fff;padding:12px 20px;border-radius:6px;
       text-decoration:none;font-weight:600">Reset password</a>
  </p>
  <p style="font-size:13px;color:#475569">This link is valid for {minutes} minutes and can be used once.
  If you did not request this, you can ignore this email.</p>
</div>"""
    try:
        await send_email(to, "Reset your MallSentinel password", text_body, html_body)
    except Exception:  # noqa: BLE001 - email failure must not leak whether the account exists
        logger.exception("Failed to send password reset email")
