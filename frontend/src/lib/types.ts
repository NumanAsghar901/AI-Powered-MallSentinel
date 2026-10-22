export type Role = 'admin' | 'supervisor' | 'employee'
export type UserStatus = 'active' | 'disabled' | 'removed'
export type Shift = 'morning' | 'evening' | 'night'

export interface Department {
  id: number
  code: 'bakery' | 'meat_shop' | 'security'
  name: string
  description: string | null
}

export interface User {
  id: string
  email: string
  full_name: string
  phone: string | null
  role: Role
  status: UserStatus
  auth_provider: 'password' | 'google'
  is_locked: boolean
  last_login_at: string | null
  created_at: string
  department: Department | null
  designation: string | null
  shift: Shift | null
  assigned_area: string | null
  employee_code: string | null
  supervisor_id: string | null
  access_level: string | null
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface TokenResponse {
  access_token: string
  token_type: 'bearer'
  expires_in: number
  user: User
}

export interface UserListParams {
  search?: string
  role?: Role
  status?: UserStatus
  department_id?: number
  page?: number
  page_size?: number
  sort?: 'full_name' | 'email' | 'role' | 'status' | 'created_at' | 'last_login_at'
  order?: 'asc' | 'desc'
}

export interface ProfileFields {
  designation?: string | null
  shift?: Shift | null
  assigned_area?: string | null
  employee_code?: string | null
}

export interface UserCreateInput extends ProfileFields {
  email: string
  full_name: string
  phone?: string | null
  role: 'supervisor' | 'employee'
  password: string
  department_id: number
}

export interface UserUpdateInput extends ProfileFields {
  email?: string
  full_name?: string
  phone?: string | null
  role?: 'supervisor' | 'employee'
  department_id?: number
  password?: string
}

export interface EmployeeCreateInput extends ProfileFields {
  email: string
  full_name: string
  phone?: string | null
  password: string
}

export interface EmployeeUpdateInput extends ProfileFields {
  email?: string
  full_name?: string
  phone?: string | null
  status?: 'active' | 'disabled'
  password?: string
}

export const ROLE_HOME: Record<Role, string> = {
  admin: '/admin',
  supervisor: '/supervisor',
  employee: '/employee',
}
