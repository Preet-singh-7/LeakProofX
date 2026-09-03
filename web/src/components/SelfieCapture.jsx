import { useEffect, useRef, useState } from 'react';
import { Button } from './ui';

/**
 * Live webcam capture, required before submitting the two actions that
 * need photographic accountability: creating a paper (BOARD/ADMIN) and
 * printing one (INVIGILATOR/ADMIN) — see src/verification/ on the backend.
 * Deliberately a *live* capture (getUserMedia + canvas snapshot), not a
 * file upload — the point is proving who was actually present at that
 * moment, not just attaching any photo.
 */
export function SelfieCapture({ image, onCapture, label = 'Identity confirmation' }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStreaming(false);
  }

  async function startCamera() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStreaming(true);
    } catch {
      setError('Camera access is required to continue — check your browser permissions.');
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    onCapture(canvas.toDataURL('image/jpeg', 0.8));
    stopStream();
  }

  function retake() {
    onCapture(null);
    startCamera();
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-xs font-medium text-slate-500">
        {label} <span className="font-normal text-slate-400">(a live photo, captured now — required)</span>
      </p>

      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

      {image ? (
        <div className="flex items-center gap-3">
          <img src={image} alt="Captured selfie" className="h-20 w-20 rounded-md object-cover ring-1 ring-slate-300" />
          <Button type="button" variant="secondary" onClick={retake}>
            Retake
          </Button>
        </div>
      ) : streaming ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} className="h-40 w-56 rounded-md bg-black object-cover" muted playsInline />
          <Button type="button" onClick={capture}>
            Capture
          </Button>
        </div>
      ) : (
        <Button type="button" variant="secondary" onClick={startCamera}>
          Open camera
        </Button>
      )}
    </div>
  );
}
