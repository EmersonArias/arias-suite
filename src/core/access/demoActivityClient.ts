import { supabase } from '../../lib/supabase'
import { createActivityReporter } from './demoActivityModel'
export const demoActivity = createActivityReporter(async body => {
  const result = await supabase.functions.invoke('record-demo-activity', { body })
  if (result.error) throw result.error
})
