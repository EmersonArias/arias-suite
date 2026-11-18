import type { Session as SupabaseSession } from '@supabase/supabase-js'
import { supabase } from '../../../lib/supabase'
import type {
  AriasAuthService,
  AriasSession,
  AuthResult,
  AuthStateListener,
  AuthSubscription,
} from '../types'

function mapSession(session: SupabaseSession | null): AriasSession | null {
  if (!session) return null

  const authEmail = session.user.email ?? null
  const displayEmail =
    authEmail && !authEmail.toLowerCase().startsWith('internal+')
      ? authEmail
      : null

  return {
    user: {
      id: session.user.id,
      email: displayEmail,
      fullName:
        (session.user.user_metadata?.full_name as string | undefined) ??
        (session.user.user_metadata?.name as string | undefined) ??
        null,
      loginIdentifier:
        (session.user.user_metadata?.login_identifier as string | undefined) ?? null,
      emailConfirmedAt: session.user.email_confirmed_at ?? null,
    },
    accessToken: session.access_token,
  }
}

export const supabaseAuthProvider: AriasAuthService = {
  async getSession(): Promise<AuthResult<AriasSession>> {
    const { data, error } = await supabase.auth.getSession()

    return {
      data: mapSession(data.session),
      error: error ? new Error(error.message) : null,
    }
  },

  async signIn(identifier: string, password: string): Promise<AuthResult<AriasSession>> {
    const body = {
      identifier: identifier.trim(),
      password,
    }

    // The custom auth function may be cold-starting or briefly unavailable on
    // the first request. Retry once so a valid login is never rejected just
    // because the first network invocation was transiently unsuccessful.
    let result: { access_token?: string; refresh_token?: string } | null = null
    let invokeError: Error | null = null

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await supabase.functions.invoke('auth-login', { body })

      if (!response.error && response.data?.access_token && response.data?.refresh_token) {
        result = response.data
        invokeError = null
        break
      }

      invokeError = response.error
        ? new Error(response.error.message)
        : new Error('No se ha podido iniciar sesión.')
    }

    if (invokeError || !result?.access_token || !result?.refresh_token) {
      return {
        data: null,
        error: new Error('No se ha podido iniciar sesión. Comprueba el identificador y la contraseña.'),
      }
    }

    let sessionData: SupabaseSession | null = null
    let sessionError: Error | null = null

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await supabase.auth.setSession({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
      })

      if (!response.error && response.data.session) {
        sessionData = response.data.session
        sessionError = null
        break
      }

      sessionError = response.error
        ? new Error(response.error.message)
        : new Error('No se ha podido establecer la sesión.')
    }

    if (sessionError || !sessionData) {
      return {
        data: null,
        error: new Error('No se ha podido establecer la sesión.'),
      }
    }

    if (!sessionData.user.email_confirmed_at) {
      await supabase.auth.signOut()
      return {
        data: null,
        error: new Error('La cuenta todavía no ha sido activada.'),
      }
    }

    return {
      data: mapSession(sessionData),
      error: null,
    }
  },

  async signOut(): Promise<AuthResult<null>> {
    const { error } = await supabase.auth.signOut()

    return {
      data: null,
      error: error ? new Error(error.message) : null,
    }
  },

  async requestPasswordReset(email: string): Promise<AuthResult<null>> {
    const redirectTo = `${window.location.origin}/update-password`
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

    return {
      data: null,
      error: error ? new Error(error.message) : null,
    }
  },

  async updatePassword(password: string): Promise<AuthResult<null>> {
    const { error } = await supabase.auth.updateUser({ password })

    return {
      data: null,
      error: error ? new Error(error.message) : null,
    }
  },

  async updateProfile(fullName: string): Promise<AuthResult<null>> {
    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName.trim() },
    })

    return {
      data: null,
      error: error ? new Error(error.message) : null,
    }
  },

  async activateAccount(): Promise<AuthResult<boolean>> {
    const { data, error } = await supabase.rpc('activate_my_account')

    return {
      data: data ?? false,
      error: error ? new Error(error.message) : null,
    }
  },

  async activateAccountWithCode(
    loginIdentifier: string,
    activationCode: string,
    password: string,
  ): Promise<AuthResult<AriasSession>> {
    const { data: result, error } = await supabase.functions.invoke('activate-account-by-code', {
      body: {
        login_identifier: loginIdentifier.trim().toUpperCase(),
        activation_code: activationCode.trim().toUpperCase(),
        password,
      },
    })

    if (error || !result?.access_token || !result?.refresh_token) {
      return {
        data: null,
        error: new Error(
          error?.message ??
            'No se ha podido validar el código de activación.',
        ),
      }
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
      access_token: result.access_token,
      refresh_token: result.refresh_token,
    })

    if (sessionError || !sessionData.session) {
      return {
        data: null,
        error: new Error('No se ha podido establecer la sesión.'),
      }
    }

    return {
      data: mapSession(sessionData.session),
      error: null,
    }
  },

  onAuthStateChange(listener: AuthStateListener): AuthSubscription {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      listener(mapSession(session))
    })

    return {
      unsubscribe: () => data.subscription.unsubscribe(),
    }
  },

  async isProfileActive(userId: string): Promise<AuthResult<boolean>> {
    const { data, error } = await supabase
      .from('profiles')
      .select('active')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      return {
        data: null,
        error: new Error(error.message),
      }
    }

    return {
      data: data?.active !== false,
      error: null,
    }
  },
}
