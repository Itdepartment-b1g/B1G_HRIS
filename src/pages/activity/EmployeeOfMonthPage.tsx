import { useState, useEffect, useCallback } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Award, Loader2, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { getAvatarFallback } from '@/lib/utils';

interface EmployeeOption {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

const EmployeeOfMonthPage = () => {
  const { user: currentUser } = useCurrentUser();
  const isAdmin = currentUser?.roles?.some((r) => ['super_admin', 'admin'].includes(r));

  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [currentEotm, setCurrentEotm] = useState<EmployeeOption | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [employeeComboboxOpen, setEmployeeComboboxOpen] = useState(false);

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId);

  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase
      .from('employees')
      .select('id, first_name, last_name, avatar_url')
      .eq('is_active', true)
      .order('first_name');
    setEmployees(data || []);
  }, []);

  const fetchEotm = useCallback(async () => {
    const firstOfMonth = `${selectedMonth}-01`;
    const { data } = await supabase
      .from('employee_of_the_month')
      .select('employee_id, employee:employees!employee_id(id, first_name, last_name, avatar_url)')
      .eq('for_month', firstOfMonth)
      .maybeSingle();

    if (data?.employee) {
      const emp = data.employee as { id: string; first_name: string; last_name: string; avatar_url: string | null };
      setCurrentEotm({
        id: emp.id,
        first_name: emp.first_name,
        last_name: emp.last_name,
        avatar_url: emp.avatar_url,
      });
      setSelectedEmployeeId(emp.id);
    } else {
      setCurrentEotm(null);
      setSelectedEmployeeId(null);
    }
  }, [selectedMonth]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    setLoading(true);
    fetchEotm().finally(() => setLoading(false));
  }, [fetchEotm]);

  const handleSave = async () => {
    if (!selectedEmployeeId) {
      toast.error('Please select an employee');
      return;
    }
    setSaving(true);
    const firstOfMonth = `${selectedMonth}-01`;
    const { error } = await supabase
      .from('employee_of_the_month')
      .upsert(
        { employee_id: selectedEmployeeId, for_month: firstOfMonth },
        { onConflict: 'for_month' }
      );
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Employee of the Month updated');
      fetchEotm();
    }
  };

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <p className="text-muted-foreground">You do not have permission to manage Employee of the Month.</p>
      </div>
    );
  }

  const monthLabel = selectedMonth
    ? format(new Date(selectedMonth + '-01'), 'MMMM yyyy')
    : '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Employee of the Month</h1>
        <p className="text-muted-foreground mt-1">Select the employee to feature at the top of the dashboard feed</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-6 w-6 text-primary" />
            Set Employee of the Month
          </CardTitle>
          <CardDescription>
            This employee will appear in a pinned card above All Feeds for the selected month. Uses their profile avatar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Month</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => {
                    const d = new Date();
                    d.setMonth(d.getMonth() - i);
                    const v = format(d, 'yyyy-MM');
                    return (
                      <SelectItem key={v} value={v}>
                        {format(new Date(v + '-01'), 'MMMM yyyy')}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Employee</Label>
              <Popover open={employeeComboboxOpen} onOpenChange={setEmployeeComboboxOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    role="combobox"
                    disabled={loading}
                    className={cn(
                      "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                      !selectedEmployee && "text-muted-foreground"
                    )}
                  >
                    {selectedEmployee ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={selectedEmployee.avatar_url ?? undefined} alt="" />
                          <AvatarFallback className="text-[10px]">
                            {getAvatarFallback(selectedEmployee.first_name, selectedEmployee.last_name)}
                          </AvatarFallback>
                        </Avatar>
                        {selectedEmployee.first_name} {selectedEmployee.last_name}
                      </div>
                    ) : (
                      "Select employee"
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command filter={(value, search) => {
                    if (!search) return 1;
                    const s = search.toLowerCase();
                    const name = `${value} `.toLowerCase();
                    return name.includes(s) ? 1 : 0;
                  }}>
                    <CommandInput placeholder="Search employee..." />
                    <CommandList>
                      <CommandEmpty>No employee found.</CommandEmpty>
                      <CommandGroup>
                        {employees.map((e) => {
                          const fullName = `${e.first_name} ${e.last_name}`;
                          return (
                            <CommandItem
                              key={e.id}
                              value={fullName}
                              onSelect={() => {
                                setSelectedEmployeeId(e.id);
                                setEmployeeComboboxOpen(false);
                              }}
                            >
                              <div className="flex items-center gap-2 flex-1">
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={e.avatar_url ?? undefined} alt="" />
                                  <AvatarFallback className="text-[10px]">
                                    {getAvatarFallback(e.first_name, e.last_name)}
                                  </AvatarFallback>
                                </Avatar>
                                {fullName}
                              </div>
                              {selectedEmployeeId === e.id ? (
                                <Check className="ml-auto h-4 w-4 opacity-100" />
                              ) : null}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving || !selectedEmployeeId}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
          {currentEotm && (
            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground mb-2">Currently set for {monthLabel}:</p>
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={currentEotm.avatar_url ?? undefined} alt="" />
                  <AvatarFallback>{getAvatarFallback(currentEotm.first_name, currentEotm.last_name)}</AvatarFallback>
                </Avatar>
                <span className="font-medium">{currentEotm.first_name} {currentEotm.last_name}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EmployeeOfMonthPage;
