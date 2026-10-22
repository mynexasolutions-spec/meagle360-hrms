import { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Volume2, VolumeX, CheckCircle, AlertTriangle, RefreshCw, Shield, Sparkles, CheckCircle2, Scan, Cpu, Lock, Clock, Eye, Smile, UserCheck, RotateCcw } from 'lucide-react';
import Modal from './Modal';
import { getFaceLandmarker, evaluateLiveness } from '../utils/faceLandmarker';

// Audio voice cue helper using Web Speech Synthesis API
function speakInstruction(text, voiceEnabled = true) {
  if (!voiceEnabled || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find((v) => v.lang.startsWith('hi') || v.lang.startsWith('en'));
    if (preferredVoice) utterance.voice = preferredVoice;
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn('[SelfieModal] Speech synthesis error:', e);
  }
}

function formatRemainingTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

const LIVENESS_ACTIONS = [
  { id: 'blink', label: 'Blink your eyes naturally', voice: 'Please blink your eyes naturally', icon: '👁️' },
  { id: 'smile', label: 'Smile gently at the camera', voice: 'Please smile gently at the camera', icon: '😊' },
  { id: 'turn', label: 'Turn your head slightly to the side', voice: 'Please turn your head slightly', icon: '👤' },
];

const ALIGN_SECONDS = 8;
const CHALLENGE_SECONDS = 8;

