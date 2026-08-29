"""CloudinaryService - uploads Company branding images (logo, signature)
to Cloudinary and returns a public URL. Cloudinary is configured lazily
on first use so a missing/blank .env doesn't crash app startup - it only
fails when someone actually tries to upload."""

import cloudinary
import cloudinary.uploader

from app.config import get_settings

_configured = False


def _ensure_configured() -> None:
    global _configured
    if _configured:
        return
    settings = get_settings()
    if not (settings.CLOUDINARY_CLOUD_NAME and settings.CLOUDINARY_API_KEY and settings.CLOUDINARY_API_SECRET):
        raise RuntimeError(
            "Cloudinary is not configured - set CLOUDINARY_CLOUD_NAME, "
            "CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env"
        )
    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True,
    )
    _configured = True


def upload_branding_image(file_bytes: bytes, company_id: str, image_type: str) -> str:
    """image_type: 'logo' or 'signature'. Returns the public HTTPS URL.
    Re-uploading with the same image_type overwrites the previous image
    (same public_id), so old branding images don't pile up in the account."""
    _ensure_configured()
    result = cloudinary.uploader.upload(
        file_bytes,
        folder=f"meagle360/company_branding/{company_id}",
        public_id=image_type,
        overwrite=True,
        resource_type="image",
    )
    return result["secure_url"]
