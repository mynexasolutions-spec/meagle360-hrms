"""
Subdomain slug generation for company tenant onboarding.

Converts a company name into a DNS-safe, unique subdomain label used as
{slug}.meagle360.com — enforces the 63-char DNS label limit and avoids
collisions with existing companies or reserved words.
"""

import re
from sqlalchemy.orm import Session
from app.models.company import Company

# Subdomains that must never be assigned to a tenant company, since they
# are reserved for platform-level routing (marketing site, API, admin panel).
RESERVED_SUBDOMAINS = {
    "www", "api", "admin", "app", "mail", "static",
    "platform", "hrms", "support", "blog", "cdn", "assets",
}

# DNS label hard limit is 63 chars. We cap generation lower than that so
# there's room left for a numeric collision suffix like "-23" if needed.
MAX_BASE_LENGTH = 50


def slugify(text: str) -> str:
    """Lowercase, replace non-alphanumeric runs with a single hyphen,
    and strip leading/trailing hyphens."""
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def generate_unique_subdomain(company_name: str, db: Session) -> str:
    base_slug = slugify(company_name)

    if not base_slug:
        base_slug = "company"

    if len(base_slug) > MAX_BASE_LENGTH:
        base_slug = base_slug[:MAX_BASE_LENGTH].rstrip("-")

    if base_slug in RESERVED_SUBDOMAINS:
        base_slug = f"{base_slug}-hrms"

    slug = base_slug
    counter = 1
    while db.query(Company).filter(Company.subdomain == slug).first():
        counter += 1
        slug = f"{base_slug}-{counter}"

    return slug