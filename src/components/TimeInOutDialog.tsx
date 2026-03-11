import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, MapPin, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { isWithinWorkLocation, type WorkLocation } from '@/lib/geoUtils';
import { detectFaceInCanvas } from '@/lib/faceDetection';
import { toast } from 'sonner';
import { LocationMap } from '@/components/LocationMap';

interface TimeInOutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'in' | 'out';
  workLocations: WorkLocation[];
  onConfirm: (data: { photoBlob: Blob; lat: number; lng: number }) => Promise<void>;
}

export function TimeInOutDialog({
  open,
  onOpenChange,
  mode,
  workLocations,
  onConfirm,
}: TimeInOutDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [withinRadius, setWithinRadius] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [faceCheckLoading, setFaceCheckLoading] = useState(false);

  const getLocation = useCallback((options?: { retries?: number }): Promise<{ lat: number; lng: number }> => {
    const maxRetries = options?.retries ?? 0;
    const attempt = (n: number): Promise<{ lat: number; lng: number }> => {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocation not supported'));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          (err) => {
            // POSITION_UNAVAILABLE (2) / kCLErrorLocationUnknown – often temporary on iOS; retry after warm-up
            if (err?.code === 2 && n < maxRetries) {
              setTimeout(() => attempt(n + 1).then(resolve).catch(reject), 3000);
            } else {
              reject(err);
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 30000,       // 30 seconds (helps with kCLErrorLocationUnknown on iOS)
            maximumAge: 300000,   // 5 min - use cached position if recent (e.g. from Time In)
          }
        );
      });
    };
    return attempt(0);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      setCameraError('Could not access camera. Please allow camera permissions.');
      console.error(err);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const capturePhoto = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.srcObject) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    setFaceCheckLoading(true);
    try {
      const faceDetected = await detectFaceInCanvas(canvas);
      if (!faceDetected) {
        toast.error('No face detected. Please position your face in the camera and try again.');
        return;
      }
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setCapturedPhoto(dataUrl);
      canvas.toBlob(
        (blob) => {
          if (blob) setPhotoBlob(blob);
        },
        'image/jpeg',
        0.9
      );
      stopCamera();
    } finally {
      setFaceCheckLoading(false);
    }
  }, [stopCamera]);

  const retakePhoto = useCallback(() => {
    setCapturedPhoto(null);
    setPhotoBlob(null);
    setLocation(null);
    setLocationError(null);
    setWithinRadius(null);
    startCamera();
  }, [startCamera]);

  const fetchLocationAndCheck = useCallback(async () => {
    if (!capturedPhoto || !photoBlob) return;
    setLocationError(null);
    setWithinRadius(null);
    setLocationLoading(true);
    try {
      const loc = await getLocation({ retries: 2 }); // Auto-retry for kCLErrorLocationUnknown / POSITION_UNAVAILABLE
      setLocation(loc);
      const { inside } = isWithinWorkLocation(loc.lat, loc.lng, workLocations);
      setWithinRadius(inside);
    } catch (err: any) {
      const msg = err?.code === 1
        ? 'Location denied. Please allow location access in your browser settings.'
        : err?.code === 2
        ? 'Location unavailable. Move near a window or outdoors and tap Try again.'
        : err?.code === 3
        ? 'Location timed out. Try again or ensure you have a clear view of the sky.'
        : 'Could not get location. Please enable GPS and try again.';
      setLocationError(msg);
      setWithinRadius(false);
    } finally {
      setLocationLoading(false);
    }
  }, [capturedPhoto, photoBlob, getLocation, workLocations]);

  useEffect(() => {
    if (open) {
      setCapturedPhoto(null);
      setPhotoBlob(null);
      setLocation(null);
      setLocationError(null);
      setWithinRadius(null);
      setLocationLoading(false);
      setCameraError(null);
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [open, startCamera, stopCamera]);

  useEffect(() => {
    if (capturedPhoto && photoBlob && !location && !locationError && !locationLoading) {
      fetchLocationAndCheck();
    }
  }, [capturedPhoto, photoBlob, location, locationError, locationLoading, fetchLocationAndCheck]);

  const handleConfirm = async () => {
    if (!photoBlob || !location || withinRadius !== true) return;
    setSubmitting(true);
    try {
      await onConfirm({ photoBlob, lat: location.lat, lng: location.lng });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const canProceed = !!photoBlob && !!location && withinRadius === true;
  const hasNoLocations = workLocations.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[95dvh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6 w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:w-auto sm:max-w-md pb-[max(1rem,env(safe-area-inset-bottom))]">
        <DialogHeader className="space-y-1 sm:space-y-1.5">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Camera className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
            Time {mode === 'in' ? 'In' : 'Out'}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm line-clamp-2 sm:line-clamp-none">
            Take a photo, then we verify your location. Must be within work location.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 sm:space-y-4">
          {!capturedPhoto ? (
            <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1] md:scale-x-100"
              />
              <canvas ref={canvasRef} className="hidden" />
              {cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted/90 p-4">
                  <p className="text-sm text-destructive text-center">{cameraError}</p>
                </div>
              )}
              {!cameraError && (
                <Button
                  type="button"
                  size="lg"
                  className="absolute bottom-4 left-1/2 -translate-x-1/2"
                  onClick={capturePhoto}
                  disabled={faceCheckLoading}
                >
                  {faceCheckLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Checking...
                    </>
                  ) : (
                    <>
                      <Camera className="h-5 w-5 mr-2" /> Capture Photo
                    </>
                  )}
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="relative rounded-lg overflow-hidden border">
                <img src={capturedPhoto} alt="Captured" className="w-full aspect-video object-cover" />
                <Button variant="secondary" size="sm" className="absolute top-2 right-2" onClick={retakePhoto}>
                  Retake
                </Button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-4 rounded-lg border bg-muted/30">
                <div className="flex-shrink-0 flex items-center gap-3 sm:block">
                  {withinRadius === true ? (
                    <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
                      <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                    </div>
                  ) : withinRadius === false ? (
                    <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                      <XCircle className="h-7 w-7 text-red-600" />
                    </div>
                  ) : locationError ? (
                    <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
                      <XCircle className="h-7 w-7 text-amber-600" />
                    </div>
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4" /> Location
                  </p>
                  {location && (
                    <p className="text-sm text-muted-foreground font-mono truncate">
                      {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                    </p>
                  )}
                  {withinRadius === true && (
                    <p className="text-sm text-emerald-600 font-medium mt-1">Within work location — You can proceed</p>
                  )}
                  {withinRadius === false && !hasNoLocations && (
                    <p className="text-sm text-red-600 font-medium mt-1">Outside work location — Cannot proceed</p>
                  )}
                  {locationError && (
                    <div className="mt-1 space-y-2">
                      <p className="text-sm text-amber-600 font-medium">{locationError}</p>
                      <Button variant="outline" size="sm" onClick={() => { setLocationError(null); fetchLocationAndCheck(); }} disabled={locationLoading}>
                        {locationLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        Try again
                      </Button>
                    </div>
                  )}
                  {hasNoLocations && (
                    <p className="text-sm text-amber-600 font-medium mt-1">No work locations assigned — Contact admin</p>
                  )}
                </div>
              </div>

              {(() => {
                const isAnywhere = workLocations.some((l) => l.allow_anywhere);
                const hasWorkLocationsWithCoords = workLocations.some(
                  (l) => !l.allow_anywhere && l.latitude != null && l.longitude != null && l.radius_meters != null
                );
                // Show map when we have user location (anywhere or specific), or work-location circles + GPS error
                const showMap = !!location || (hasWorkLocationsWithCoords && !!locationError);
                if (!showMap) return null;
                return (
                  <LocationMap
                    userLocation={location}
                    workLocations={workLocations}
                    withinRadius={withinRadius}
                    isAnywhere={isAnywhere}
                    className="mt-4"
                  />
                );
              })()}
            </>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canProceed || submitting}
            title={!canProceed && withinRadius === false ? 'You must be within your work location to proceed' : undefined}
            className={!canProceed && withinRadius === false ? 'opacity-60 cursor-not-allowed' : ''}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirm Time {mode === 'in' ? 'In' : 'Out'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
