/**
 * Edge Functions Helper Library
 * 
 * This module provides typed helper functions for calling Supabase Edge Functions.
 * All functions require proper environment variables to be set in .env file.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Check if Supabase credentials are configured
 */
function checkCredentials() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase credentials not configured. Please check your .env file.');
  }
}

/**
 * Generic fetch wrapper for Edge Functions
 */
async function callEdgeFunction<T>(
  functionName: string,
  body?: Record<string, any>
): Promise<T> {
  checkCredentials();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to call ${functionName}`);
  }

  return response.json();
}

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export type UserRole = 'employee' | 'intern' | 'supervisor' | 'manager' | 'executive' | 'admin' | 'super_admin';

export interface CreateUserData {
  email: string;
  password?: string; // Optional - if omitted, a random password is generated and emailed to the user
  employee_code: string;
  first_name: string;
  last_name: string;
  phone?: string;
  department?: string;
  position?: string;
  role?: UserRole;
  hired_date?: string; // YYYY-MM-DD format
}

export interface CreateUserResponse {
  success: boolean;
  user: {
    id: string;
    email: string;
    employee_code: string;
    first_name: string;
    last_name: string;
    role: UserRole;
  };
}

export interface ResetPasswordData {
  email?: string;
  user_id?: string;
  new_password: string;
}

export interface ResetPasswordResponse {
  success: boolean;
  message: string;
  user_id: string;
}

export interface UpdateUserProfileData {
  email?: string;
  user_id?: string;
  employee_code?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  department?: string;
  position?: string;
  supervisor_id?: string;
  is_active?: boolean;
  hired_date?: string;
  avatar_url?: string;
  role?: UserRole;
}

export interface UpdateUserProfileResponse {
  success: boolean;
  message: string;
  user: {
    id: string;
    employee_code: string;
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    department?: string;
    position?: string;
    role: UserRole;
    [key: string]: any;
  };
}

export interface DeleteUserResponse {
  success: boolean;
  message: string;
  user_id: string;
}

export interface SeedDatabaseResponse {
  success: boolean;
  created_users: Array<{
    email: string;
    employee_code: string;
    role: UserRole;
  }>;
  errors: Array<{
    email: string;
    error: string;
  }>;
  company_profile: any;
  departments: any[];
  announcements: any[];
}

// ============================================================
// EDGE FUNCTION HELPERS
// ============================================================

/**
 * Get email for an employee code (for login). Uses Edge Function with service role.
 */
export async function getEmailByEmployeeCode(employeeCode: string): Promise<{ email: string }> {
  const trimmed = employeeCode?.trim();
  if (!trimmed) throw new Error('Employee code is required');
  return callEdgeFunction<{ email: string }>('get-email-by-employee-code', { employee_code: trimmed });
}

/**
 * Seed the database with sample data
 * 
 * Creates:
 * - Company profile
 * - 6 departments
 * - 10 employees (1 super admin, 1 admin, 1 supervisor, 7 employees)
 * - 7 days of attendance records
 * - Sample announcements
 * 
 * @returns Promise with seed results
 * 
 * @example
 * const result = await seedDatabase();
 * console.log(`Created ${result.created_users.length} users`);
 */
export async function seedDatabase(): Promise<SeedDatabaseResponse> {
  return callEdgeFunction<SeedDatabaseResponse>('seed-database');
}

export interface SeedAttendanceResponse {
  success: boolean;
  records_created: number;
  employees_count: number;
  days_covered: number;
  errors?: string[];
}

/**
 * Seed attendance_records with 1 month of data for all employees (weekdays only).
 * Skips dates that already have records.
 */
export async function seedAttendance(): Promise<SeedAttendanceResponse> {
  return callEdgeFunction<SeedAttendanceResponse>('seed-attendance');
}

/**
 * Create a new user with authentication and employee profile
 * 
 * @param data - User creation data
 * @returns Promise with created user data
 * 
 * @example
 * const user = await createUser({
 *   email: 'newuser@b1gcorp.com',
 *   password: 'password123',
 *   employee_code: 'EMP-011',
 *   first_name: 'New',
 *   last_name: 'User',
 *   department: 'IT Department',
 *   position: 'Developer',
 *   role: 'employee'
 * });
 */
export async function createUser(data: CreateUserData): Promise<CreateUserResponse> {
  // Validate required fields (password is optional - backend generates and emails it)
  if (!data.email || !data.employee_code || !data.first_name || !data.last_name) {
    throw new Error('Missing required fields: email, employee_code, first_name, last_name');
  }

  return callEdgeFunction<CreateUserResponse>('create-user', data);
}

/**
 * Reset a user's password
 * 
 * @param identifier - User identifier (email or user_id)
 * @param newPassword - New password
 * @returns Promise with success message
 * 
 * @example
 * // By email
 * await resetPassword({ email: 'user@b1gcorp.com' }, 'newpassword123');
 * 
 * // By user ID
 * await resetPassword({ user_id: 'uuid-here' }, 'newpassword123');
 */
export async function resetPassword(
  identifier: { email?: string; user_id?: string },
  newPassword: string
): Promise<ResetPasswordResponse> {
  if (!identifier.email && !identifier.user_id) {
    throw new Error('Must provide either email or user_id');
  }

  if (!newPassword) {
    throw new Error('new_password is required');
  }

  return callEdgeFunction<ResetPasswordResponse>('reset-password', {
    ...identifier,
    new_password: newPassword,
  });
}

/**
 * Update a user's profile information
 * 
 * @param identifier - User identifier (email or user_id)
 * @param updates - Fields to update
 * @returns Promise with updated user data
 * 
 * @example
 * const user = await updateUserProfile(
 *   { email: 'user@b1gcorp.com' },
 *   {
 *     position: 'Senior Developer',
 *     phone: '+63-917-9999999',
 *     department: 'IT Department'
 *   }
 * );
 */
export async function updateUserProfile(
  identifier: { email?: string; user_id?: string },
  updates: Omit<UpdateUserProfileData, 'email' | 'user_id'>
): Promise<UpdateUserProfileResponse> {
  if (!identifier.email && !identifier.user_id) {
    throw new Error('Must provide either email or user_id');
  }

  return callEdgeFunction<UpdateUserProfileResponse>('update-user-profile', {
    ...identifier,
    ...updates,
  });
}

/**
 * Delete a user by their user ID
 *
 * Removes from auth.users (cascades to employees, user_roles).
 * Clears supervisor/department head references first.
 */
export async function deleteUser(userId: string): Promise<DeleteUserResponse> {
  if (!userId) {
    throw new Error('user_id is required');
  }
  return callEdgeFunction<DeleteUserResponse>('delete-user', { user_id: userId });
}

// ============================================================
// CONVENIENCE HELPERS
// ============================================================

/**
 * Create multiple users at once
 * 
 * @param users - Array of user data
 * @returns Promise with results for each user
 * 
 * @example
 * const results = await createMultipleUsers([
 *   { email: 'user1@b1gcorp.com', password: 'pass123', ... },
 *   { email: 'user2@b1gcorp.com', password: 'pass123', ... }
 * ]);
 */
export async function createMultipleUsers(
  users: CreateUserData[]
): Promise<Array<{ success: boolean; user?: CreateUserResponse; error?: string }>> {
  const results = await Promise.allSettled(
    users.map(userData => createUser(userData))
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return { success: true, user: result.value };
    } else {
      return {
        success: false,
        error: result.reason?.message || 'Unknown error',
      };
    }
  });
}

/**
 * Reset password by employee code
 * 
 * @param employeeCode - Employee code
 * @param newPassword - New password
 * @returns Promise with success message
 * 
 * @example
 * await resetPasswordByEmployeeCode('EMP-004', 'newpassword123');
 */
export async function resetPasswordByEmployeeCode(
  employeeCode: string,
  newPassword: string
): Promise<ResetPasswordResponse> {
  // Note: This requires a custom Edge Function or you need to fetch the user_id first
  // For now, this is a placeholder that throws an error
  throw new Error(
    'resetPasswordByEmployeeCode requires fetching user by employee code first. ' +
    'Use resetPassword with email or user_id instead.'
  );
}

/**
 * Update user by employee code
 * 
 * @param employeeCode - Employee code
 * @param updates - Fields to update
 * @returns Promise with updated user data
 * 
 * @example
 * await updateUserByEmployeeCode('EMP-004', { position: 'Senior Developer' });
 */
export async function updateUserByEmployeeCode(
  employeeCode: string,
  updates: Omit<UpdateUserProfileData, 'email' | 'user_id' | 'employee_code'>
): Promise<UpdateUserProfileResponse> {
  // Note: This requires a custom Edge Function or you need to fetch the user_id first
  throw new Error(
    'updateUserByEmployeeCode requires fetching user by employee code first. ' +
    'Use updateUserProfile with email or user_id instead.'
  );
}
