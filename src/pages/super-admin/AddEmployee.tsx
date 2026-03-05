import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { createUser } from '@/lib/edgeFunctions';

const AddEmployee = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    employee_code: '',
    first_name: '',
    last_name: '',
    email: '',
    password: 'password123',
    phone: '',
    department: '',
    position: '',
    role: 'employee',
    hired_date: new Date().toISOString().split('T')[0]
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await createUser(formData);
      
      toast.success(
        `Employee ${result.user.employee_code} created successfully!`,
        { duration: 5000 }
      );
      
      navigate('/super-admin/employees');
    } catch (error) {
      console.error('Error creating employee:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to create employee'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-black">Add New Employee</h1>
          <p className="text-gray-600 text-sm mt-1">Create a new employee account with authentication</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Employee Information
          </CardTitle>
          <CardDescription>
            Fill in the employee details below. A default password will be set.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Personal Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-black border-b pb-2">Personal Information</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="employee_code" className="text-black">
                    Employee Code <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="employee_code"
                    placeholder="EMP-011"
                    value={formData.employee_code}
                    onChange={(e) => handleInputChange('employee_code', e.target.value)}
                    className="border-gray-300 text-black"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-black">
                    Email <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="employee@b1gcorp.com"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="border-gray-300 text-black"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="first_name" className="text-black">
                    First Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="first_name"
                    placeholder="John"
                    value={formData.first_name}
                    onChange={(e) => handleInputChange('first_name', e.target.value)}
                    className="border-gray-300 text-black"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="last_name" className="text-black">
                    Last Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="last_name"
                    placeholder="Doe"
                    value={formData.last_name}
                    onChange={(e) => handleInputChange('last_name', e.target.value)}
                    className="border-gray-300 text-black"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-black">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+63-917-1234567"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    className="border-gray-300 text-black"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hired_date" className="text-black">Hired Date</Label>
                  <Input
                    id="hired_date"
                    type="date"
                    value={formData.hired_date}
                    onChange={(e) => handleInputChange('hired_date', e.target.value)}
                    className="border-gray-300 text-black"
                  />
                </div>
              </div>
            </div>

            {/* Employment Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-black border-b pb-2">Employment Information</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="department" className="text-black">Department</Label>
                  <Select
                    value={formData.department}
                    onValueChange={(value) => handleInputChange('department', value)}
                  >
                    <SelectTrigger className="border-gray-300 text-black">
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Executive">Executive</SelectItem>
                      <SelectItem value="Human Resources">Human Resources</SelectItem>
                      <SelectItem value="IT Department">IT Department</SelectItem>
                      <SelectItem value="Sales">Sales</SelectItem>
                      <SelectItem value="Marketing">Marketing</SelectItem>
                      <SelectItem value="Finance">Finance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="position" className="text-black">Position</Label>
                  <Input
                    id="position"
                    placeholder="Software Developer"
                    value={formData.position}
                    onChange={(e) => handleInputChange('position', e.target.value)}
                    className="border-gray-300 text-black"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role" className="text-black">
                    User Role <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value) => handleInputChange('role', value)}
                  >
                    <SelectTrigger className="border-gray-300 text-black">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">Employee</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-black">Initial Password</Label>
                  <Input
                    id="password"
                    type="text"
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    className="border-gray-300 text-black font-mono"
                    required
                  />
                  <p className="text-xs text-gray-500">User can change this after first login</p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-4 border-t">
              <Button
                type="submit"
                className="bg-primary hover:bg-primary/90 text-white"
                disabled={isLoading}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                {isLoading ? 'Creating Employee...' : 'Create Employee'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(-1)}
                disabled={isLoading}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AddEmployee;
