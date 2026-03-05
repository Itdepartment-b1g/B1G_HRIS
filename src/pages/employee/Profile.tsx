import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const EmployeeProfile = () => {
  const { user: currentUser } = useCurrentUser();

  if (!currentUser) return null;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-black">My Profile</h1>
        <p className="text-gray-600 text-sm mt-1">View and manage your personal information</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarFallback className="bg-primary/10 text-primary text-2xl font-semibold">
                {currentUser.first_name[0]}{currentUser.last_name[0]}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-xl font-semibold text-black">
                {currentUser.first_name} {currentUser.last_name}
              </h2>
              <p className="text-gray-600">{currentUser.position || '—'}</p>
              <p className="text-sm text-gray-500 font-mono">{currentUser.employee_code}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-sm font-medium text-gray-600">Email</label>
              <p className="text-black mt-1">{currentUser.email}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Phone</label>
              <p className="text-black mt-1">{currentUser.phone || '—'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Department</label>
              <p className="text-black mt-1">{currentUser.department || '—'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Role</label>
              <p className="text-black mt-1 capitalize">{(currentUser.role || 'employee').replace('_', ' ')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmployeeProfile;
