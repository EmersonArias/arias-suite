import type { AriasAuthService } from './types'
import { supabaseAuthProvider } from './providers/supabaseAuthProvider'

export type {
  AriasSession,
  AriasUser,
  AuthResult,
  AuthStateListener,
  AuthSubscription,
  AriasAuthService,
} from './types'

/**
 * Arias Suite depends on this interface, not on a specific auth provider.
 * Replace the provider here when the authentication backend changes.
 */
export const ariasAuth: AriasAuthService = supabaseAuthProvider
