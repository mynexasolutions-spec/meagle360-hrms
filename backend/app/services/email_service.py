"""
Email service — sends invite links over SMTP.

Uses Python's built-in smtplib rather than a third-party provider since none
is wired up yet; swapping to a transactional email API later only means
replacing send_email()'s internals, callers don't change.
"""

import logging

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def send_email(to_email: str, subject: str, text_body: str, html_body: str) -> None:
    """Send a transactional email via the Brevo HTTP API. Raises on failure —
    callers decide whether a failed send should block the calling operation.

    Uses HTTPS (port 443) rather than SMTP ports (587/465), which some VPS
    hosting providers block by default — this avoids that class of failure
    entirely, at the cost of being Brevo-specific rather than a swappable
    standard protocol.
    """
    if not settings.BREVO_API_KEY or not settings.BREVO_SENDER_EMAIL:
        raise RuntimeError("Brevo is not configured (BREVO_API_KEY/BREVO_SENDER_EMAIL missing)")

    payload = {
        "sender": {
            "name": settings.BREVO_SENDER_NAME,
            "email": settings.BREVO_SENDER_EMAIL,
        },
        "to": [{"email": to_email}],
        "subject": subject,
        "textContent": text_body,
        "htmlContent": html_body,
    }
    headers = {
        "api-key": settings.BREVO_API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    response = httpx.post(
        "https://api.brevo.com/v3/smtp/email",
        json=payload,
        headers=headers,
        timeout=10.0,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Brevo send failed ({response.status_code}): {response.text}")


def send_invite_email(to_email: str, full_name: str, invite_token: str) -> None:
    """Send a new-account setup link to a newly invited employee or company admin."""
    base_url = (settings.APP_BASE_URL or "http://localhost:5173").rstrip("/")
    setup_link = f"{base_url}/set-password?token={invite_token}"
    monogram = "".join(w[0] for w in settings.BREVO_SENDER_NAME.split()[:2]).upper() or "M"

    text_body = (
        f"Hi {full_name},\n\n"
        f"An account has been created for you on {settings.BREVO_SENDER_NAME}. "
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
              <h1 style="margin:0; font-size:22px; font-weight:800; color:#0f172a;">Welcome to {settings.BREVO_SENDER_NAME}</h1>
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
                &copy; {settings.BREVO_SENDER_NAME}
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
    send_email(to_email, f"Set up your {settings.BREVO_SENDER_NAME} account", text_body, html_body)


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
