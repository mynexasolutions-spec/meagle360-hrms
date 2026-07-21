"""
Email service — sends invite links over SMTP.

Uses Python's built-in smtplib rather than a third-party provider since none
is wired up yet; swapping to a transactional email API later only means
replacing send_email()'s internals, callers don't change.
"""

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formatdate, make_msgid

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def send_email(to_email: str, subject: str, text_body: str, html_body: str) -> None:
    """Send a multipart (plain text + HTML) email over SMTP. Raises on
    failure — callers decide whether a failed send should block the
    calling operation.

    Sends both a plain-text and an HTML part, and sets Message-ID/Date/
    Reply-To — a text-only-HTML message with none of the standard headers
    smtplib doesn't add automatically is a common spam-filter signal, so
    these are here to make the message look like normal mail rather than
    a bare automated blast (the bigger lever — SPF/DKIM/DMARC on the
    sending domain — lives in DNS, not here)."""
    if not settings.SMTP_HOST or not settings.SMTP_USER:
        raise RuntimeError("SMTP is not configured (SMTP_HOST/SMTP_USER missing)")

    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
    message["To"] = to_email
    message["Reply-To"] = settings.SMTP_FROM_EMAIL
    message["Date"] = formatdate(localtime=True)
    message["Message-ID"] = make_msgid(domain=settings.SMTP_FROM_EMAIL.split("@")[-1])
    # Plain text first, HTML second: multipart/alternative renders the LAST
    # part a client understands, so this order lets plain-text-only clients
    # fall back gracefully while everyone else gets the styled version.
    message.attach(MIMEText(text_body, "plain"))
    message.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(settings.SMTP_FROM_EMAIL, [to_email], message.as_string())


def send_invite_email(to_email: str, full_name: str, invite_token: str) -> None:
    """Send a new-account setup link to a newly invited employee or company admin."""
    base_url = (settings.APP_BASE_URL or "http://localhost:5173").rstrip("/")
    setup_link = f"{base_url}/set-password?token={invite_token}"
    monogram = "".join(w[0] for w in settings.SMTP_FROM_NAME.split()[:2]).upper() or "M"

    text_body = (
        f"Hi {full_name},\n\n"
        f"An account has been created for you on {settings.SMTP_FROM_NAME}. "
        f"Open the link below to set your password and get started. "
        f"This link expires in 48 hours.\n\n"
        f"{setup_link}\n\n"
        f"If you weren't expecting this, you can safely ignore this email."
    )

    # Table-based layout with inline styles throughout — this is an email,
    # not a web page: Outlook desktop renders with Word's engine and ignores
    # flexbox/grid entirely, so tables are the only reliably portable layout.
    html_body = f"""\
<!DOCTYPE html>
<html>
<body style="margin:0; padding:0; background-color:#f1f5f9; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px; width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #e2e8f0;">
          <!-- Accent bar -->
          <tr>
            <td style="height:5px; background-color:#2563eb; font-size:0; line-height:0;">&nbsp;</td>
          </tr>
          <!-- Header -->
          <tr>
            <td style="padding:40px 40px 8px 40px; text-align:center;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 22px auto;">
                <tr>
                  <td width="60" height="60" align="center" valign="middle" bgcolor="#2563eb"
                      style="width:60px; height:60px; border-radius:18px; background-color:#2563eb; background-image:linear-gradient(135deg,#2563eb,#1d4ed8);">
                    <span style="display:block; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; font-size:22px; font-weight:800; color:#ffffff; letter-spacing:0.5px;">{monogram}</span>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px 0; font-size:11px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:#2563eb;">Account Invitation</p>
              <h1 style="margin:0; font-size:22px; font-weight:800; color:#0f172a;">Welcome to {settings.SMTP_FROM_NAME}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:20px 40px 4px 40px;">
              <p style="margin:0 0 16px 0; color:#334155; font-size:15px; line-height:1.6;">Hi {full_name},</p>
              <p style="margin:0 0 28px 0; color:#334155; font-size:15px; line-height:1.6;">
                An account has been created for you. Click the button below to set your
                password and get started. This link expires in <strong>48 hours</strong>.
              </p>
            </td>
          </tr>
          <!-- CTA button -->
          <tr>
            <td align="center" style="padding:0 40px 32px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="border-radius:10px; background-color:#2563eb;">
                    <a href="{setup_link}"
                       style="display:inline-block; padding:14px 32px; font-size:15px; font-weight:700;
                              color:#ffffff; text-decoration:none; border-radius:10px;">
                      Set Your Password
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Fallback link -->
          <tr>
            <td style="padding:0 40px 32px 40px; border-top:1px solid #f1f5f9; padding-top:24px;">
              <p style="margin:0 0 6px 0; color:#94a3b8; font-size:12px;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:0; word-break:break-all;">
                <a href="{setup_link}" style="color:#2563eb; font-size:12px;">{setup_link}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 28px 40px; background-color:#f8fafc; border-top:1px solid #e2e8f0;">
              <p style="margin:0; color:#94a3b8; font-size:12px; line-height:1.6; text-align:center;">
                If you weren't expecting this, you can safely ignore this email.<br>
                &copy; {settings.SMTP_FROM_NAME}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""
    send_email(to_email, f"Set up your {settings.SMTP_FROM_NAME} account", text_body, html_body)


def try_send_invite_email(to_email: str, full_name: str, invite_token: str) -> bool:
    """Best-effort send — invite creation already committed to the database by
    the time this runs, so an SMTP hiccup shouldn't fail the whole request.
    Returns whether it actually went out, so the caller can fall back to
    showing the link for manual sharing."""
    try:
        send_invite_email(to_email, full_name, invite_token)
        return True
    except Exception:
        logger.exception("Failed to send invite email to %s", to_email)
        return False
