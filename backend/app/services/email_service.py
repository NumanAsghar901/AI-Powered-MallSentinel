import html
import logging
from dataclasses import dataclass
from datetime import datetime
from email.message import EmailMessage
from email.utils import formatdate, make_msgid

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
    message["Date"] = formatdate(localtime=True)
    message["Message-ID"] = make_msgid(domain="gmail.com")
    message["Reply-To"] = settings.mail_from
    message["X-Mailer"] = "MallSentinel Compliance Notification Engine"
    message["MIME-Version"] = "1.0"
    message["Auto-Submitted"] = "auto-generated"

    message.set_content(text_body)
    if html_body:
        message.add_alternative(html_body, subtype="html")

    await aiosmtplib.send(
        message,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER,
        password=settings.SMTP_PASSWORD.replace(" ", "") if settings.SMTP_PASSWORD else None,
        sender=settings.SMTP_USER,
        recipients=[to],
        start_tls=settings.SMTP_STARTTLS,
        timeout=15,
    )


def _shell(inner: str) -> str:
    return f"""\
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @media only screen and (max-width: 640px) {{
      .email-outer {{ padding: 12px 8px !important; }}
      .email-container {{ width: 100% !important; border-radius: 10px !important; }}
      .email-inner {{ padding: 20px 16px !important; }}
      .brand-header {{ padding: 18px 16px !important; }}
    }}
  </style>
</head>
<body style="margin:0;padding:0;background-color:#0b0f19;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;line-height:1.6;">
  <div class="email-outer" style="background-color:#0b0f19;padding:36px 20px;min-height:100vh;">
    <div class="email-container" style="max-width:860px;width:100%;margin:0 auto;background:#131b2e;border:1px solid #1e293b;border-radius:16px;overflow:hidden;box-shadow:0 16px 40px -10px rgba(0,0,0,0.7);">
      
      <!-- Brand Header -->
      <div class="brand-header" style="background:linear-gradient(135deg, #07172f 0%, #0c334e 55%, #0891b2 100%);padding:26px 36px;border-bottom:2px solid #38bdf8;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td>
              <span style="font-size:28px;font-weight:900;letter-spacing:-0.5px;color:#ffffff;text-shadow:0 2px 4px rgba(0,0,0,0.4);">
                Mall<span style="color:#38bdf8;">Sentinel</span>
              </span>
              <div style="font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#bae6fd;margin-top:2px;">
                AI-Powered CCTV Surveillance & Workforce Compliance
              </div>
            </td>
            <td style="text-align:right;">
              <span style="background:rgba(56,189,248,0.15);border:1px solid rgba(56,189,248,0.4);color:#38bdf8;padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;white-space:nowrap;">
                Official Notice
              </span>
            </td>
          </tr>
        </table>
      </div>

      <!-- Inner Body -->
      <div class="email-inner" style="padding:32px 36px 28px;">
        {inner}
      </div>

      <!-- Professional Footer -->
      <div style="background:#090d16;padding:22px 36px;border-top:1px solid #1e293b;text-align:center;">
        <p style="margin:0 0 6px;font-size:12px;color:#94a3b8;font-weight:600;">
          MallSentinel AI Vision & Workforce Compliance Platform
        </p>
        <p style="margin:0;font-size:11px;color:#64748b;">
          This message was generated automatically and recorded in the audit log.
        </p>
      </div>

    </div>
  </div>
</body>
</html>"""


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
    evidence_image_url: str | None = None
    evidence_camera: str | None = None
    evidence_location: str | None = None
    evidence_violation: str | None = None


