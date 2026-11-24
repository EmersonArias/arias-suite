import { supabase } from '../../lib/supabase'

export type AccessResult = {
  allowed: boolean
  error: Error | null
}

export const ariasAccess = {
  async hasSuiteAccess(): Promise<AccessResult> {
    const { data, error } = await supabase.rpc('has_suite_access')

    return {
      allowed: data === true,
      error: error ? new Error(error.message) : null,
    }
  },
}
