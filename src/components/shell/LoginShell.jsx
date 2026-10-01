import { useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { consumeGoogleOAuthCallback, getStoredUser, hasSession, login, startGoogleLogin, verifyPin } from '../../services/api'
import { useClock } from './DesktopDock'

export function CompanyContextLoading() {
  return (
    <main className="screen company-context-loading" role="status" aria-live="polite" aria-label="Setting up your workspace">
      <div className="company-context-loading__brand" aria-hidden="true">
        <span className="company-context-loading__mark">O</span>
        <span className="company-context-loading__word">ne</span>
      </div>
      <div className="company-context-loading__pulse" aria-hidden="true" />
      <strong>Setting up your workspace…</strong>
      <span>Preparing your company context</span>
    </main>
  )
}

export function LockScreen({ onUnlock, onSignOut, preparing = false }) {
  const now = useClock()
  const [sessionMode] = useState(() => hasSession())
  const storedUser = getStoredUser()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const result = consumeGoogleOAuthCallback()
    if (!result.handled) return
    if (result.error) {
      setError(result.error)
      return
    }
    if (result.token) {
      window.location.reload()
    }
  }, [])

  const time = useMemo(
    () =>
      new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(now),
    [now],
  )

  const date = useMemo(
    () =>
      new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(now),
    [now],
  )

  const submit = async (event) => {
    event?.preventDefault()
    try {
      setSubmitting(true)
      setError('')

      if (sessionMode) {
        if (!pin.trim()) return
        await verifyPin(pin.trim())
        onUnlock()
        return
      }

      if (!username.trim()) { setError('Enter your email or username.'); return }
      if (!password) { setError('Enter your password.'); return }
      await login(username.trim(), password)
      onUnlock()
    } catch (err) {
      setError(err?.message || 'Unable to sign in')
    } finally {
      setSubmitting(false)
    }
  }

  const submitGoogle = async () => {
    try {
      setSubmitting(true)
      setError('')
      await startGoogleLogin(username.trim())
    } catch (err) {
      setError(err?.message || 'SSO not connected. Please login with email/password.')
      setSubmitting(false)
    }
  }

  const displayName = storedUser?.name || storedUser?.username || 'User'
  const initial = displayName.trim().charAt(0).toUpperCase() || 'U'

  return (
    <main className="screen lock-screen">
      <div className="wallpaper wallpaper--lock" />
      <div className="lock-vignette" />

      <section className="lock-content" aria-label="Login screen">
        <div className="lock-date">{date}</div>
        <div className="lock-time">{time}</div>

        <form className="login-glass-card" onSubmit={submit}>
          <div className="profile-avatar login-avatar" aria-label={sessionMode ? `${displayName} profile` : 'onePOS'}>
            {sessionMode ? initial : (
              <svg className="login-brand-mark" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7.35 3.15c-2.3 0-4.2 1.88-4.2 4.2v9.3c0 2.32 1.9 4.2 4.2 4.2h9.3c2.32 0 4.2-1.88 4.2-4.2v-9.3c0-2.32-1.88-4.2-4.2-4.2h-9.3Z" fill="currentColor"/>
                <path d="M9.5 7.9 16.3 12 9.5 16.1V7.9Z" fill="white"/>
              </svg>
            )}
          </div>

          {sessionMode ? (
            <>
              <div className="login-title">{displayName}</div>
              <div className="login-subtitle">Enter PIN to unlock</div>

              <input
                className="login-field login-pin-field"
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 12))}
                placeholder="PIN"
                inputMode="numeric"
                type="password"
                autoComplete="off"
                autoFocus
              />

              {error ? <div className="login-error">{error}</div> : null}

              <button
                className="login-submit"
                type="submit"
                disabled={submitting || !pin.trim()}
              >
                {submitting ? 'Unlocking…' : 'Unlock'}
              </button>

              <button
                className="lock-signout"
                type="button"
                onClick={onSignOut}
                disabled={submitting}
              >
                Sign Out
              </button>
            </>
          ) : (
            <>
              <div className="login-title">One Solutions</div>
              <div className="login-subtitle">Sign in with your account</div>

              <input
                className="login-field"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Email or username"
                autoComplete="username"
                autoFocus
              />

              <div className="login-password-wrap">
                <input
                  className="login-field"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  aria-label="Password"
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>

              {error ? <div className="login-error">{error}</div> : null}

              <button
                className="login-submit"
                type="submit"
                disabled={submitting || preparing || !username.trim() || !password}
              >
                {preparing ? 'Preparing company context…' : submitting ? 'Signing in…' : 'Sign In'}
              </button>
              {preparing ? (
                <div className="login-preparing" role="status" aria-live="polite">
                  <span className="login-preparing-spinner" aria-hidden="true" />
                  <span>Starting onePOS…</span>
                </div>
              ) : null}

              <div className="login-divider" aria-hidden="true"><span>or</span></div>

              <button
                className="google-signin-button"
                type="button"
                onClick={submitGoogle}
                disabled={submitting || !username.trim()}
              >
                <svg className="google-signin-logo" viewBox="0 0 18 18" aria-hidden="true">
                  <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.716v2.258h2.909c1.702-1.567 2.684-3.876 2.684-6.615Z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.468-.806 5.956-2.18l-2.91-2.258c-.805.54-1.836.859-3.046.859-2.344 0-4.328-1.585-5.036-3.714H.957v2.332A9 9 0 0 0 9 18Z"/>
                  <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.167.282-1.707V4.961H.957A9 9 0 0 0 0 9c0 1.452.347 2.827.957 4.039l3.007-2.332Z"/>
                  <path fill="#EA4335" d="M9 3.579c1.321 0 2.507.454 3.441 1.346l2.581-2.581C13.464.892 11.425 0 9 0A9 9 0 0 0 .957 4.961l3.007 2.332C4.672 5.164 6.656 3.579 9 3.579Z"/>
                </svg>
                Continue with Google
              </button>
            </>
          )}
        </form>
      </section>
    </main>
  )
}
