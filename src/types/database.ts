export type TaskCategory = 'Opening' | 'Cleaning' | 'Setup' | 'Prep' | 'Closing' | 'Other'
export type TaskFrequency = 'daily'
export type LogStatus = 'pending' | 'done' | 'missed'
export type UserRole = 'employee' | 'manager' | 'admin'

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

export interface Task {
  id: string
  title: string
  description: string | null
  category: TaskCategory
  scheduled_time: string   // "HH:MM"
  frequency: TaskFrequency
  active: boolean
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
