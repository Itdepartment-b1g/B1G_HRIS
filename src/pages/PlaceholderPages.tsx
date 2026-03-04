import { Card, CardContent } from '@/components/ui/card';
import { Construction } from 'lucide-react';

const PlaceholderPage = ({ title, description }: { title: string; description: string }) => (
  <div className="space-y-6 max-w-7xl">
    <div>
      <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      <p className="text-muted-foreground text-sm mt-1">{description}</p>
    </div>
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Construction className="h-12 w-12 mb-4" />
        <p className="text-lg font-medium">Coming Soon</p>
        <p className="text-sm mt-1">This module is under development</p>
      </CardContent>
    </Card>
  </div>
);

export const Overtime = () => <PlaceholderPage title="Overtime" description="Manage overtime requests and approvals" />;
export const BusinessTrip = () => <PlaceholderPage title="Business Trip" description="Track and manage business travel requests" />;
export const Correction = () => <PlaceholderPage title="Attendance Correction" description="Submit and review attendance corrections" />;
export const Announcements = () => <PlaceholderPage title="Announcements" description="Company-wide announcements and updates" />;
export const Reports = () => <PlaceholderPage title="Attendance Report" description="Generate attendance reports — lates, undertimes, absences, leave, overtime" />;
export const SettingsPage = () => <PlaceholderPage title="Settings" description="System and company configuration" />;
