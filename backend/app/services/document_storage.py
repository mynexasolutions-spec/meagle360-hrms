"""Private ImageKit storage for employee documents (ID proofs).

Only the backend ever sees an ImageKit link. There is no local or public
fallback: when ImageKit fails, the caller gets a StorageError.
"""

import hashlib
import hmac
import logging
import time
import uuid

import httpx

from app.services.ats_file_service import _get_imagekit_credentials

logger = logging.getLogger(__name__)

UPLOAD_URL = "https://upload.imagekit.io/api/v1/files/upload"
API_URL = "https://api.imagekit.io/v1"
ROOT = "/employee-documents"
LINK_SECONDS = 60
TIMEOUT = 30.0
EXTENSIONS = {"application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png"}


class StorageError(Exception):
    pass


def _credentials() -> tuple[str, str]:
    private_key, _, endpoint = _get_imagekit_credentials()
    if not (private_key and endpoint):
        raise StorageError("ImageKit is not configured")
    return private_key, endpoint


def _request(method: str, url: str, **kwargs) -> httpx.Response:
    try:
        with httpx.Client(timeout=TIMEOUT) as client:
            res = client.request(method, url, **kwargs)
    except httpx.HTTPError as e:
        raise StorageError(f"ImageKit is unreachable ({type(e).__name__})") from e
    if res.status_code >= 300:
        raise StorageError(f"ImageKit answered {res.status_code}")
    return res


def folder(company_id, employee_id=None) -> str:
    path = f"{ROOT}/{uuid.UUID(str(company_id))}"
    return f"{path}/{uuid.UUID(str(employee_id))}" if employee_id else path


def save(company_id, employee_id, content: bytes, content_type: str, subfolder: str | None = None) -> tuple[str, str]:
    """Store a private file. Returns (file id, path).

    `subfolder` sits inside the employee's folder (e.g. "receipts"), so
    remove_folder still cleans it up with the employee or company."""
    private_key, _ = _credentials()
    # The employee's own file name stays in our database.
    name = f"{uuid.uuid4().hex}.{EXTENSIONS[content_type]}"
    target = folder(company_id, employee_id) + (f"/{subfolder}" if subfolder else "")
    path = f"{target}/{name}"
    res = _request(
        "POST", UPLOAD_URL, auth=(private_key, ""),
        data={"fileName": name, "folder": target,
              "isPrivateFile": "true", "useUniqueFileName": "false", "responseFields": "isPrivateFile"},
        files={"file": (name, content, content_type)},
    ).json()
    file_id = res.get("fileId")
    if not file_id:
        raise StorageError("ImageKit returned no file id")
    if res.get("isPrivateFile") is not True or res.get("filePath") != path:
        remove(file_id)
        raise StorageError("ImageKit did not store the file privately")
    return file_id, path


def load(path: str) -> bytes:
    private_key, endpoint = _credentials()
    # orig-true: the exact uploaded file, not an optimised image.
    target = f"{path.lstrip('/')}?tr=orig-true"
    expires = str(int(time.time()) + LINK_SECONDS)
    signature = hmac.new(private_key.encode(), (target + expires).encode(), hashlib.sha1).hexdigest()
    return _request("GET", f"{endpoint}/{target}&ik-t={expires}&ik-s={signature}").content


def remove(file_id: str) -> None:
    """Best effort: a leftover file is private, so it must not fail the user's action."""
    try:
        private_key, _ = _credentials()
        _request("DELETE", f"{API_URL}/files/{file_id}", auth=(private_key, ""))
    except StorageError as e:
        logger.error("Could not delete employee document %s from ImageKit: %s", file_id, e)


def remove_folder(company_id, employee_id=None) -> None:
    """Best effort, after an employee or a company is permanently deleted."""
    path = folder(company_id, employee_id)
    try:
        private_key, _ = _credentials()
        _request("DELETE", f"{API_URL}/folder/", auth=(private_key, ""), json={"folderPath": path})
    except StorageError as e:
        # 404 simply means nothing was ever uploaded.
        if not str(e).endswith(" 404"):
            logger.error("Could not delete ImageKit folder %s: %s", path, e)
