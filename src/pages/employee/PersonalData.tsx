import { useEffect, useState, useRef, useCallback } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getAvatarFallback } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Loader2, Mail, Phone, Briefcase, Building2, Calendar, Hash, Clock, Users, Camera } from 'lucide-react';
import { toast } from 'sonner';

interface ShiftInfo {
  name: string;
  days: string[];
  start_time: string;
  end_time: string;
}

interface SupervisorInfo {
  first_name: string;
  last_name: string;
  position: string | null;
  avatar_url: string | null;
}

function formatTime(time: string): string {
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}

function formatDays(days: string[]): string {
  if (!days || days.length === 0) return '—';
  if (days.length === 7) return 'Everyday';
  if (days.length === 6 && !days.includes('Sun')) return 'Mon–Sat';
  if (days.length === 5 && !days.includes('Sat') && !days.includes('Sun')) return 'Mon–Fri';
  return days.join(', ');
}

const InfoRow = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) => (
  <div className="flex items-start gap-3 py-3 border-b last:border-0">
    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
      <Icon className="h-4 w-4 text-muted-foreground" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className="text-sm text-foreground mt-0.5 break-words">{value || '—'}</p>
    </div>
  </div>
);

const MAX_AVATAR_SIZE_MB = 2;
const MAX_AVATAR_BYTES = MAX_AVATAR_SIZE_MB * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function getCroppedBlob(
  imageSrc: string,
  pixelCrop: Area,
  maxBytes: number = MAX_AVATAR_BYTES
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  let { width, height } = pixelCrop;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, width, height, 0, 0, width, height);

  let quality = 0.92;
  let blob: Blob | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), 'image/jpeg', quality)
    );
    if (!blob) throw new Error('Could not create blob');
    if (blob.size <= maxBytes) return blob;
    quality -= 0.12;
    if (quality < 0.3) {
      width = Math.floor(width * 0.85);
      height = Math.floor(height * 0.85);
      if (width < 80 || height < 80) return blob;
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, width, height);
      quality = 0.88;
    }
  }
  return blob!;
}

const MAX_RAW_FILE_MB = 10;

