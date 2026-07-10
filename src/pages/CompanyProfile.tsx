import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Building2, FileText, Loader2, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCurrentUser } from '@/hooks/useCurrentUser';

interface CompanyProfileData {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  mobile_number: string | null;
  telephone_number: string | null;
  vision: string | null;
  mission: string | null;
  core_values: string | null;
  code_conduct_url: string | null;
  hand_book_url: string | null;
}

const ALLOWED_DOC_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_DOC_MB = 10;
const COMPANY_DOCS_BUCKET = 'company-documents';

function getStoragePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/${COMPANY_DOCS_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length).split('?')[0];
}

async function deleteCompanyDoc(url: string | null | undefined) {
  const path = getStoragePathFromUrl(url);
  if (!path) return;
  const { error } = await supabase.storage.from(COMPANY_DOCS_BUCKET).remove([path]);
  if (error) throw error;
}

const CompanyProfile = () => {
  const { user } = useCurrentUser();
  const [profile, setProfile] = useState<CompanyProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formMobile, setFormMobile] = useState('');
  const [formTelephone, setFormTelephone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formVision, setFormVision] = useState('');
  const [formMission, setFormMission] = useState('');
  const [formCoreValues, setFormCoreValues] = useState('');

  const [codeConductFile, setCodeConductFile] = useState<File | null>(null);
  const [handBookFile, setHandBookFile] = useState<File | null>(null);
  const [removeCodeConduct, setRemoveCodeConduct] = useState(false);
  const [removeHandBook, setRemoveHandBook] = useState(false);

  const canEdit = user?.roles?.some((r) => r === 'super_admin' || r === 'admin') ?? false;

  const validateDoc = (file: File) => {
    if (!ALLOWED_DOC_TYPES.includes(file.type)) {
      toast.error('Use PDF or Word (.doc, .docx)');
      return false;
    }
    if (file.size > MAX_DOC_MB * 1024 * 1024) {
      toast.error(`File must be under ${MAX_DOC_MB}MB`);
      return false;
    }
    return true;
  };

  const uploadCompanyDoc = async (file: File, key: 'code_of_conduct' | 'handbook') => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${key}/${Date.now()}_${safeName}`;
    const { data, error } = await supabase.storage
      .from(COMPANY_DOCS_BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from(COMPANY_DOCS_BUCKET).getPublicUrl(data.path);
    return `${urlData.publicUrl}?v=${Date.now()}`;
  };

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('company_profile')
      .select(
        'id, name, address, phone, email, mobile_number, telephone_number, vision, mission, core_values, code_conduct_url, hand_book_url'
      )
      .limit(1)
      .maybeSingle();

    if (error) {
      toast.error('Failed to load company profile');
      console.error(error);
      setLoading(false);
      return;
    }

    if (data) {
      setProfile(data as CompanyProfileData);
      setFormName(data.name || '');
      setFormAddress(data.address || '');
      setFormMobile(data.mobile_number || '');
      setFormTelephone(data.telephone_number || '');
      setFormEmail(data.email || '');
      setFormVision(data.vision || '');
      setFormMission(data.mission || '');
      setFormCoreValues(data.core_values || '');
    } else {
      setProfile(null);
      setFormName('');
      setFormAddress('');
      setFormMobile('');
      setFormTelephone('');
      setFormEmail('');
      setFormVision('');
      setFormMission('');
      setFormCoreValues('');
    }

    setCodeConductFile(null);
    setHandBookFile(null);
    setRemoveCodeConduct(false);
    setRemoveHandBook(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canEdit) return;
    if (!formName.trim()) {
      toast.error('Company name is required');
      return;
    }
    if (!formAddress.trim()) {
      toast.error('Company address is required');
      return;
    }
    if (!formEmail.trim()) {
      toast.error('Email address is required');
      return;
    }

    setSaving(true);
    try {
      let codeConductUrl = profile?.code_conduct_url ?? null;
      let handBookUrl = profile?.hand_book_url ?? null;

      if (removeCodeConduct) {
        await deleteCompanyDoc(codeConductUrl);
        codeConductUrl = null;
      } else if (codeConductFile) {
        const previousUrl = codeConductUrl;
        codeConductUrl = await uploadCompanyDoc(codeConductFile, 'code_of_conduct');
        if (previousUrl) await deleteCompanyDoc(previousUrl);
      }

      if (removeHandBook) {
        await deleteCompanyDoc(handBookUrl);
        handBookUrl = null;
      } else if (handBookFile) {
        const previousUrl = handBookUrl;
        handBookUrl = await uploadCompanyDoc(handBookFile, 'handbook');
        if (previousUrl) await deleteCompanyDoc(previousUrl);
      }

      const payload = {
        name: formName.trim(),
        address: formAddress.trim(),
        mobile_number: formMobile.trim() || null,
        telephone_number: formTelephone.trim() || null,
        email: formEmail.trim(),
        vision: formVision.trim() || null,
        mission: formMission.trim() || null,
        core_values: formCoreValues.trim() || null,
        code_conduct_url: codeConductUrl,
        hand_book_url: handBookUrl,
        updated_at: new Date().toISOString(),
      };

      if (profile?.id) {
        const { data, error } = await supabase
          .from('company_profile')
          .update(payload)
          .eq('id', profile.id)
          .select();
        if (error) throw error;
        if (!data || (Array.isArray(data) && data.length === 0)) {
          throw new Error('Update failed (no rows updated). Check permissions.');
        }
        toast.success('Company profile updated');
      } else {
        const { data, error } = await supabase
          .from('company_profile')
          .insert(payload)
          .select();
        if (error) throw error;
        if (!data || (Array.isArray(data) && data.length === 0)) {
          throw new Error('Create failed (no rows inserted). Check permissions.');
        }
        toast.success('Company profile created');
      }

      fetchProfile();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const renderField = (
    label: string,
    required: boolean,
    value: string,
    onChange: (v: string) => void,
    placeholder?: string,
    multiline?: boolean
  ) => (
    <div className="space-y-2">
      <Label>
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      {multiline ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={4}
          disabled={!canEdit}
          className="resize-none"
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={!canEdit}
          type={label.toLowerCase().includes('email') ? 'email' : 'text'}
        />
      )}
    </div>
  );

  const renderDocField = (
    label: string,
    currentUrl: string | null | undefined,
    pendingFile: File | null,
    markedForRemoval: boolean,
    onFileSelect: (file: File | null) => void,
    onMarkRemove: () => void,
    onUndoRemove: () => void
  ) => {
    const showCurrent = currentUrl && !pendingFile && !markedForRemoval;

    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        {showCurrent && (
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={currentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              <FileText className="h-4 w-4" />
              View current document
            </a>
            {canEdit && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-destructive hover:text-destructive"
                disabled={saving}
                onClick={onMarkRemove}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Remove
              </Button>
            )}
          </div>
        )}
        {markedForRemoval && (
          <div className="flex items-center gap-2">
            <p className="text-xs text-destructive">Marked for removal (saved when you click Save Changes)</p>
            {canEdit && (
              <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onUndoRemove}>
                Undo
              </Button>
            )}
          </div>
        )}
        {canEdit && (
          <Input
            type="file"
            accept=".pdf,.doc,.docx"
            disabled={saving}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file && validateDoc(file)) onFileSelect(file);
            }}
          />
        )}
        {pendingFile && (
          <p className="text-xs text-muted-foreground">
            Selected: {pendingFile.name} (saved when you click Save Changes)
          </p>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSave}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Company Profile</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {canEdit ? 'Manage company information' : 'View company information'}
            </p>
          </div>
          {canEdit && (
            <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white">
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Company Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              {renderField('Company Name', true, formName, setFormName, 'Official registered company name')}
              {renderField('Company Address', true, formAddress, setFormAddress, 'Main business address')}
              {renderField('Email Address', true, formEmail, setFormEmail, 'Official company email')}
              {renderField('Mobile Number', false, formMobile, setFormMobile, 'Official company mobile contact')}
              {renderField('Telephone Number', false, formTelephone, setFormTelephone, 'Official landline number')}
            </div>

            <div className="space-y-6 pt-4 border-t">
              <h3 className="font-medium text-foreground">Vision, Mission & Values</h3>
              {renderField('Vision', false, formVision, setFormVision, 'Company vision statement', true)}
              {renderField('Mission', false, formMission, setFormMission, 'Company mission statement', true)}
              {renderField('Core Values', false, formCoreValues, setFormCoreValues, 'Company core values', true)}
            </div>

            <div className="space-y-6 pt-4 border-t">
              <h3 className="font-medium text-foreground">Company Documents</h3>
              <div className="grid gap-6 sm:grid-cols-2">
                {renderDocField(
                  'Code of Conduct',
                  profile?.code_conduct_url,
                  codeConductFile,
                  removeCodeConduct,
                  (file) => {
                    setCodeConductFile(file);
                    setRemoveCodeConduct(false);
                  },
                  () => {
                    setRemoveCodeConduct(true);
                    setCodeConductFile(null);
                  },
                  () => setRemoveCodeConduct(false)
                )}
                {renderDocField(
                  'Employee Handbook',
                  profile?.hand_book_url,
                  handBookFile,
                  removeHandBook,
                  (file) => {
                    setHandBookFile(file);
                    setRemoveHandBook(false);
                  },
                  () => {
                    setRemoveHandBook(true);
                    setHandBookFile(null);
                  },
                  () => setRemoveHandBook(false)
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
};

export default CompanyProfile;