async def send_penalty_notice(to: str, n: PenaltyNotice) -> None:
    """Raises on failure; the caller records the outcome on the penalty."""
    when = n.issued_at.strftime("%d %b %Y, %H:%M PKT")

    text_lines = [
        f"Dear {n.employee_name},",
        "",
        f"This is an official compliance notice from your department supervisor, {n.supervisor_name} ({n.section}).",
        "",
        "SUMMARY OF COMPLIANCE RECORD:",
        f"  • Employee:          {n.employee_name}",
        f"  • Department:        {n.section}",
        f"  • Violation Reason:  {n.reason}",
        f"  • Severity Level:    {n.severity.upper()}",
        f"  • Action Taken:      {n.penalty}",
        f"  • Date & Time:       {when}",
        f"  • Issued By:         {n.supervisor_name} ({n.section})",
    ]
    if n.evidence_camera:
        text_lines += [
            f"  • CCTV Camera:       {n.evidence_camera} ({n.evidence_location or 'Department Section'})",
            f"  • Detection Frame:   {n.evidence_image_url or 'Archived in CCTV system'}",
        ]
    if n.notes:
        text_lines += [
            "",
            "SUPERVISOR INSTRUCTIONS & NOTES:",
            f'  "{n.notes}"',
        ]
    text_lines += [
        "",
        "If you believe this record was issued in error, please consult your department supervisor within 48 hours.",
        "",
        "Regards,",
        "MallSentinel Compliance Management",
        "AI-Powered CCTV Surveillance & Workforce Platform",
    ]

    sev_lower = n.severity.lower()
    if "critical" in sev_lower:
        sev_bg, sev_border, sev_color = "#450a0a", "#dc2626", "#fca5a5"
    elif "high" in sev_lower:
        sev_bg, sev_border, sev_color = "#431407", "#ea580c", "#fdba74"
    elif "medium" in sev_lower:
        sev_bg, sev_border, sev_color = "#422006", "#d97706", "#fde047"
    else:
        sev_bg, sev_border, sev_color = "#082f49", "#0284c7", "#7dd3fc"

    rows = [
        ("Employee", html.escape(n.employee_name)),
        ("Department", html.escape(n.section)),
        ("Violation Reason", f'<strong style="color:#ffffff;">{html.escape(n.reason)}</strong>'),
        ("Severity", f'<span style="background:{sev_bg};border:1px solid {sev_border};color:{sev_color};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;text-transform:uppercase;">{html.escape(n.severity)}</span>'),
        ("Penalty Action", f'<strong style="color:#38bdf8;">{html.escape(n.penalty)}</strong>'),
        ("Date & Time", html.escape(when)),
        ("Issued By", f"{html.escape(n.supervisor_name)} ({html.escape(n.section)})"),
    ]

    table_rows = "".join(
        f'<tr style="border-bottom:1px solid #1e293b;">'
        f'<td style="padding:12px 18px;color:#94a3b8;font-size:13px;font-weight:500;width:28%;">{k}</td>'
        f'<td style="padding:12px 18px;color:#e2e8f0;font-size:13px;">{v}</td>'
        f'</tr>'
        for k, v in rows
    )

    evidence_html = ""
    if n.evidence_image_url:
        evidence_html = f"""
        <div style="margin:24px 0 18px;background:#090d16;border:1px solid #1e293b;border-radius:12px;overflow:hidden;">
          <div style="background:#162032;padding:12px 18px;border-bottom:1px solid #1e293b;">
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="font-size:12px;font-weight:700;color:#38bdf8;text-transform:uppercase;letter-spacing:0.5px;">
                  ● CCTV Detection Evidence Snapshot
                </td>
                <td style="text-align:right;font-size:11px;color:#94a3b8;font-family:monospace;">
                  {html.escape(n.evidence_camera or "CAM")} • {html.escape(n.evidence_location or "")}
                </td>
              </tr>
            </table>
          </div>
          <div style="padding:14px;background:#050810;text-align:center;">
            <img src="{html.escape(n.evidence_image_url)}" alt="CCTV Incident Evidence" style="width:100%;max-width:100%;height:auto;border-radius:8px;display:block;margin:0 auto;border:1px solid #334155;" />
          </div>
          <div style="padding:10px 18px;background:#0d1525;font-size:12px;color:#94a3b8;text-align:center;border-top:1px solid #1e293b;">
            Incident Violation: <strong style="color:#ef4444;">{html.escape(n.evidence_violation or n.reason)}</strong> | Automated Detection Record
          </div>
        </div>"""

    notes_html = ""
    if n.notes:
        notes_html = f"""
        <div style="margin:20px 0;background:rgba(56,189,248,0.06);border-left:4px solid #38bdf8;border-radius:0 8px 8px 0;padding:14px 18px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#38bdf8;margin-bottom:6px;">Supervisor Notes & Instructions:</div>
          <div style="font-size:13px;color:#cbd5e1;white-space:pre-wrap;font-style:italic;">"{html.escape(n.notes)}"</div>
        </div>"""

    inner_html = f"""
      <h3 style="margin:0 0 12px;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">
        Compliance Penalty Notice
      </h3>
      <p style="margin:0 0 18px;color:#cbd5e1;font-size:14px;line-height:1.6;">
        Dear <strong>{html.escape(n.employee_name)}</strong>,<br>
        A disciplinary compliance penalty has been formally issued to your account by your supervisor.
      </p>

      <table style="width:100%;border-collapse:collapse;background:#0f172a;border-radius:10px;overflow:hidden;border:1px solid #1e293b;margin:18px 0;">
        {table_rows}
      </table>

      {evidence_html}

      {notes_html}

      <div style="margin-top:20px;padding:12px 14px;background:rgba(148,163,184,0.08);border-radius:8px;font-size:12px;color:#94a3b8;">
        If you have questions or believe this was issued in error, please consult your department supervisor within 48 hours.
      </div>"""

    html_body = _shell(inner_html)
    await send_email(to, f"MallSentinel Notice: Penalty Issued ({n.penalty})", "\n".join(text_lines), html_body)
