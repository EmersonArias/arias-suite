export type AriasUser = {
  id: string
  email: string | null
  fullName: string | null
  loginIdentifier: string | null
  emailConfirmedAt: string | null
}

export type AriasSession = {
  user: AriasUser
  accessToken: string
}

export type AuthResult<T> = {
  data: T | null
  error: Error | null
}

export type AuthStateListener = (session: AriasSession | null) => void

export type AuthSubscription = {
  unsubscribe: () => void
}

export interface AriasAuthService {
  getSession(): Promise<AuthResult<AriasSession>>
  signIn(identifier: string, password: string): Promise<AuthResult<AriasSession>>
  signOut(): Promise<AuthResult<null>>
  requestPasswordReset(email: string): Promise<AuthResult<null>>
  updatePassword(password: string): Promise<AuthResult<null>>
  updateProfile(fullName: string): Promise<AuthResult<null>>
  activateAccount(): Promise<AuthResult<boolean>>
  activateAccountWithCode(
    loginIdentifier: string,
    activationCode: string,
    password: string,
  ): Promise<AuthResult<AriasSession>>
  onAuthStateChange(listener: AuthStateListener): AuthSubscription
  isProfileActive(userId: string): Promise<AuthResult<boolean>>
}
