import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getAvatarFallback } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Settings, LogOut } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/lib/supabase';

const ProfilePage = () => {
  const navigate = useNavigate();
  const { user: currentUser } = useCurrentUser();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  if (!currentUser) return null;

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24">
      <div>
        <h1 className="text-2xl font-bold text-black">Profile</h1>
        <p className="text-gray-600 text-sm mt-1">Your account information</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src={currentUser?.avatar_url ?? undefined} alt="" />
              <AvatarFallback className="bg-primary/10 text-primary text-2xl font-semibold">
                {getAvatarFallback(currentUser.first_name, currentUser.last_name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-xl font-semibold text-black">
                {currentUser.first_name} {currentUser.last_name}
              </h2>
              <p className="text-gray-600">{currentUser.position || '—'}</p>
              <p className="text-sm text-primary font-mono mt-0.5">{currentUser.employee_code}</p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500">Email</label>
              <p className="text-black">{currentUser.email}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Department</label>
              <p className="text-black">{currentUser.department || '—'}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Role</label>
              <p className="text-black capitalize">{(currentUser.role || 'employee').replace('_', ' ')}</p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2">
            <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/dashboard/settings')}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start text-red-600 border-red-200 hover:bg-red-50"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfilePage;
