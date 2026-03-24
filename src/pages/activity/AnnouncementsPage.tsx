import ActivityAnnouncementsTab from './ActivityAnnouncementsTab';

const AnnouncementsPage = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold text-foreground">Announcements</h1>
      <p className="text-muted-foreground mt-1">Company announcements and updates</p>
    </div>
    <ActivityAnnouncementsTab />
  </div>
);

export default AnnouncementsPage;