export default function SelfieClockInModal({ isOpen, onClose, onConfirm, loading = false, faceConfig = null }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const meshCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const submittingRef = useRef(false);
  const animFrameRef = useRef(null);
  const landmarkerRef = useRef(null);
  const actionPassedRef = useRef(false);
  const steadyHoldRef = useRef(0);
  const latestEvalRef = useRef({ faceDetected: false, isCentered: false, passed: false });

  // Timers refs
  const alignTimerRef = useRef(null);
  const challengeTimerRef = useRef(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // Steps: 0 = Align, 1 = Action Challenge, 2 = Biometric Hologram Scan & Submit
  const [currentStep, setCurrentStep] = useState(0);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [scanStatus, setScanStatus] = useState('idle'); // 'idle' | 'scanning' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState(null);
  const [shutterFlashing, setShutterFlashing] = useState(false);

  // Strict Gate Failures
  const [step0Failed, setStep0Failed] = useState(false);
  const [step0Reason, setStep0Reason] = useState('');
  const [step1Failed, setStep1Failed] = useState(false);
  const [step1Reason, setStep1Reason] = useState('');

  // MediaPipe FaceMesh state
  const [meshReady, setMeshReady] = useState(false);
  const [meshStatus, setMeshStatus] = useState({
    faceDetected: false,
    isCentered: false,
    progress: 0,
    passed: false,
    message: 'Initializing AI FaceMesh...',
  });

  // Automated countdowns (8s each)
  const [alignCountdown, setAlignCountdown] = useState(ALIGN_SECONDS);
  const [challengeCountdown, setChallengeCountdown] = useState(CHALLENGE_SECONDS);

  // 5-minute cooldown state
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Random action pick
  const [action, setAction] = useState(() => {
    const idx = Math.floor(Math.random() * LIVENESS_ACTIONS.length);
    return LIVENESS_ACTIONS[idx];
  });

  const clearAllTimers = useCallback(() => {
    if (alignTimerRef.current) clearInterval(alignTimerRef.current);
    if (challengeTimerRef.current) clearInterval(challengeTimerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    alignTimerRef.current = null;
    challengeTimerRef.current = null;
    animFrameRef.current = null;
  }, []);

  // Stop webcam
  const stopCamera = useCallback(() => {
    clearAllTimers();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, [clearAllTimers]);

  // Start webcam & initialize FaceLandmarker
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setErrorMessage(null);
    setStep0Failed(false);
    setStep1Failed(false);
    actionPassedRef.current = false;
    steadyHoldRef.current = 0;
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
      speakInstruction('Please look directly at the camera', voiceEnabled);

      // Warm up MediaPipe FaceLandmarker
      try {
        const landmarker = await getFaceLandmarker();
        landmarkerRef.current = landmarker;
        setMeshReady(true);
      } catch (meshErr) {
        console.warn('[SelfieModal] FaceLandmarker fallback to timer mode:', meshErr);
        setMeshReady(false);
      }
    } catch (err) {
      console.error('[SelfieModal] Camera error:', err);
      setCameraError('Camera access was denied or is unavailable. Please grant camera permission.');
    }
  }, [voiceEnabled]);

  // Cooldown countdown tick-down
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  // Execute Backend Verification
  const executeVerification = useCallback(async (photoData) => {
    if (submittingRef.current || !photoData) return;
    submittingRef.current = true;
    setScanStatus('scanning');
    speakInstruction('Analyzing biometric scan', voiceEnabled);

    try {
      await onConfirm({
        selfie: photoData,
        liveness_passed: true,
      });
      setScanStatus('success');
      setCooldownSeconds(0);
      speakInstruction('Face verified! Clocked in', voiceEnabled);
    } catch (err) {
      console.error('[SelfieModal] Verification error:', err);
      setScanStatus('error');
      const detail = err.response?.data?.detail || err.message || 'Verification could not complete.';
      setErrorMessage(detail);

      // Check if 5-minute cooldown triggered
      if (detail.toLowerCase().includes('locked') || detail.toLowerCase().includes('cooldown') || detail.toLowerCase().includes('5 minutes')) {
        setCooldownSeconds(300); // 5 minutes
        speakInstruction('Verification locked for 5 minutes due to 3 failed attempts', voiceEnabled);
      } else {
        speakInstruction('Verification failed. Please try again', voiceEnabled);
      }
    } finally {
      submittingRef.current = false;
    }
  }, [onConfirm, voiceEnabled]);

  // Snap & Transition straight into Biometric Scan
  const takeSnapshot = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const size = Math.min(video.videoWidth || 480, video.videoHeight || 480);
    const sx = ((video.videoWidth || 480) - size) / 2;
    const sy = ((video.videoHeight || 480) - size) / 2;

    canvas.width = 360;
    canvas.height = 360;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, 360, 360);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    // Realistic Camera Shutter Flash
    setShutterFlashing(true);
    setTimeout(() => setShutterFlashing(false), 200);

    setCapturedPhoto(dataUrl);
    setCurrentStep(2);
    stopCamera();

    // Trigger biometric scanning
    executeVerification(dataUrl);
  }, [stopCamera, executeVerification]);

  // Step 1: Challenge transition (Gate 2)
  const startChallenge = useCallback((forcedAction = null) => {
    const act = forcedAction || action;
    setCurrentStep(1);
    setStep1Failed(false);
    actionPassedRef.current = false;
    setChallengeCountdown(CHALLENGE_SECONDS);
    speakInstruction(act.voice, voiceEnabled);

    if (challengeTimerRef.current) clearInterval(challengeTimerRef.current);
    let count = CHALLENGE_SECONDS;
    challengeTimerRef.current = setInterval(() => {
      count -= 1;
      setChallengeCountdown(count);
      if (count <= 0) {
        clearInterval(challengeTimerRef.current);
        challengeTimerRef.current = null;
        // Strict Gate 2: If action was NOT performed, DO NOT take snapshot! Halt and require retry.
        if (!actionPassedRef.current) {
          setStep1Failed(true);
          setStep1Reason(`Could not verify "${act.label}" in time.`);
          speakInstruction('Action not detected. Please try again', voiceEnabled);
        }
      }
    }, 1000);
  }, [action, voiceEnabled]);

  // Step 0: Face Alignment Countdown (Gate 1)
  const startAlignCountdown = useCallback(() => {
    setStep0Failed(false);
    steadyHoldRef.current = 0;
    setAlignCountdown(ALIGN_SECONDS);
    if (alignTimerRef.current) clearInterval(alignTimerRef.current);

    let count = ALIGN_SECONDS;
    alignTimerRef.current = setInterval(() => {
      count -= 1;
      setAlignCountdown(count);
      if (count <= 0) {
        clearInterval(alignTimerRef.current);
        alignTimerRef.current = null;

        // Strict Gate 1 check: If face was NOT aligned / detected, DO NOT proceed to Step 1!
        const latest = latestEvalRef.current;
        if (latest.faceDetected && latest.isCentered) {
          startChallenge();
        } else {
          setStep0Failed(true);
          setStep0Reason(
            !latest.faceDetected
              ? 'No face detected in the camera.'
              : 'Face is not centered inside the oval guide.'
          );
          speakInstruction('Alignment failed. Position your face in the oval and retry', voiceEnabled);
        }
      }
    }, 1000);
  }, [startChallenge, voiceEnabled]);

  // Trigger Step 0 on initial camera active
  useEffect(() => {
    if (isOpen && cameraActive && currentStep === 0 && !capturedPhoto && cooldownSeconds === 0 && !step0Failed) {
      startAlignCountdown();
    }
    return () => {
      if (alignTimerRef.current) clearInterval(alignTimerRef.current);
    };
  }, [isOpen, cameraActive, currentStep, capturedPhoto, cooldownSeconds, step0Failed, startAlignCountdown]);

  // Real-Time FaceMesh Motion Tracking Loop
  useEffect(() => {
    if (!cameraActive || currentStep >= 2 || !meshReady || !landmarkerRef.current || step0Failed || step1Failed) {
      return;
    }

    let isRunning = true;

    const keyMeshIndices = [
      10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152,
      148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
      33, 160, 158, 133, 153, 144, 362, 385, 387, 263, 373, 380,
      61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146,
      1, 2, 98, 327,
    ];

    const runTracking = () => {
      if (!isRunning || !videoRef.current || videoRef.current.readyState < 2) {
        if (isRunning) animFrameRef.current = requestAnimationFrame(runTracking);
        return;
      }

      const video = videoRef.current;
      const meshCanvas = meshCanvasRef.current;

      const evalResult = evaluateLiveness(landmarkerRef.current, video, action.id);
      latestEvalRef.current = evalResult;
      setMeshStatus(evalResult);

      // Draw FaceMesh Overlay on transparent Canvas
      if (meshCanvas) {
        if (meshCanvas.width !== video.videoWidth || meshCanvas.height !== video.videoHeight) {
          meshCanvas.width = video.videoWidth || 640;
          meshCanvas.height = video.videoHeight || 480;
        }

        const ctx = meshCanvas.getContext('2d');
        ctx.clearRect(0, 0, meshCanvas.width, meshCanvas.height);

        if (evalResult.faceDetected && evalResult.landmarks) {
          const w = meshCanvas.width;
          const h = meshCanvas.height;
          const ptColor = evalResult.passed
            ? '#22c55e'
            : currentStep === 1
              ? '#38bdf8'
              : evalResult.isCentered
                ? '#10b981'
                : '#f59e0b';

          ctx.fillStyle = ptColor;
          ctx.shadowColor = ptColor;
          ctx.shadowBlur = evalResult.passed ? 8 : 3;

          for (const idx of keyMeshIndices) {
            const pt = evalResult.landmarks[idx];
            if (!pt) continue;
            ctx.beginPath();
            ctx.arc(pt.x * w, pt.y * h, evalResult.passed ? 2.5 : 1.6, 0, 2 * Math.PI);
            ctx.fill();
          }
          ctx.shadowBlur = 0;
        }
      }

      // Step 0: Gate 1 Automatic Alignment Fast-Track
      if (currentStep === 0 && !step0Failed) {
        if (evalResult.faceDetected && evalResult.isCentered) {
          steadyHoldRef.current += 1;
          // After holding steady for ~25 frames (~0.8s), smoothly proceed to Step 1
          if (steadyHoldRef.current >= 25) {
            steadyHoldRef.current = 0;
            if (alignTimerRef.current) {
              clearInterval(alignTimerRef.current);
              alignTimerRef.current = null;
            }
            startChallenge();
            return;
          }
        } else {
          steadyHoldRef.current = 0;
        }
      }

      // Step 1: Gate 2 Real Motion Verification Trigger
      if (currentStep === 1 && evalResult.passed && !actionPassedRef.current && !step1Failed) {
        actionPassedRef.current = true;
        if (challengeTimerRef.current) {
          clearInterval(challengeTimerRef.current);
          challengeTimerRef.current = null;
        }

        // Quick 300ms pause so user sees green confirmation, then auto-snap
        setTimeout(() => {
          if (isRunning) takeSnapshot();
        }, 320);
        return;
      }

      if (isRunning) {
        animFrameRef.current = requestAnimationFrame(runTracking);
      }
    };

    animFrameRef.current = requestAnimationFrame(runTracking);

    return () => {
      isRunning = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [cameraActive, currentStep, meshReady, action.id, step0Failed, step1Failed, startChallenge, takeSnapshot]);

  // Modal open/close sync
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
      setCapturedPhoto(null);
      setScanStatus('idle');
      setErrorMessage(null);
      setStep0Failed(false);
      setStep1Failed(false);
      actionPassedRef.current = false;
      submittingRef.current = false;
      setAlignCountdown(ALIGN_SECONDS);
      setChallengeCountdown(CHALLENGE_SECONDS);

      // Check initial cooldown from server config if available
      const initCooldown = faceConfig?.my_profile?.cooldown_seconds_remaining || 0;
      if (initCooldown > 0) {
        setCooldownSeconds(initCooldown);
        setScanStatus('error');
        setErrorMessage(`Clock-in is temporarily locked due to 3 failed attempts.`);
      } else {
        setCooldownSeconds(0);
        const idx = Math.floor(Math.random() * LIVENESS_ACTIONS.length);
        setAction(LIVENESS_ACTIONS[idx]);
        startCamera();
      }
    } else {
      stopCamera();
      submittingRef.current = false;
    }
    return () => {
      stopCamera();
      submittingRef.current = false;
    };
  }, [isOpen, faceConfig, startCamera, stopCamera]);

  // Retry Step 0 (Face Alignment)
  const handleRetryStep0 = () => {
    setStep0Failed(false);
    startAlignCountdown();
  };

  // Retry Step 1 (Action Motion)
  const handleRetryStep1 = () => {
    setStep1Failed(false);
    actionPassedRef.current = false;
    // Pick another random action to make it easier for user
    const curIdx = LIVENESS_ACTIONS.findIndex((a) => a.id === action.id);
    const nextAct = LIVENESS_ACTIONS[(curIdx + 1) % LIVENESS_ACTIONS.length];
    setAction(nextAct);
    startChallenge(nextAct);
  };

  const handleRetakeFull = () => {
    clearAllTimers();
    setCapturedPhoto(null);
    setCurrentStep(0);
    setScanStatus('idle');
    setErrorMessage(null);
    setStep0Failed(false);
    setStep1Failed(false);
    actionPassedRef.current = false;
    setAlignCountdown(ALIGN_SECONDS);
    setChallengeCountdown(CHALLENGE_SECONDS);
    const idx = Math.floor(Math.random() * LIVENESS_ACTIONS.length);
    setAction(LIVENESS_ACTIONS[idx]);
    startCamera();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Biometric Face Verification" maxWidth="720px">
      {/* Dynamic Keyframes for Hologram Laser Scan */}
      <style>{`
        @keyframes laserSweep {
          0% { top: 6%; opacity: 0.85; }
          50% { top: 88%; opacity: 1; }
          100% { top: 6%; opacity: 0.85; }
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.02); }
        }
        @keyframes popSuccess {
          0% { transform: scale(0.65); opacity: 0; }
          70% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 320px) 1fr', gap: 20, alignItems: 'center' }}>
        {/* Left Column: Hologram Viewport */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: 290,
              borderRadius: 14,
              overflow: 'hidden',
              background: '#090d16',
              border: cooldownSeconds > 0 || step0Failed || step1Failed
                ? '2px solid #ef4444'
                : scanStatus === 'success' || meshStatus.passed
                  ? '2px solid #22c55e'
                  : scanStatus === 'scanning' || currentStep === 1
                    ? '2px solid #38bdf8'
                    : '2px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: scanStatus === 'scanning'
                ? '0 0 24px rgba(56, 189, 248, 0.25)'
                : meshStatus.passed
                  ? '0 0 24px rgba(34, 197, 94, 0.4)'
                  : cooldownSeconds > 0 || step0Failed || step1Failed
                    ? '0 0 20px rgba(239, 68, 68, 0.2)'
                    : '0 8px 24px rgba(0, 0, 0, 0.12)',
              transition: 'border 0.3s ease, box-shadow 0.3s ease',
            }}
          >
            {/* Camera Shutter Flash */}
            {shutterFlashing && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: '#ffffff',
                  zIndex: 30,
                  opacity: 0.9,
                  transition: 'opacity 0.2s ease-out',
                }}
              />
            )}

            {cooldownSeconds > 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#f87171', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                  <Lock size={28} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fca5a5' }}>
                  Clock-In Locked
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#ef4444', letterSpacing: 1 }}>
                  {formatRemainingTime(cooldownSeconds)}
                </div>
                <div style={{ fontSize: 11.5, color: '#94a3b8', lineHeight: 1.4 }}>
                  3 failed verification attempts. Please wait for cooldown to expire before retrying.
                </div>
              </div>
            ) : cameraError ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#f87171' }}>
                <AlertTriangle size={32} style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>{cameraError}</div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: 12, fontSize: 12 }}
                  onClick={startCamera}
                >
                  Try Again
                </button>
              </div>
            ) : capturedPhoto ? (
              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                {/* Captured Selfie Base */}
                <img
                  src={capturedPhoto}
                  alt="Live Selfie"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    filter: scanStatus === 'scanning' ? 'brightness(0.92) contrast(1.05)' : 'none',
                  }}
                />

                {/* Digital Hologram Mesh Matrix */}
                {scanStatus === 'scanning' && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'radial-gradient(circle, rgba(56, 189, 248, 0.12) 1.5px, transparent 1.5px) 0 0/16px 16px',
                      pointerEvents: 'none',
                    }}
                  />
                )}

                {/* Sweeping Holographic Laser Beam */}
                {scanStatus === 'scanning' && (
                  <div
                    style={{
                      position: 'absolute',
                      left: '8%',
                      right: '8%',
                      height: 3,
                      background: 'linear-gradient(90deg, transparent, #38bdf8, #22c55e, #38bdf8, transparent)',
                      boxShadow: '0 0 16px #38bdf8, 0 0 28px rgba(34, 197, 94, 0.7)',
                      animation: 'laserSweep 1.5s ease-in-out infinite',
                      zIndex: 20,
                      pointerEvents: 'none',
                    }}
                  />
                )}

                {/* HUD Corner Reticles */}
                <div
                  style={{
                    position: 'absolute',
                    width: '68%',
                    height: '80%',
                    top: '10%',
                    left: '16%',
                    pointerEvents: 'none',
                    border: scanStatus === 'success'
                      ? '2px solid #22c55e'
                      : '2px dashed rgba(56, 189, 248, 0.5)',
                    borderRadius: scanStatus === 'success' ? 12 : '50%',
                    transition: 'all 0.3s ease',
                  }}
                />

                {/* Success Pop-in Overlay */}
                {scanStatus === 'success' && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(5, 46, 22, 0.72)',
                      backdropFilter: 'blur(3px)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10,
                      zIndex: 25,
                      animation: 'popSuccess 0.35s ease-out forwards',
                    }}
                  >
                    <div
                      style={{
                        width: 60,
                        height: 60,
                        borderRadius: '50%',
                        background: '#22c55e',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 0 28px rgba(34, 197, 94, 0.8)',
                      }}
                    >
                      <CheckCircle2 size={36} strokeWidth={2.5} />
                    </div>
                    <div style={{ color: '#ffffff', fontWeight: 700, fontSize: 16 }}>
                      Identity Verified
                    </div>
                    <div style={{ color: '#86efac', fontSize: 12 }}>
                      Clocking you in...
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transform: 'scaleX(-1)',
                  }}
                />

                {/* Real-time 468 FaceMesh Landmark Overlay */}
                <canvas
                  ref={meshCanvasRef}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transform: 'scaleX(-1)',
                    pointerEvents: 'none',
                    zIndex: 10,
                  }}
                />

                {/* Live Face Oval Guide */}
                <div
                  style={{
                    position: 'absolute',
                    width: '68%',
                    height: '80%',
                    border: step0Failed || step1Failed
                      ? '3px solid #ef4444'
                      : meshStatus.passed
                        ? '3px solid #22c55e'
                        : currentStep === 1
                          ? '3px solid #0284c7'
                          : meshStatus.faceDetected && meshStatus.isCentered
                            ? '3px solid #10b981'
                            : '2px dashed rgba(255, 255, 255, 0.65)',
                    borderRadius: '50%',
                    pointerEvents: 'none',
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.40)',
                    transition: 'all 0.3s ease',
                  }}
                />

                {/* Real-time Detection Pill at Bottom of Video */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 12,
                    background: 'rgba(15, 23, 42, 0.88)',
                    color: '#fff',
                    padding: '5px 14px',
                    borderRadius: 9999,
                    fontSize: 11.5,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    backdropFilter: 'blur(6px)',
                    zIndex: 15,
                    border: step0Failed || step1Failed
                      ? '1px solid #ef4444'
                      : meshStatus.passed
                        ? '1px solid #22c55e'
                        : '1px solid rgba(255, 255, 255, 0.12)',
                  }}
                >
                  {step0Failed ? (
                    <span style={{ color: '#f87171' }}>⚠️ Alignment Failed - Retry</span>
                  ) : step1Failed ? (
                    <span style={{ color: '#f87171' }}>⚠️ Motion Failed - Retry</span>
                  ) : meshStatus.passed ? (
                    <>
                      <span style={{ color: '#22c55e' }}>✓ Motion Verified</span>
                      <span>Snapping photo...</span>
                    </>
                  ) : currentStep === 0 ? (
                    <>
                      <span style={{ color: meshStatus.faceDetected && meshStatus.isCentered ? '#4ade80' : '#fbbf24' }}>
                        ● {meshStatus.faceDetected && meshStatus.isCentered ? 'Face Aligned' : 'Align face in oval'}
                      </span>
                      <span>{alignCountdown}s</span>
                    </>
                  ) : (
                    <>
                      <span style={{ color: '#38bdf8' }}>
                        ● Live AI Tracking ({meshStatus.progress}%)
                      </span>
                      <span>{challengeCountdown}s</span>
                    </>
                  )}
                </div>
              </>
            )}

            <canvas ref={canvasRef} style={{ display: 'none' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
            <span style={{ fontSize: 11.5, color: cooldownSeconds > 0 || step0Failed || step1Failed ? '#ef4444' : scanStatus === 'scanning' ? '#0284c7' : cameraActive ? '#16a34a' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: cooldownSeconds > 0 || step0Failed || step1Failed ? '#ef4444' : scanStatus === 'scanning' ? '#0284c7' : cameraActive ? '#16a34a' : '#94a3b8',
                }}
              />
              {cooldownSeconds > 0 ? 'Cooldown Lock' : step0Failed ? 'Alignment Halt' : step1Failed ? 'Motion Halt' : scanStatus === 'scanning' ? 'Biometric Scanning' : meshReady ? 'AI FaceMesh Active' : cameraActive ? 'Live Camera' : 'Idle'}
            </span>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ padding: '2px 8px', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 4, height: 26 }}
              onClick={() => setVoiceEnabled(!voiceEnabled)}
              title={voiceEnabled ? 'Mute voice instructions' : 'Enable voice instructions'}
            >
              {voiceEnabled ? <Volume2 size={13} style={{ color: '#0284c7' }} /> : <VolumeX size={13} style={{ color: 'var(--text-secondary)' }} />}
              <span style={{ color: voiceEnabled ? '#0284c7' : 'var(--text-secondary)' }}>{voiceEnabled ? 'Voice On' : 'Voice Off'}</span>
            </button>
          </div>
        </div>

        {/* Right Column: Console & Progression */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Stepper Progress Badges */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: 6,
                fontSize: 11.5,
                fontWeight: 600,
                textAlign: 'center',
                background: step0Failed ? '#fef2f2' : currentStep >= 0 ? '#eff6ff' : 'var(--bg-secondary)',
                color: step0Failed ? '#dc2626' : currentStep >= 0 ? '#1d4ed8' : 'var(--text-secondary)',
                border: step0Failed ? '1px solid #fecaca' : currentStep === 0 ? '1px solid #bfdbfe' : '1px solid transparent',
              }}
            >
              1. Align {step0Failed ? '⚠️' : currentStep > 0 ? '✓' : '(8s)'}
            </div>
            <div
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: 6,
                fontSize: 11.5,
                fontWeight: 600,
                textAlign: 'center',
                background: step1Failed ? '#fef2f2' : currentStep >= 1 ? '#eff6ff' : 'var(--bg-secondary)',
                color: step1Failed ? '#dc2626' : currentStep >= 1 ? '#1d4ed8' : 'var(--text-secondary)',
                border: step1Failed ? '1px solid #fecaca' : currentStep === 1 ? '1px solid #bfdbfe' : '1px solid transparent',
              }}
            >
              2. Liveness {step1Failed ? '⚠️' : currentStep > 1 ? '✓' : ''}
            </div>
            <div
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: 6,
                fontSize: 11.5,
                fontWeight: 600,
                textAlign: 'center',
                background: scanStatus === 'success' ? '#ecfdf5' : currentStep === 2 ? '#eff6ff' : 'var(--bg-secondary)',
                color: scanStatus === 'success' ? '#15803d' : currentStep === 2 ? '#0284c7' : 'var(--text-secondary)',
                border: scanStatus === 'success' ? '1px solid #a7f3d0' : currentStep === 2 ? '1px solid #bfdbfe' : '1px solid transparent',
              }}
            >
              3. Vector Match
            </div>
          </div>

          {/* Dynamic Console Card */}
          <div
            style={{
              padding: 18,
              borderRadius: 10,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              minHeight: 160,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            {/* Cooldown Active Screen */}
            {cooldownSeconds > 0 ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontWeight: 700, fontSize: 14.5, marginBottom: 6 }}>
                  <Lock size={18} /> Cooldown Active: 5 Minutes
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.45 }}>
                  {errorMessage || 'Verification failed 3 times. For security, clock-in is temporarily locked.'}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                  <Clock size={16} />
                  <span>Time remaining: {formatRemainingTime(cooldownSeconds)}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={onClose}
                >
                  Close Window
                </button>
              </div>
            ) : currentStep === 0 && !capturedPhoto ? (
              /* Step 0: Face Alignment Gate */
              step0Failed ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontWeight: 700, fontSize: 14.5, marginBottom: 6 }}>
                    <AlertTriangle size={18} /> Alignment Incomplete
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.45 }}>
                    {step0Reason || 'Your face was not centered inside the oval guide in time.'} Please position yourself directly in front of the camera and retry.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ width: '100%', justifyContent: 'center', gap: 6 }}
                    onClick={handleRetryStep0}
                  >
                    <RefreshCw size={13} /> Retry Alignment
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--text-primary)' }}>
                      Position face inside the oval
                    </div>
                    <span
                      style={{
                        background: '#dbeafe',
                        color: '#1d4ed8',
                        fontSize: 12,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 9999,
                      }}
                    >
                      {alignCountdown}s
                    </span>
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.45 }}>
                    {meshStatus.faceDetected && meshStatus.isCentered
                      ? '✓ Face centered! Holding steady...'
                      : meshStatus.faceDetected
                        ? 'Center face inside the oval guide.'
                        : 'Look directly at camera. Align before timer expires.'}
                  </p>

                  {/* Progress Bar for 8 seconds */}
                  <div style={{ width: '100%', height: 6, background: '#e2e8f0', borderRadius: 9999, overflow: 'hidden', marginBottom: 14 }}>
                    <div
                      style={{
                        height: '100%',
                        background: meshStatus.faceDetected && meshStatus.isCentered ? '#10b981' : '#2563eb',
                        width: `${((ALIGN_SECONDS - alignCountdown) / ALIGN_SECONDS) * 100}%`,
                        transition: 'width 1s linear',
                      }}
                    />
                  </div>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}
                    onClick={() => {
                      if (latestEvalRef.current.faceDetected) {
                        startChallenge();
                      } else {
                        setStep0Failed(true);
                        setStep0Reason('No face detected in camera.');
                      }
                    }}
                    disabled={!cameraActive}
                  >
                    Ready Now (Proceed to Action ➔)
                  </button>
                </div>
              )
            ) : currentStep === 1 && !capturedPhoto ? (
              /* Step 1: Real-time FaceMesh Liveness Action Gate */
              step1Failed ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontWeight: 700, fontSize: 14.5, marginBottom: 6 }}>
                    <AlertTriangle size={18} /> Action Not Detected
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.45 }}>
                    {step1Reason || `Could not detect "${action.label}" in time.`} Ensure good lighting and face the camera directly.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ width: '100%', justifyContent: 'center', gap: 6 }}
                    onClick={handleRetryStep1}
                  >
                    <RefreshCw size={13} /> Try Another Action
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 22 }}>{action.icon}</span>
                      <div style={{ fontWeight: 700, fontSize: 14.5, color: meshStatus.passed ? '#15803d' : '#0284c7' }}>
                        {action.label}
                      </div>
                    </div>
                    <span
                      style={{
                        background: meshStatus.passed ? '#dcfce7' : '#e0f2fe',
                        color: meshStatus.passed ? '#15803d' : '#0369a1',
                        fontSize: 12,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 9999,
                      }}
                    >
                      {meshStatus.passed ? '✓ Matched' : `📸 ${challengeCountdown}s`}
                    </span>
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.45 }}>
                    <strong style={{ color: meshStatus.passed ? '#16a34a' : 'inherit' }}>{meshStatus.message}</strong>. Perform the motion to trigger automatic snapshot.
                  </p>

                  {/* Live Real-time Motion Progress Bar */}
                  <div style={{ width: '100%', height: 7, background: '#e2e8f0', borderRadius: 9999, overflow: 'hidden', marginBottom: 14 }}>
                    <div
                      style={{
                        height: '100%',
                        background: meshStatus.passed ? '#22c55e' : 'linear-gradient(90deg, #0284c7, #38bdf8)',
                        width: `${meshStatus.passed ? 100 : Math.max(10, meshStatus.progress)}%`,
                        transition: 'width 0.15s ease-out, background 0.2s ease',
                      }}
                    />
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ width: '100%', justifyContent: 'center', fontWeight: 600, fontSize: 12 }}
                    onClick={takeSnapshot}
                  >
                    Snap Photo Now (Manual Override 📸)
                  </button>
                </div>
              )
            ) : (
              /* Step 2: Holographic Radar Scan & Verification State */
              <div>
                {scanStatus === 'scanning' && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#0284c7', fontWeight: 700, fontSize: 14.5, marginBottom: 6 }}>
                      <Cpu size={18} className="spinner" /> Analyzing Biometric Vectors...
                    </div>
                    <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.45 }}>
                      Extracting 128-dimensional facial embedding and matching against approved profile in memory.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: 'var(--text-secondary)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>MediaPipe FaceMesh</span>
                        <span style={{ color: '#16a34a', fontWeight: 600 }}>Motion Verified ✓</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>YuNet Neural Detection</span>
                        <span style={{ color: '#16a34a', fontWeight: 600 }}>Active</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>SFace Cosine Similarity</span>
                        <span style={{ color: '#0284c7', fontWeight: 600 }}>Matching...</span>
                      </div>
                    </div>
                  </div>
                )}

                {scanStatus === 'success' && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#15803d', fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
                      <CheckCircle2 size={20} /> Verified & Clocked In!
                    </div>
                    <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
                      Facial vectors matched successfully. Your attendance record is secured. Closing modal...
                    </p>
                  </div>
                )}

                {scanStatus === 'error' && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                      <AlertTriangle size={18} /> Verification Notice
                    </div>
                    <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.45 }}>
                      {errorMessage || 'Verification could not be confirmed.'}
                    </p>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={handleRetakeFull}
                    >
                      <RefreshCw size={13} style={{ marginRight: 6 }} /> Try Again
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Privacy Security Note */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-secondary)' }}>
            <Shield size={14} style={{ color: '#10b981', flexShrink: 0 }} />
            <span>Zero Storage: Live selfies are processed in memory and never saved.</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
