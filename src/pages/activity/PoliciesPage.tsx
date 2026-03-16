import ActivityPoliciesTab from './ActivityPoliciesTab';

const PoliciesPage = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold text-foreground">Policy Updates</h1>
      <p className="text-muted-foreground mt-1">Company policies</p>
    </div>
    <ActivityPoliciesTab />
  </div>
);

export default PoliciesPage;
