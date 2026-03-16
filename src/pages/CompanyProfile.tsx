import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Building2, Loader2, Save } from 'lucide-react';
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

  const canEdit = user?.roles?.some((r) => r === 'super_admin' || r === 'admin') ?? false;

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('company_profile')
      .select('id, name, address, phone, email, mobile_number, telephone_number, vision, mission, core_values')
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
      const payload = {
        name: formName.trim(),
        address: formAddress.trim(),
        mobile_number: formMobile.trim() || null,
        telephone_number: formTelephone.trim() || null,
        email: formEmail.trim(),
        vision: formVision.trim() || null,
        mission: formMission.trim() || null,
        core_values: formCoreValues.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (profile?.id) {
        const { error } = await supabase
          .from('company_profile')
          .update(payload)
          .eq('id', profile.id);
        if (error) throw error;
        toast.success('Company profile updated');
      } else {
        const { error } = await supabase
          .from('company_profile')
          .insert(payload);
        if (error) throw error;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Company Profile</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {canEdit ? 'Manage company information' : 'View company information'}
          </p>
        </div>
        {canEdit && (
          <Button type="submit" form="company-profile-form" disabled={saving} className="bg-primary hover:bg-primary/90 text-white">
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        )}
      </div>

      <form id="company-profile-form" onSubmit={handleSave}>
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
          </CardContent>
        </Card>
      </form>
    </div>
  );
};

export default CompanyProfile;
