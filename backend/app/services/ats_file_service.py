"""
ATS File & Resume Service.

Handles:
1. PDF validation (magic byte %PDF- check + 2MB size limit check).
2. Lossless / stream compression using pypdf.
3. Private upload to ImageKit (isPrivateFile=True).
4. Short-lived signed URL generation (5 mins expiry) or local fallback.
"""

import base64
import hashlib
import hmac
import io
import os
import re
import time
import uuid
import httpx
from pypdf import PdfReader, PdfWriter

from app.config import get_settings

settings = get_settings()

MAX_RESUME_SIZE_BYTES = 2 * 1024 * 1024  # 2 MB limit


def validate_pdf_content(file_bytes: bytes) -> tuple[bool, str | None]:
    """
    Validates that:
    1. Size is within MAX_RESUME_SIZE_BYTES.
    2. Real file format starts with '%PDF-'.
    """
    if not file_bytes:
        return False, "File is empty."

    if len(file_bytes) > MAX_RESUME_SIZE_BYTES:
        max_mb = MAX_RESUME_SIZE_BYTES / (1024 * 1024)
        return False, f"File size exceeds maximum allowed limit of {max_mb:.0f}MB."

    # Check magic bytes for PDF
    if not file_bytes.startswith(b"%PDF-"):
        return False, "Invalid file format. Only legitimate PDF documents are accepted."

    return True, None


def compress_pdf_bytes(file_bytes: bytes) -> bytes:
    """
    Compresses PDF streams in-memory using pypdf.
    If compression results in smaller size, returns compressed bytes.
    Otherwise returns original bytes safely.
    """
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        writer = PdfWriter()
        for page in reader.pages:
            page.compress_content_streams()
            writer.add_page(page)

        buf = io.BytesIO()
        writer.write(buf)
        compressed = buf.getvalue()

        if 0 < len(compressed) < len(file_bytes):
            return compressed
        return file_bytes
    except Exception:
        # Fallback to original bytes if compression fails
        return file_bytes


def _get_imagekit_credentials():
    private_key = settings.IMAGEKIT_PRIVATE_KEY or os.environ.get("IMAGEKIT_PRIVATE_KEY", "")
    public_key = (
        settings.IMAGEKIT_PUBLIC_KEY
        or settings.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY
        or os.environ.get("NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY", "")
    )
    url_endpoint = (
        settings.IMAGEKIT_URL_ENDPOINT
        or settings.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT
        or os.environ.get("NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT", "https://ik.imagekit.io/njhzvqrx2")
    )
    return private_key, public_key, url_endpoint.rstrip("/")


async def upload_resume_to_imagekit(
    file_bytes: bytes,
    original_filename: str,
    tenant_id: str | uuid.UUID,
) -> dict:
    """
    Uploads compressed resume as private file to ImageKit:
    Returns dict: {"file_id": ..., "file_path": ..., "file_name": ...}
    Falls back to safe local storage if ImageKit API is unavailable.
    """
    sanitized_name = re.sub(r"[^a-zA-Z0-9_.-]", "_", original_filename or "resume.pdf")
    if not sanitized_name.lower().endswith(".pdf"):
        sanitized_name += ".pdf"

    unique_filename = f"{uuid.uuid4().hex[:8]}_{sanitized_name}"
    folder_path = f"/resumes/{tenant_id}"

    private_key, public_key, url_endpoint = _get_imagekit_credentials()

    if private_key:
        try:
            b64_content = base64.b64encode(file_bytes).decode("utf-8")
            data = {
                "file": b64_content,
                "fileName": unique_filename,
                "folder": folder_path,
                "isPrivateFile": "true",
                "useUniqueFileName": "false",
            }
            auth = (private_key, "")
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(
                    "https://upload.imagekit.io/api/v1/files/upload",
                    data=data,
                    auth=auth,
                )
                if res.status_code in (200, 201):
                    json_data = res.json()
                    return {
                        "file_id": json_data.get("fileId"),
                        "file_path": json_data.get("filePath"),
                        "file_name": sanitized_name,
                    }
        except Exception as e:
            # Fallback to local storage if network or credentials fail
            pass

    # Local fallback for development / offline environments
    local_dir = os.path.join("uploads", "resumes", str(tenant_id))
    os.makedirs(local_dir, exist_ok=True)
    local_file_path = os.path.join(local_dir, unique_filename)
    with open(local_file_path, "wb") as f:
        f.write(file_bytes)

    return {
        "file_id": f"local_{uuid.uuid4().hex}",
        "file_path": f"/uploads/resumes/{tenant_id}/{unique_filename}",
        "file_name": sanitized_name,
    }


def generate_signed_resume_url(file_path: str, expiry_seconds: int = 300) -> str:
    """
    Generates short-lived signed ImageKit URL (default 5 minutes).
    URL is created using HMAC-SHA1 signature.
    """
    private_key, public_key, url_endpoint = _get_imagekit_credentials()
    clean_path = file_path.lstrip("/")

    if file_path.startswith("/uploads/") or file_path.startswith("uploads/"):
        return f"/api/ats/applications/resume-file?path={file_path}"

    if not private_key:
        return f"{url_endpoint}/{clean_path}"

    expiry_timestamp = int(time.time()) + expiry_seconds
    string_to_sign = f"{clean_path}{expiry_timestamp}"
    signature = hmac.new(
        private_key.encode("utf-8"),
        string_to_sign.encode("utf-8"),
        hashlib.sha1,
    ).hexdigest()

    return f"{url_endpoint}/{clean_path}?ik-t={expiry_timestamp}&ik-s={signature}"
