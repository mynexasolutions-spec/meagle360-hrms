import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let landmarkerInstance = null;
let landmarkerPromise = null;

/**
 * Initializes and caches the MediaPipe FaceLandmarker instance.
 * Loads local WASM and model files for fast and reliable offline/online operation.
 */
export async function getFaceLandmarker() {
  if (landmarkerInstance) return landmarkerInstance;
  if (landmarkerPromise) return landmarkerPromise;

  landmarkerPromise = (async () => {
    try {
      // Try loading local WASM first, fallback to CDN if needed
      let vision;
      try {
        vision = await FilesetResolver.forVisionTasks('/wasm');
      } catch (localWasmErr) {
        console.warn('[FaceLandmarker] Local WASM load failed, falling back to CDN:', localWasmErr);
        vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm');
      }

      landmarkerInstance = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/models/face_landmarker.task',
          delegate: 'GPU',
        },
        outputFaceBlendshapes: true,
        runningMode: 'VIDEO',
        numFaces: 1,
      });

      return landmarkerInstance;
    } catch (err) {
      console.error('[FaceLandmarker] Failed to initialize FaceLandmarker:', err);
      landmarkerPromise = null;
      throw err;
    }
  })();

  return landmarkerPromise;
}

/**
 * Evaluates real-time liveness action from video element.
 * @param {HTMLVideoElement} video 
 * @param {string} actionId 'blink' | 'smile' | 'turn'
 * @returns {object} { faceDetected, passed, progress, confidence, landmarks, message }
 */
export function evaluateLiveness(landmarker, video, actionId) {
  if (!landmarker || !video || video.readyState < 2) {
    return { faceDetected: false, passed: false, progress: 0, message: 'Camera initializing...' };
  }

  try {
    const timestamp = performance.now();
    const result = landmarker.detectForVideo(video, timestamp);

    if (!result || !result.faceLandmarks || result.faceLandmarks.length === 0) {
      return {
        faceDetected: false,
        passed: false,
        progress: 0,
        message: 'No face detected. Please face the camera.',
      };
    }

    const landmarks = result.faceLandmarks[0];
    const blendshapes = result.faceBlendshapes?.[0]?.categories || [];

    // Helper to get blendshape score by category name
    const getScore = (name) => {
      const match = blendshapes.find((c) => c.categoryName === name);
      return match ? match.score : 0;
    };

    // Calculate face alignment / bounding box center
    const nose = landmarks[1];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];

    const isCentered =
      nose.x >= 0.25 && nose.x <= 0.75 &&
      nose.y >= 0.20 && nose.y <= 0.80;

    let passed = false;
    let progress = 0;
    let message = 'Perform the action';

    if (actionId === 'blink') {
      const blinkLeft = getScore('eyeBlinkLeft');
      const blinkRight = getScore('eyeBlinkRight');
      const maxBlink = Math.max(blinkLeft, blinkRight);
      const avgBlink = (blinkLeft + blinkRight) / 2;

      // Also compute geometric Eye Aspect Ratio (EAR) as dual-verification
      const earLeft = Math.abs(landmarks[159].y - landmarks[145].y) / (Math.abs(landmarks[133].x - landmarks[33].x) || 1);
      const isEarBlink = earLeft < 0.12;

      progress = Math.min(100, Math.round(maxBlink * 150));
      if (maxBlink > 0.45 || avgBlink > 0.38 || isEarBlink) {
        passed = true;
        progress = 100;
        message = 'Blink verified! ✓';
      } else {
        message = 'Please blink your eyes';
      }
    } else if (actionId === 'smile') {
      const smileLeft = getScore('mouthSmileLeft');
      const smileRight = getScore('mouthSmileRight');
      const avgSmile = (smileLeft + smileRight) / 2;

      // Distance between mouth corners relative to cheek width
      const mouthWidth = Math.abs(landmarks[291].x - landmarks[61].x);
      const cheekWidth = Math.abs(rightCheek.x - leftCheek.x) || 1;
      const mouthRatio = mouthWidth / cheekWidth;

      progress = Math.min(100, Math.round(avgSmile * 180));
      if (avgSmile > 0.40 || mouthRatio > 0.48) {
        passed = true;
        progress = 100;
        message = 'Smile detected! ✓';
      } else {
        message = 'Smile gently at the camera';
      }
    } else if (actionId === 'turn') {
      // Yaw calculation from nose relative to cheeks
      const minX = Math.min(leftCheek.x, rightCheek.x);
      const maxX = Math.max(leftCheek.x, rightCheek.x);
      const cheekWidth = maxX - minX || 1;
      const noseRatio = (nose.x - minX) / cheekWidth;

      // Normal center is ~0.45 - 0.55
      const deviation = Math.abs(noseRatio - 0.50);
      progress = Math.min(100, Math.round(deviation * 450));

      if (noseRatio < 0.34 || noseRatio > 0.66) {
        passed = true;
        progress = 100;
        message = 'Head turn registered! ✓';
      } else {
        message = 'Turn head slightly left or right';
      }
    }

    return {
      faceDetected: true,
      isCentered,
      passed,
      progress,
      landmarks,
      message,
    };
  } catch (err) {
    console.error('[FaceLandmarker] Evaluation error:', err);
    return { faceDetected: false, passed: false, progress: 0, message: 'Tracking error' };
  }
}
