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

export interface SupervisorCreateInput {
  email: string
  full_name: string
  phone?: string | null
  password: string
  department_id: number
  designation?: string | null
}

export interface SupervisorUpdateInput {
  email?: string
  full_name?: string
  phone?: string | null
  department_id?: number
  designation?: string | null
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

// ---------------------------------------------------------------------------------------- penalties

export type Severity = 'low' | 'medium' | 'high' | 'critical'
export type PenaltyAction = 'verbal_warning' | 'written_warning' | 'fine' | 'suspension' | 'other'
export type EmailStatus = 'pending' | 'sent' | 'failed' | 'not_configured'
export type PenaltyReason =
  | 'missing_hairnet'
  | 'missing_gloves'
  | 'missing_mask'
  | 'missing_apron'
  | 'uniform_violation'
  | 'weapon_not_carried'
  | 'left_duty_zone'
  | 'other'

export interface PersonRef {
  id: string
  full_name: string
  email: string
  employee_code: string | null
}

export interface Penalty {
  id: string
  employee: PersonRef
  issued_by: PersonRef
  department: Department
  reason: PenaltyReason
  reason_label: string
  severity: Severity
  action: PenaltyAction
  action_label: string
  amount_pkr: number | null
  suspension_days: number | null
  notes: string | null
  email_status: EmailStatus
  email_sent_at: string | null
  created_at: string
}

export interface PenaltyCreateInput {
  employee_id: string
  reason: PenaltyReason
  severity: Severity
  action: PenaltyAction
  amount_pkr?: number
  suspension_days?: number
  notes?: string
}

export interface PenaltyListParams {
  search?: string
  severity?: Severity
  employee_id?: string
  page?: number
  page_size?: number
}

/** Which reasons apply to which section (mirrors the API; the API enforces it). */
export const REASONS_BY_DEPARTMENT: Record<Department['code'], PenaltyReason[]> = {
  bakery: ['missing_hairnet', 'missing_gloves', 'missing_mask', 'missing_apron', 'other'],
  meat_shop: ['missing_hairnet', 'missing_gloves', 'missing_mask', 'missing_apron', 'other'],
  security: ['uniform_violation', 'weapon_not_carried', 'left_duty_zone', 'other'],
}

export const REASON_LABELS: Record<PenaltyReason, string> = {
  missing_hairnet: 'Hairnet not worn',
  missing_gloves: 'Gloves not worn',
  missing_mask: 'Mask not worn',
  missing_apron: 'Apron not worn',
  uniform_violation: 'Uniform violation',
  weapon_not_carried: 'Weapon not carried',
  left_duty_zone: 'Left assigned duty zone',
  other: 'Other',
}

export const ACTION_LABELS: Record<PenaltyAction, string> = {
  verbal_warning: 'Verbal warning',
  written_warning: 'Written warning',
  fine: 'Fine (PKR)',
  suspension: 'Suspension',
  other: 'Other action',
}
