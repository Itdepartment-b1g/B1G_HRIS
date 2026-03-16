import { useNavigate } from 'react-router-dom';
import { UserPlus, Search } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface EmpRow {
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

const SuperAdminEmployees = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [employees, setEmployees] = useState<EmpRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEmployees = useCallback(async () => {
    const [empRes, roleRes] = await Promise.all([
      supabase.from('employees').select('*').order('created_at', { ascending: true }),
      supabase.from('user_roles').select('user_id, role'),
    ]);
    const roleMap = new Map<string, string[]>();
    (roleRes.data || []).forEach((r: { user_id: string; role: string }) => {
      const arr = roleMap.get(r.user_id) || [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    });
    const merged = (empRes.data || []).map((e) => {
      const roles = roleMap.get(e.id) || ['employee'];
      return { ...e, roles, role: roles[0] || 'employee' };
    });
    setEmployees(merged as EmpRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const filteredEmployees = employees.filter(
    (emp) =>
      emp.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employee_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const roleBadge = (role: string) => {
    const styles: Record<string, string> = {
      super_admin: 'bg-purple-100 text-purple-700 border-purple-300',
      admin: 'bg-blue-100 text-blue-700 border-blue-300',
      supervisor: 'bg-orange-100 text-orange-700 border-orange-300',
      employee: 'bg-gray-100 text-gray-700 border-gray-300',
      intern: 'bg-gray-100 text-gray-700 border-gray-300',
    };
    return <Badge key={role} variant="outline" className={styles[role] || ''}>{role.replace('_', ' ')}</Badge>;
  };

  const rolesBadges = (emp: { role?: string; roles?: string[] }) => {
    const roles = (emp.roles?.filter(Boolean) ?? []).length > 0 ? (emp.roles ?? []) : [emp.role || 'employee'];
    return (
      <div className="flex flex-wrap gap-1 min-w-[100px]">
        {roles.map((r) => roleBadge(r))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-black">Employee Management</h1>
          <p className="text-gray-600 text-sm mt-1">Manage all company employees and their roles</p>
        </div>
        <Button onClick={() => navigate('/dashboard/employees')} className="bg-primary hover:bg-primary/90 text-white">
          <UserPlus className="h-4 w-4 mr-2" />
          Add Employee
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">All Employees ({filteredEmployees.length})</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Search employees..."
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
                  <TableHead className="min-w-[140px]">Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.map((emp) => (
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
                    <TableCell>{rolesBadges(emp)}</TableCell>
                    <TableCell>
                      <Badge variant={emp.is_active ? 'outline' : 'secondary'} className={emp.is_active ? 'bg-green-100 text-green-700 border-green-300' : 'bg-gray-100 text-gray-600'}>
                        {emp.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80" onClick={() => navigate('/dashboard/employees')}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SuperAdminEmployees;
