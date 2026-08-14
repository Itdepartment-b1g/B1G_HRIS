import { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, MapPin, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { detectFaceInCanvas } from '@/lib/faceDetection';
import { toast } from 'sonner';

export interface SelfieLocationValue {
  photoDataUrl: string;
  lat: number;
  lng: number;
}

interface SelfieLocationCaptureProps {
  active: boolean;
  value: SelfieLocationValue | null;
  onChange: (next: SelfieLocationValue | null) => void;
  onHasPhotoChange?: (hasPhoto: boolean) => void;
}

function jpegFromCanvas(source: HTMLCanvasElement, maxWidth = 480, quality = 0.72): string {
  const scale = Math.min(1, maxWidth / Math.max(1, source.width));
  if (scale >= 1) return source.toDataURL('image/jpeg', quality);
  const out = document.createElement('canvas');
  out.width = Math.round(source.width * scale);
  out.height = Math.round(source.height * scale);
  const ctx = out.getContext('2d');
  if (!ctx) return source.toDataURL('image/jpeg', quality);
  ctx.drawImage(source, 0, 0, out.width, out.height);
  return out.toDataURL('image/jpeg', quality);
}

export function SelfieLocationCapture({ active, value, onChange, onHasPhotoChange }: SelfieLocationCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(value?.photoDataUrl ?? null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    value ? { lat: value.lat, lng: value.lng } : null
  );
  const [locationError, setLocationError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [faceCheckLoading, setFaceCheckLoading] = useState(false);

  const getLocation = useCallback((options?: { retries?: number }): Promise<{ lat: number; lng: number }> => {
    const maxRetries = options?.retries ?? 0;
    const attempt = (n: number): Promise<{ lat: number; lng: number }> =>
      new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocation not supported'));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          (err) => {
            if (err?.code === 2 && n < maxRetries) {
              setTimeout(() => attempt(n + 1).then(resolve).catch(reject), 3000);
            } else {
              reject(err);
            }
          },
          { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
        );
      });
    return attempt(0);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      setCameraError('Could not access camera. Please allow camera permissions.');
      console.error(err);
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const capturePhoto = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.srcObject) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    setFaceCheckLoading(true);
    try {
      const faceDetected = await detectFaceInCanvas(canvas);
      if (!faceDetected) {
        toast.error('No face detected. Please position your face in the camera and try again.');
        return;
      }
      const dataUrl = jpegFromCanvas(canvas);
      setCapturedPhoto(dataUrl);
      setLocation(null);
      setLocationError(null);
      onChange(null);
      onHasPhotoChange?.(true);
      stopCamera();
    } finally {
      setFaceCheckLoading(false);
    }
  }, [onChange, onHasPhotoChange, stopCamera]);

  const retakePhoto = useCallback(() => {
    setCapturedPhoto(null);
    setLocation(null);
    setLocationError(null);
    onChange(null);
    onHasPhotoChange?.(false);
    startCamera();
  }, [onChange, onHasPhotoChange, startCamera]);

  const fetchLocation = useCallback(async () => {
    if (!capturedPhoto) return;
    setLocationError(null);
    setLocationLoading(true);
    try {
      const loc = await getLocation({ retries: 2 });
      setLocation(loc);
      onChange({ photoDataUrl: capturedPhoto, lat: loc.lat, lng: loc.lng });
    } catch (err: any) {
      const msg =
        err?.code === 1
          ? 'Location denied. Please allow location access in your browser settings.'
          : err?.code === 2
          ? 'Location unavailable. Move near a window or outdoors and tap Try again.'
          : err?.code === 3
          ? 'Location timed out. Try again or ensure you have a clear view of the sky.'
          : 'Could not get location. Please enable GPS and try again.';
      setLocationError(msg);
      onChange(null);
    } finally {
      setLocationLoading(false);
    }
  }, [capturedPhoto, getLocation, onChange]);

  useEffect(() => {
    if (!active) {
      stopCamera();
      setCapturedPhoto(null);
      setLocation(null);
      setLocationError(null);
      setCameraError(null);
      setLocationLoading(false);
      setFaceCheckLoading(false);
      onHasPhotoChange?.(false);
      return;
    }
    if (!capturedPhoto) startCamera();
    return () => stopCamera();
  }, [active, capturedPhoto, startCamera, stopCamera]);

  useEffect(() => {
    if (capturedPhoto && !location && !locationError && !locationLoading) {
      fetchLocation();
    }
  }, [capturedPhoto, location, locationError, locationLoading, fetchLocation]);

  if (!active) return null;

  return (
    <div className="space-y-3">
      {!capturedPhoto ? (
        <>
          <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
            <canvas ref={canvasRef} className="hidden" />
            {cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/90 p-4">
                <p className="text-sm text-destructive text-center">{cameraError}</p>
              </div>
            )}
          </div>
          {!cameraError && (
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={capturePhoto}
              disabled={faceCheckLoading}
            >
              {faceCheckLoading ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Checking...
                </>
              ) : (
                <>
                  <Camera className="h-5 w-5 mr-2" /> Take selfie
                </>
              )}
            </Button>
          )}
        </>
      ) : (
        <>
          <div className="relative rounded-lg overflow-hidden border">
            <img src={capturedPhoto} alt="Selfie" className="w-full aspect-video object-cover" />
            <Button type="button" variant="secondary" size="sm" className="absolute top-2 right-2" onClick={retakePhoto}>
              Retake
            </Button>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
            <div className="flex-shrink-0">
              {location ? (
                <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
              ) : locationError ? (
                <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <XCircle className="h-5 w-5 text-amber-600" />
                </div>
              ) : (
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4" /> Location
              </p>
              {location && (
                <>
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                  </p>
                  <p className="text-xs text-emerald-600 font-medium mt-1">
                    Location captured.{' '}
                    <a
                      href={`https://www.google.com/maps?q=${location.lat},${location.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      View map
                    </a>
                  </p>
                </>
              )}
              {!location && !locationError && (
                <p className="text-xs text-muted-foreground mt-1">Getting your current location…</p>
              )}
              {locationError && (
                <div className="mt-1 space-y-2">
                  <p className="text-xs text-amber-600 font-medium">{locationError}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setLocationError(null);
                      fetchLocation();
                    }}
                    disabled={locationLoading}
                  >
                    {locationLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    Try again
                  </Button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
