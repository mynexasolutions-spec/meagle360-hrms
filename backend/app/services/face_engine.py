"""Face engine - turns an image into a face embedding and compares two
embeddings. Uses OpenCV's built-in YuNet (detector) and SFace (recognizer)
ONNX models: CPU only, no compilation, small. OpenCV is imported lazily and
the models are loaded once per worker, so the app starts fine and every
other feature works even if the face dependencies are not installed.

Images handled here are processed in memory only and never written to disk.
Model files are downloaded once into FACE_MODEL_DIR on first use."""

import math
import os
import threading
import urllib.request

_DIR = os.environ.get(
    "FACE_MODEL_DIR",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "face_models")),
)
_BASE = "https://github.com/opencv/opencv_zoo/raw/main/models"
_MODELS = {
    "detector": (
        "face_detection_yunet_2023mar.onnx",
        f"{_BASE}/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    ),
    "recognizer": (
        "face_recognition_sface_2021dec.onnx",
        f"{_BASE}/face_recognition_sface/face_recognition_sface_2021dec.onnx",
    ),
}
_MAX_SIDE = 640  # larger images are downscaled before detection

_lock = threading.Lock()
_detector = None
_recognizer = None


class FaceEngineUnavailable(Exception):
    """Face libraries/model are not installed or failed to load."""


class FaceError(ValueError):
    """The image cannot be used (no face, several faces, unreadable)."""


def _model_path(key: str) -> str:
    filename, url = _MODELS[key]
    path = os.path.join(_DIR, filename)
    if not os.path.exists(path):
        os.makedirs(_DIR, exist_ok=True)
        tmp = path + ".part"
        urllib.request.urlretrieve(url, tmp)
        os.replace(tmp, path)
    return path


def _load():
    global _detector, _recognizer
    if _detector is not None:
        return
    with _lock:
        if _detector is None:
            try:
                import cv2
                det = cv2.FaceDetectorYN.create(_model_path("detector"), "", (320, 320), 0.8)
                rec = cv2.FaceRecognizerSF.create(_model_path("recognizer"), "")
            except Exception as exc:  # ImportError, download failure, old OpenCV, ...
                raise FaceEngineUnavailable(str(exc)) from exc
            _recognizer, _detector = rec, det


def extract_embedding(image_bytes: bytes) -> list[float]:
    """Returns a normalised embedding for the single face in the image."""
    try:
        import cv2
        import numpy as np
    except Exception as exc:
        raise FaceEngineUnavailable(str(exc)) from exc
    _load()

    img = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise FaceError("The image could not be read.")
    h, w = img.shape[:2]
    scale = _MAX_SIDE / max(h, w)
    if scale < 1:
        img = cv2.resize(img, (int(w * scale), int(h * scale)))
        h, w = img.shape[:2]

    with _lock:  # the detector keeps per-call state, so serialise use
        _detector.setInputSize((w, h))
        _, faces = _detector.detect(img)
        if faces is None or len(faces) == 0:
            raise FaceError("No face detected. Use a clear, well-lit, front-facing photo.")
        if len(faces) > 1:
            raise FaceError("More than one face detected. Only one person should be in the photo.")
        aligned = _recognizer.alignCrop(img, faces[0])
        feat = _recognizer.feature(aligned)
    vec = feat.flatten().astype("float64")
    norm = float(np.linalg.norm(vec)) or 1.0
    return [float(x) for x in vec / norm]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if not na or not nb:
        return 0.0
    return dot / (na * nb)