const PersonalData = () => {
  const { user, loading, refetch } = useCurrentUser();
  const [shifts, setShifts] = useState<ShiftInfo[]>([]);
  const [supervisor, setSupervisor] = useState<SupervisorInfo | null>(null);
  const [loadingExtra, setLoadingExtra] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  useEffect(() => {
    if (!user) return;

    const loadExtra = async () => {
      setLoadingExtra(true);

      const [shiftsRes, supervisorRes] = await Promise.all([
        supabase
          .from('employee_shifts')
          .select('shifts(name, days, start_time, end_time)')
          .eq('employee_id', user.id),
        user.supervisor_id
          ? supabase
              .from('employees')
              .select('first_name, last_name, position, avatar_url')
              .eq('id', user.supervisor_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const shiftData = (shiftsRes.data || [])
        .map((r: any) => r.shifts)
        .filter(Boolean) as ShiftInfo[];
      setShifts(shiftData);
      setSupervisor((supervisorRes as any).data || null);
      setLoadingExtra(false);
    };

    loadExtra();
  }, [user]);

  const onCropAreaChange = useCallback((_croppedArea: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    e.target.value = '';

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Please use JPEG, PNG, or WebP format');
      return;
    }
    if (file.size > MAX_RAW_FILE_MB * 1024 * 1024) {
      toast.error(`Image must be under ${MAX_RAW_FILE_MB}MB`);
      return;
    }

    const url = URL.createObjectURL(file);
    setCropImageSrc(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setCropDialogOpen(true);
  };

  const handleCropCancel = useCallback(() => {
    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
    setCropDialogOpen(false);
    setCropImageSrc(null);
  }, [cropImageSrc]);

  const handleCropConfirm = async () => {
    if (!cropImageSrc || !croppedAreaPixels || !user) return;
    setUploading(true);
    try {
      const blob = await getCroppedBlob(cropImageSrc, croppedAreaPixels);
      URL.revokeObjectURL(cropImageSrc);
      setCropDialogOpen(false);
      setCropImageSrc(null);

      const path = `${user.id}/avatar.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from('profile-pictures')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from('profile-pictures').getPublicUrl(path);
      const { error: updateErr } = await supabase
        .from('employees')
        .update({ avatar_url: urlData.publicUrl })
        .eq('id', user.id);
      if (updateErr) throw updateErr;

      await refetch();
      toast.success('Profile photo updated');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return null;

  const roleLabel = (user.role || 'employee').replace('_', ' ');
  const startDate = user.hired_date
    ? new Date(user.hired_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Personal Data</h1>
        <p className="text-muted-foreground text-sm mt-1">Your profile and employment information</p>
      </div>

      {/* Profile card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="relative group">
              <Avatar className="h-20 w-20 border-2 border-primary/20">
                <AvatarImage src={user.avatar_url ?? undefined} alt="" />
                <AvatarFallback className="bg-primary/10 text-primary text-2xl font-bold">
                  {getAvatarFallback(user.first_name, user.last_name)}
                </AvatarFallback>
              </Avatar>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileSelect}
                disabled={uploading}
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute bottom-0 right-0 h-8 w-8 rounded-full shadow-md"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                title="Upload photo"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-foreground">
                {user.first_name} {user.last_name}
              </h2>
              <p className="text-muted-foreground text-sm">{user.position || '—'}</p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  {user.employee_code}
                </span>
                <Badge variant="outline" className="capitalize text-xs">
                  {roleLabel}
                </Badge>
                <Badge
                  variant="outline"
                  className={user.is_active
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-gray-50 text-gray-500 border-gray-200'}
                >
                  {user.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Crop dialog — no scale animation so Cropper dimensions render correctly */}
      <Dialog open={cropDialogOpen} onOpenChange={(open) => !open && handleCropCancel()}>
        <DialogContent
          className="max-w-md p-0 gap-0 overflow-hidden [&>button]:top-2 [&>button]:right-2"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={handleCropCancel}
        >
          <DialogHeader className="p-4 pb-2">
            <DialogTitle>Crop profile photo</DialogTitle>
            <DialogDescription>
              Adjust the crop area and zoom. The image will be compressed to fit under {MAX_AVATAR_SIZE_MB}MB.
            </DialogDescription>
          </DialogHeader>
          <div className="relative h-[320px] w-full bg-muted">
            {cropImageSrc && (
              <Cropper
                image={cropImageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropAreaChange={onCropAreaChange}
              />
            )}
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground shrink-0">Zoom</span>
              <Slider
                value={[zoom]}
                onValueChange={([v]) => setZoom(v)}
                min={1}
                max={3}
                step={0.1}
                className="flex-1"
              />
            </div>
          </div>
          <DialogFooter className="p-4 pt-0">
            <Button variant="outline" onClick={handleCropCancel}>
              Cancel
            </Button>
            <Button
              onClick={handleCropConfirm}
              disabled={!croppedAreaPixels || uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading…
                </>
              ) : (
                'Confirm & upload'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Contact Information */}
        <Card>
          <CardContent className="pt-5 pb-2">
            <h3 className="text-sm font-semibold text-foreground mb-1">Contact Information</h3>
            <InfoRow icon={Mail} label="Email" value={user.email} />
            <InfoRow icon={Phone} label="Phone" value={user.phone} />
          </CardContent>
        </Card>

        {/* Employment Details */}
        <Card>
          <CardContent className="pt-5 pb-2">
            <h3 className="text-sm font-semibold text-foreground mb-1">Employment Details</h3>
            <InfoRow icon={Building2} label="Department" value={user.department} />
            <InfoRow icon={Briefcase} label="Position" value={user.position} />
            <InfoRow icon={Hash} label="Employee Code" value={user.employee_code} />
            <InfoRow icon={Calendar} label="Start Date" value={startDate} />
          </CardContent>
        </Card>

        {/* Supervisor */}
        <Card>
          <CardContent className="pt-5 pb-3">
            <h3 className="text-sm font-semibold text-foreground mb-3">Supervisor</h3>
            {loadingExtra ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading...
              </div>
            ) : supervisor ? (
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={supervisor.avatar_url ?? undefined} alt="" />
                  <AvatarFallback className="bg-amber-100 text-amber-700 text-sm font-semibold">
                    {getAvatarFallback(supervisor.first_name, supervisor.last_name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {supervisor.first_name} {supervisor.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground">{supervisor.position || 'Supervisor'}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-muted-foreground">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <Users className="h-4 w-4" />
                </div>
                <p className="text-sm">No supervisor assigned</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Shifts */}
        <Card>
          <CardContent className="pt-5 pb-3">
            <h3 className="text-sm font-semibold text-foreground mb-3">Assigned Shifts</h3>
            {loadingExtra ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading...
              </div>
            ) : shifts.length > 0 ? (
              <div className="space-y-2">
                {shifts.map((shift, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border">
                    <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <Clock className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{shift.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDays(shift.days)} · {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 text-muted-foreground">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <Clock className="h-4 w-4" />
                </div>
                <p className="text-sm">No shifts assigned</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PersonalData;
