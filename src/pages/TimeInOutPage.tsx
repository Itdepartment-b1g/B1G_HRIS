import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Camera, MapPin, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/lib/supabase';
import { isWithinWorkLocation, type WorkLocation } from '@/lib/geoUtils';
import { LocationMap } from '@/components/LocationMap';
import { computeAttendanceStatusFromTimeIn, getWeekdayForDate } from '@/lib/attendanceStatus';
import { toast } from 'sonner';

const TimeInOutPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = (searchParams.get('mode') === 'out' ? 'out' : 'in') as 'in' | 'out';

  const { user: currentUser } = useCurrentUser();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [workLocations, setWorkLocations] = useState<WorkLocation[]>([]);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [withinRadius, setWithinRadius] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [clockedIn, setClockedIn] = useState(false);

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
          { enableHighAccuracy: true, timeout: 30000, maximumAge: 300000 }
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
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.srcObject) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedPhoto(dataUrl);
    canvas.toBlob((blob) => blob && setPhotoBlob(blob), 'image/jpeg', 0.9);
    stopCamera();
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
      const loc = await getLocation({ retries: 2 });
      setLocation(loc);
      const { inside } = isWithinWorkLocation(loc.lat, loc.lng, workLocations);
      setWithinRadius(inside);
    } catch (err: any) {
      const msg =
        err?.code === 1
          ? 'Location denied. Please allow location access.'
          : err?.code === 2
          ? 'Location unavailable. Move near a window or outdoors and tap Try again.'
          : err?.code === 3
          ? 'Location timed out. Try again or ensure clear view of sky.'
          : 'Could not get location. Please enable GPS and try again.';
      setLocationError(msg);
      setWithinRadius(false);
    } finally {
      setLocationLoading(false);
    }
  }, [capturedPhoto, photoBlob, getLocation, workLocations]);

  useEffect(() => {
    if (!currentUser?.id) return;
    const load = async () => {
      const { data: ewData } = await supabase
        .from('employee_work_locations')
        .select('work_location_id')
        .eq('employee_id', currentUser.id);
      const wlIds = (ewData || []).map((r) => r.work_location_id);
      if (wlIds.length === 0) {
        setWorkLocations([]);
      } else {
        const { data: wlData } = await supabase
          .from('work_locations')
          .select('id, name, latitude, longitude, radius_meters, allow_anywhere')
          .in('id', wlIds)
          .eq('is_active', true);
        setWorkLocations((wlData || []) as WorkLocation[]);
      }
      const { data: log } = await supabase
        .from('attendance_records')
        .select('time_in, time_out')
        .eq('employee_id', currentUser.id)
        .eq('date', new Date().toISOString().split('T')[0])
        .maybeSingle();
      setClockedIn(!!log?.time_in && !log?.time_out);
    };
    load();
  }, [currentUser?.id]);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  useEffect(() => {
    if (capturedPhoto && photoBlob && !location && !locationError && !locationLoading) {
      fetchLocationAndCheck();
    }
  }, [capturedPhoto, photoBlob, location, locationError, locationLoading, fetchLocationAndCheck]);

  const uploadPhoto = async (blob: Blob, employeeId: string, date: string, m: 'in' | 'out'): Promise<string | null> => {
    const path = `${employeeId}/${date}_time_${m}.jpg`;
    const { data, error } = await supabase.storage.from('attendance-photos').upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (error) return null;
    const { data: urlData } = supabase.storage.from('attendance-photos').getPublicUrl(data.path);
    return urlData.publicUrl;
  };

  const handleConfirm = async () => {
    if (!currentUser || !photoBlob || !location || withinRadius !== true) return;
    if (mode === 'out' && !clockedIn) {
      toast.error('You must clock in first');
      return;
    }
    setSubmitting(true);
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const photoUrl = await uploadPhoto(photoBlob, currentUser.id, today, mode);

      if (mode === 'in') {
        const weekday = getWeekdayForDate(today);
        const [shiftRes, empRes] = await Promise.all([
          supabase.from('employee_shifts').select('shift:shifts(start_time, grace_period_minutes, days)').eq('employee_id', currentUser.id),
          supabase.from('employees').select('late_exempted, grace_period_exempted').eq('id', currentUser.id).single(),
        ]);
        const shifts = (shiftRes.data || []).map((s: any) => s.shift).filter(Boolean);
        const shiftForToday = shifts.find((s: any) => !s.days?.length || s.days.includes(weekday)) || shifts[0];
        const shiftInfo = shiftForToday
          ? { start_time: shiftForToday.start_time || '08:00:00', grace_period_minutes: shiftForToday.grace_period_minutes ?? 15, days: shiftForToday.days }
          : null;
        const exemptions = empRes.data
          ? { late_exempted: empRes.data.late_exempted, grace_period_exempted: empRes.data.grace_period_exempted }
          : undefined;
        const { status, minutesLate } = computeAttendanceStatusFromTimeIn({
          timeInIso: now.toISOString(),
          date: today,
          shift: shiftInfo,
          exemptions,
        });
        await supabase.from('attendance_records').upsert(
          {
            employee_id: currentUser.id,
            date: today,
            time_in: now.toISOString(),
            lat_in: location.lat,
            lng_in: location.lng,
            address_in: null,
            time_in_photo_url: photoUrl,
            status,
            minutes_late: minutesLate,
          },
          { onConflict: 'employee_id,date' }
        );
        const statusMsg = status === 'late' ? ` (Late — ${(minutesLate / 60).toFixed(2)} hrs past start)` : '';
        toast.success(`Time in at ${now.toLocaleTimeString()}${statusMsg}`);
      } else {
        const { data: existing } = await supabase
          .from('attendance_records')
          .select('id')
          .eq('employee_id', currentUser.id)
          .eq('date', today)
          .single();
        if (existing) {
          await supabase
            .from('attendance_records')
            .update({
              time_out: now.toISOString(),
              lat_out: location.lat,
              lng_out: location.lng,
              address_out: null,
              time_out_photo_url: photoUrl,
            })
            .eq('id', existing.id);
        }
        toast.success(`Time out at ${now.toLocaleTimeString()}`);
      }
      navigate('/dashboard');
    } catch {
      toast.error(mode === 'in' ? 'Failed to record time in' : 'Failed to record time out');
    } finally {
      setSubmitting(false);
    }
  };

  const canProceed = !!photoBlob && !!location && withinRadius === true;
  const hasNoLocations = workLocations.length === 0;
  const hasWorkLocationsWithCoords = workLocations.some(
    (l) => !l.allow_anywhere && l.latitude != null && l.longitude != null && l.radius_meters != null
  );
  const showMap = hasWorkLocationsWithCoords && (location || locationError);

  if (!currentUser) return null;

  return (
    <div className="min-h-screen flex flex-col bg-background pb-[env(safe-area-inset-bottom)]">
      {/* Header: Back button + Title */}
      <header className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b bg-background">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold flex-1">
          Time {mode === 'in' ? 'In' : 'Out'}
        </h1>
      </header>

      {!capturedPhoto ? (
        /* Camera view: full screen with circular capture button at bottom center */
        <div className="flex-1 flex flex-col relative">
          <div className="flex-1 relative bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />
            {cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
                <p className="text-sm text-destructive text-center">{cameraError}</p>
              </div>
            )}
          </div>
          {!cameraError && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20">
              <button
                type="button"
                onClick={capturePhoto}
                className="w-20 h-20 rounded-full bg-primary border-4 border-white shadow-lg flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-transform"
              >
                <Camera className="h-10 w-10 text-primary-foreground" />
              </button>
            </div>
          )}
        </div>
      ) : (
        /* After photo: Location at top, Photo + Confirm at bottom */
        <div className="flex-1 flex flex-col overflow-auto">
          {/* Top: Location section */}
          <div className="p-4 space-y-4 border-b">
            <div className="flex items-start gap-3">
              <div className="shrink-0">
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
                  <div className="mt-2 space-y-2">
                    <p className="text-sm text-amber-600 font-medium">{locationError}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setLocationError(null);
                        fetchLocationAndCheck();
                      }}
                      disabled={locationLoading}
                    >
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
            {showMap && (
              <LocationMap
                userLocation={location}
                workLocations={workLocations}
                withinRadius={withinRadius}
                className="mt-2"
              />
            )}
          </div>

          {/* Bottom: Photo + Confirm */}
          <div className="flex-1 flex flex-col justify-end p-4 gap-4">
            <div className="relative rounded-xl overflow-hidden border aspect-square max-w-[200px] mx-auto w-full">
              <img src={capturedPhoto} alt="Captured" className="w-full h-full object-cover" />
              <Button
                variant="secondary"
                size="sm"
                className="absolute top-2 right-2"
                onClick={retakePhoto}
              >
                Retake
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                onClick={handleConfirm}
                disabled={!canProceed || submitting}
                className="w-full"
                size="lg"
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirm Time {mode === 'in' ? 'In' : 'Out'}
              </Button>
              <Button variant="outline" onClick={() => navigate(-1)} disabled={submitting}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeInOutPage;
