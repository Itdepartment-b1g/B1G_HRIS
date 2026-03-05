-- ============================================================
-- B1G HRIS Attendance System — Supabase SQL Schema
-- Copy and paste this into your Supabase SQL Editor
-- ============================================================

-- 1. ENUMS
-- ============================================================

CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'supervisor', 'employee');
CREATE TYPE public.leave_type AS ENUM ('vacation', 'sick', 'personal', 'maternity', 'paternity');
CREATE TYPE public.leave_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.attendance_status AS ENUM ('present', 'late', 'absent', 'half_day', 'on_leave');
CREATE TYPE public.correction_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.overtime_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.trip_status AS ENUM ('pending', 'approved', 'rejected', 'completed');

-- 2. COMPANY PROFILE
-- ============================================================

CREATE TABLE public.company_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  timezone TEXT DEFAULT 'Asia/Manila',
  work_start_time TIME DEFAULT '08:00:00',
  work_end_time TIME DEFAULT '17:00:00',
  late_threshold_minutes INT DEFAULT 15,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.company_profile ENABLE ROW LEVEL SECURITY;

-- 3. EMPLOYEES (extends auth.users)
-- ============================================================

CREATE TABLE public.employees (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_code TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  department TEXT,
  position TEXT,
  avatar_url TEXT,
  supervisor_id UUID REFERENCES public.employees(id),
  is_active BOOLEAN DEFAULT true,
  hired_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- 4. USER ROLES (separate table for security)
-- ============================================================

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'employee',
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 5. ATTENDANCE RECORDS
-- ============================================================

CREATE TABLE public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  time_in TIMESTAMPTZ,
  time_out TIMESTAMPTZ,
  lat_in DOUBLE PRECISION,
  lng_in DOUBLE PRECISION,
  lat_out DOUBLE PRECISION,
  lng_out DOUBLE PRECISION,
  address_in TEXT,
  address_out TEXT,
  status attendance_status DEFAULT 'present',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, date)
);

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- 6. LEAVE REQUESTS
-- ============================================================

CREATE TABLE public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type leave_type NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status leave_status DEFAULT 'pending',
  approved_by UUID REFERENCES public.employees(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- 7. OVERTIME REQUESTS
-- ============================================================

CREATE TABLE public.overtime_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  hours NUMERIC(4,2),
  reason TEXT,
  status overtime_status DEFAULT 'pending',
  approved_by UUID REFERENCES public.employees(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.overtime_requests ENABLE ROW LEVEL SECURITY;

-- 8. BUSINESS TRIPS
-- ============================================================

CREATE TABLE public.business_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  purpose TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status trip_status DEFAULT 'pending',
  approved_by UUID REFERENCES public.employees(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.business_trips ENABLE ROW LEVEL SECURITY;

-- 9. ATTENDANCE CORRECTIONS
-- ============================================================

CREATE TABLE public.attendance_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id UUID NOT NULL REFERENCES public.attendance_records(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  original_time_in TIMESTAMPTZ,
  original_time_out TIMESTAMPTZ,
  corrected_time_in TIMESTAMPTZ,
  corrected_time_out TIMESTAMPTZ,
  reason TEXT NOT NULL,
  status correction_status DEFAULT 'pending',
  approved_by UUID REFERENCES public.employees(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.attendance_corrections ENABLE ROW LEVEL SECURITY;

-- 10. ANNOUNCEMENTS
-- ============================================================

CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id UUID NOT NULL REFERENCES public.employees(id),
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- 11. DEPARTMENTS (optional, for org chart)
-- ============================================================

CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  head_id UUID REFERENCES public.employees(id),
  parent_department_id UUID REFERENCES public.departments(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SECURITY DEFINER FUNCTION FOR ROLE CHECKS
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Helper: check if user is admin or super_admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'super_admin')
  )
$$;

-- Helper: check if user is supervisor of an employee
CREATE OR REPLACE FUNCTION public.is_supervisor_of(_supervisor_id UUID, _employee_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees
    WHERE id = _employee_id
      AND supervisor_id = _supervisor_id
  )
$$;

-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================

-- EMPLOYEES: Everyone can read active employees, admins can manage
CREATE POLICY "Authenticated users can read employees"
  ON public.employees FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert employees"
  ON public.employees FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update employees"
  ON public.employees FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- USER ROLES: Only super_admin can manage roles
CREATE POLICY "Users can read own role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admin can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- ATTENDANCE: Employees see own, supervisors see team, admins see all
CREATE POLICY "Employees read own attendance"
  ON public.attendance_records FOR SELECT
  TO authenticated
  USING (
    employee_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.is_supervisor_of(auth.uid(), employee_id)
  );

CREATE POLICY "Employees insert own attendance"
  ON public.attendance_records FOR INSERT
  TO authenticated
  WITH CHECK (employee_id = auth.uid());

CREATE POLICY "Employees update own attendance"
  ON public.attendance_records FOR UPDATE
  TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin(auth.uid()));

-- LEAVE REQUESTS: Similar pattern
CREATE POLICY "Employees read own leave or admin reads all"
  ON public.leave_requests FOR SELECT
  TO authenticated
  USING (
    employee_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.is_supervisor_of(auth.uid(), employee_id)
  );

CREATE POLICY "Employees insert own leave"
  ON public.leave_requests FOR INSERT
  TO authenticated
  WITH CHECK (employee_id = auth.uid());

CREATE POLICY "Admins/supervisors update leave"
  ON public.leave_requests FOR UPDATE
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.is_supervisor_of(auth.uid(), employee_id)
  );

-- OVERTIME REQUESTS
CREATE POLICY "Read own or admin overtime"
  ON public.overtime_requests FOR SELECT
  TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin(auth.uid()) OR public.is_supervisor_of(auth.uid(), employee_id));

CREATE POLICY "Insert own overtime"
  ON public.overtime_requests FOR INSERT
  TO authenticated
  WITH CHECK (employee_id = auth.uid());

CREATE POLICY "Admin/supervisor update overtime"
  ON public.overtime_requests FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_supervisor_of(auth.uid(), employee_id));

