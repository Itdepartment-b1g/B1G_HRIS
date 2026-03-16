import { useState, useEffect, useCallback } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface TeamMember {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  department: string | null;
  position: string | null;
  is_active: boolean;
  role: string;
}

const SupervisorTeam = () => {
  const { user: currentUser } = useCurrentUser();
  const [searchTerm, setSearchTerm] = useState('');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTeam = useCallback(async () => {
    if (!currentUser?.id) return;
    const [empRes, roleRes] = await Promise.all([
      supabase.from('employees').select('*').eq('supervisor_id', currentUser.id).eq('is_active', true).order('first_name'),
      supabase.from('user_roles').select('user_id, role'),
    ]);
    const roleMap = new Map<string, string>();
    (roleRes.data || []).forEach((r: { user_id: string; role: string }) => roleMap.set(r.user_id, r.role));
    const merged = (empRes.data || []).map((e) => ({ ...e, role: roleMap.get(e.id) || 'employee' }));
    setTeamMembers(merged as TeamMember[]);
    setLoading(false);
  }, [currentUser?.id]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  const filteredTeam = teamMembers.filter(
    (emp) =>
      emp.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employee_code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const roleBadge = (role: string) => (
    <Badge variant="outline" className="bg-gray-100 text-gray-700 border-gray-300">
      {role.replace('_', ' ')}
    </Badge>
  );

  if (!currentUser) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-black">My Team</h1>
        <p className="text-gray-600 text-sm mt-1">View and manage your team members</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Team Members ({filteredTeam.length})</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Search team..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 border-gray-300 text-black"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-gray-500 py-4">Loading...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTeam.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No team members</TableCell>
                  </TableRow>
                ) : (
                  filteredTeam.map((emp) => (
                    <TableRow key={emp.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={emp.avatar_url ?? undefined} alt="" />
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {emp.first_name[0]}{emp.last_name[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-sm text-black">{emp.first_name} {emp.last_name}</p>
                            <p className="text-xs text-gray-600">{emp.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-black">{emp.employee_code}</TableCell>
                      <TableCell className="text-sm text-black">{emp.department || '—'}</TableCell>
                      <TableCell className="text-sm text-black">{emp.position || '—'}</TableCell>
                      <TableCell>{roleBadge(emp.role)}</TableCell>
                      <TableCell>
                        <Badge variant={emp.is_active ? 'outline' : 'secondary'} className={emp.is_active ? 'bg-green-100 text-green-700 border-green-300' : ''}>
                          {emp.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SupervisorTeam;
