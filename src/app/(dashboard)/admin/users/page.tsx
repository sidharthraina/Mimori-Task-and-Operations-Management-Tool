import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import AdminUsersClient from '@/components/admin/AdminUsersClient'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/admin')

  const [{ data: users }, { data: stores }, { data: assignments }] = await Promise.all([
    supabase.from('users').select('*').order('name'),
    supabase.from('stores').select('*').order('created_at'),
    supabase.from('user_store_assignments').select('user_id, store_id'),
  ])

  // Fetch last_sign_in_at from auth.users via service role
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: { users: authUsers } } = await service.auth.admin.listUsers({ perPage: 1000 })

  const usersWithLogin = (users ?? []).map(u => ({
    ...u,
    last_sign_in_at: authUsers?.find(au => au.id === u.id)?.last_sign_in_at ?? null,
  }))

  return (
    <AdminUsersClient
      initialUsers={usersWithLogin}
      stores={stores ?? []}
      initialAssignments={assignments ?? []}
    />
  )
}