-- BUSINESS TRIPS
CREATE POLICY "Read own or admin trips"
  ON public.business_trips FOR SELECT
  TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin(auth.uid()) OR public.is_supervisor_of(auth.uid(), employee_id));

CREATE POLICY "Insert own trip"
  ON public.business_trips FOR INSERT
  TO authenticated
  WITH CHECK (employee_id = auth.uid());

CREATE POLICY "Admin/supervisor update trip"
  ON public.business_trips FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_supervisor_of(auth.uid(), employee_id));

-- CORRECTIONS
CREATE POLICY "Read own or admin corrections"
  ON public.attendance_corrections FOR SELECT
  TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin(auth.uid()) OR public.is_supervisor_of(auth.uid(), employee_id));

CREATE POLICY "Insert own correction"
  ON public.attendance_corrections FOR INSERT
  TO authenticated
  WITH CHECK (employee_id = auth.uid());

CREATE POLICY "Admin update correction"
  ON public.attendance_corrections FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ANNOUNCEMENTS: Everyone reads, admins create
CREATE POLICY "All authenticated read announcements"
  ON public.announcements FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage announcements"
  ON public.announcements FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins update announcements"
  ON public.announcements FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- COMPANY PROFILE: Everyone reads, super_admin manages
CREATE POLICY "All read company profile"
  ON public.company_profile FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admin manages company"
  ON public.company_profile FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- DEPARTMENTS: Everyone reads, admins manage
CREATE POLICY "All read departments"
  ON public.departments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage departments"
  ON public.departments FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ============================================================
-- LOOKUP EMAIL BY EMPLOYEE CODE (for login, accessible by anon)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_email_by_employee_code(code TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM employees WHERE employee_code = code LIMIT 1;
$$;

-- ============================================================
-- AUTO-CREATE EMPLOYEE PROFILE ON SIGNUP (trigger)
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.employees (id, employee_code, first_name, last_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'employee_code', 'EMP-' || SUBSTR(NEW.id::text, 1, 6)),
    COALESCE(NEW.raw_user_meta_data->>'first_name', 'New'),
    COALESCE(NEW.raw_user_meta_data->>'last_name', 'Employee'),
    NEW.email
  );
  
  -- Default role: employee
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'employee');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================

CREATE INDEX idx_attendance_employee_date ON public.attendance_records(employee_id, date);
CREATE INDEX idx_attendance_date ON public.attendance_records(date);
CREATE INDEX idx_leave_employee ON public.leave_requests(employee_id);
CREATE INDEX idx_leave_status ON public.leave_requests(status);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX idx_employees_code ON public.employees(employee_code);
CREATE INDEX idx_employees_supervisor ON public.employees(supervisor_id);
