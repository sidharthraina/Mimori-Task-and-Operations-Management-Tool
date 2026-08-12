export type TaskCategory = 'Opening' | 'Cleaning' | 'Setup' | 'Prep' | 'Closing' | 'Other'
export type TaskFrequency = 'daily'
export type LogStatus = 'pending' | 'done' | 'missed'
export type UserRole = 'employee' | 'manager' | 'admin'

export type RecurrenceUnit = 'day' | 'week'
export type EscalationRecipientType = 'assignee' | 'role' | 'specific_user'
export type EscalationTriggerType = 'missed' | 'missing_proof'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  active: boolean
  can_add_tasks: boolean
  notif_individual_missed: boolean
  notif_batched_missed: boolean
  eod_report_time: string        // "HH:MM"
  eod_report_email: string | null
  last_eod_report_date: string | null
  created_at: string
  updated_at: string
}

export interface Store {
  id: string
  name: string
  address: string | null
  color: string
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface UserStoreAssignment {
  user_id: string
  store_id: string
  created_at: string
}

export interface Task {
  id: string
  title: string
  description: string | null
  category: TaskCategory
  scheduled_time: string   // "HH:MM"
  frequency: TaskFrequency // deprecated — superseded by recurrence_* fields, kept for backward compat
  active: boolean
  store_id: string
  recurrence_unit: RecurrenceUnit
  recurrence_interval: number
  recurrence_weekdays: number[] | null   // 0=Sun..6=Sat, only used when recurrence_unit='week'
  recurrence_anchor_date: string         // ISO date
  assigned_user_id: string | null        // soft assignment — informational only, not RLS-enforced
  require_photo: boolean
  require_notes: boolean
  escalation_rule_id: string | null      // null = use the task's store default rule
  created_at: string
  updated_at: string
}

export interface TaskLog {
  id: string
  task_id: string
  log_date: string          // ISO date "YYYY-MM-DD"
  status: LogStatus
  completed_by: string | null
  completed_at: string | null
  photo_url: string | null
  notes: string | null
  created_at: string
}

export interface Notification {
  id: string
  task_id: string
  log_date: string
  message: string
  is_read: boolean
  created_at: string
}

export interface TaskWithLog extends Task {
  task_logs: TaskLog[]
}

export interface TaskLogWithTask extends TaskLog {
  tasks: Task
  users: Pick<User, 'id' | 'name' | 'email'> | null
}

// Admin dashboard summary row
export interface AdminTaskRow {
  log: TaskLog
  task: Task
  employee: Pick<User, 'id' | 'name' | 'email'> | null
}

export interface EscalationRule {
  id: string
  store_id: string
  name: string
  is_default: boolean
  trigger_missed: boolean
  trigger_missing_proof: boolean
  active: boolean
  created_at: string
  updated_at: string
}

export interface EscalationTier {
  id: string
  rule_id: string
  tier_order: number
  delay_minutes: number
  recipient_type: EscalationRecipientType
  recipient_role: UserRole | null
  recipient_user_id: string | null
  created_at: string
}

export interface EscalationNotification {
  id: string
  task_id: string
  log_date: string
  tier_id: string
  recipient_id: string
  trigger_type: EscalationTriggerType
  message: string
  is_read: boolean
  created_at: string
}

export interface EscalationRuleWithTiers extends EscalationRule {
  escalation_tiers: EscalationTier[]
}

export interface BusinessSettings {
  id: number
  business_name: string
  logo_url: string | null
  updated_at: string
}
