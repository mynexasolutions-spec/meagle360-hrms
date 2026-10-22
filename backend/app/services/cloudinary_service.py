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


def upload_face_reference_photo(file_bytes: bytes, company_id: str, employee_id: str) -> str:
    """Uploads approved/pending employee passport reference photo to Cloudinary.
    Overwrites previous photo for the same employee so storage is bounded."""
    _ensure_configured()
    result = cloudinary.uploader.upload(
        file_bytes,
        folder=f"meagle360/face_profiles/{company_id}",
        public_id=f"face_{employee_id}",
        overwrite=True,
        resource_type="image",
    )
    return result["secure_url"]


def delete_face_reference_photo(company_id: str, employee_id: str) -> None:
    """Deletes employee passport reference photo from Cloudinary when deactivated/removed."""
    _ensure_configured()
    try:
        cloudinary.uploader.destroy(
            f"meagle360/face_profiles/{company_id}/face_{employee_id}",
            resource_type="image",
        )
    except Exception:
        pass


