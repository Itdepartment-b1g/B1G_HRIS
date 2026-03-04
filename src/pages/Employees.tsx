import { employees } from '@/data/mockData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const Employees = () => {
  const roleBadge = (role: string) => {
    const styles: Record<string, string> = {
      super_admin: 'bg-primary/10 text-primary border-primary/20',
      admin: 'bg-info/10 text-info border-info/20',
      supervisor: 'bg-accent/10 text-accent border-accent/20',
      employee: 'bg-secondary text-secondary-foreground',
    };
    return <Badge variant="outline" className={styles[role] || ''}>{role.replace('_', ' ')}</Badge>;
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Employees</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage company employees and their roles</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Employees ({employees.length})</CardTitle>
        </CardHeader>
        <CardContent>
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
              {employees.map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {emp.first_name[0]}{emp.last_name[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{emp.first_name} {emp.last_name}</p>
                        <p className="text-xs text-muted-foreground">{emp.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{emp.employee_code}</TableCell>
                  <TableCell className="text-sm">{emp.department}</TableCell>
                  <TableCell className="text-sm">{emp.position}</TableCell>
                  <TableCell>{roleBadge(emp.role)}</TableCell>
                  <TableCell>
                    <Badge variant={emp.is_active ? "outline" : "secondary"} className={emp.is_active ? 'bg-success/10 text-success border-success/20' : ''}>
                      {emp.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Employees;
