import { useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { apiRequest, completePasskeyRegistration, completeTotpEnrollment, consumeAuthenticationProviderCallback, getPasskeyOptions, getStoredUser, hasSession, loadAuthenticationProviders, login, startAuthenticationProvider, startPasskeyLogin, startPasskeyRegistration, startTotpEnrollment, verifyMfa, verifyPasskey, verifyPasskeyLogin, verifyPin } from '../../services/api'
import { useClock } from '../clock/ShellClock'

function normalizeResetEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

function isMobilePasskeyDevice() {
  if (typeof navigator === 'undefined') return false
  const ua = String(navigator.userAgent || '')
  const platform = String(navigator.platform || '')
  const maxTouchPoints = Number(navigator.maxTouchPoints || 0)
  return /Android|iPhone|iPad|iPod/i.test(ua)
    || (platform === 'MacIntel' && maxTouchPoints > 1)
}

export function CompanyContextLoading() {
  return (
    <main className="screen company-context-loading" role="status" aria-live="polite" aria-label="Setting up your workspace">
      <div className="company-context-loading__brand" aria-hidden="true">
        <img className="company-context-loading__logo" src={`${import.meta.env.BASE_URL}icons/one-solutions-mark.svg`} alt="" />
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
  const [mfa, setMfa] = useState(null)
  const [mfaCode, setMfaCode] = useState('')
  const [alternateCode, setAlternateCode] = useState('')
  const [totpSetup, setTotpSetup] = useState(null)
  const [trustDevice, setTrustDevice] = useState(false)
  const [providers, setProviders] = useState([])
  const [recoveryCodes, setRecoveryCodes] = useState([])
  const [resetStage, setResetStage] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [resetOtp, setResetOtp] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('')
  const [resetNotice, setResetNotice] = useState('')
  const mobilePasskeyDevice = useMemo(() => isMobilePasskeyDevice(), [])

  useEffect(() => {
    const result = consumeAuthenticationProviderCallback()
    if (!result.handled) return
    if (result.error) {
      setError(result.error)
      return
    }
    if (result.token) {
      window.location.reload()
      return
    }
    if (result.mfaRequired && result.challengeId) {
      void loadMfaChallenge(result.challengeId, result)
    }
  }, [])

  useEffect(() => {
    const value = username.trim()
    if (!value || !value.includes('@')) { setProviders([]); return }
    const timer = window.setTimeout(() => {
      loadAuthenticationProviders(value).then(setProviders).catch(() => setProviders([]))
    }, 350)
    return () => window.clearTimeout(timer)
  }, [username])

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

  const loadMfaChallenge = async (challengeId, fallback = {}) => {
    try {
      const response = await apiRequest(`/api/auth/mfa/challenge/${encodeURIComponent(challengeId)}`)
      setMfa({ ...(fallback || {}), ...(response?.data || {}), challengeId })
    } catch {
      setMfa({ ...(fallback || {}), challengeId })
    }
  }

  const browserDeviceName = () => {
    try { return navigator.userAgentData?.platform || navigator.platform || 'This device' } catch { return 'This device' }
  }

  const credentialToJson = (credential) => {
    if (!credential) return null
    const toB64 = (value) => value ? btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'') : null
    const result = {
      id: credential.id,
      rawId: toB64(credential.rawId),
      type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment || undefined,
      clientExtensionResults: credential.getClientExtensionResults?.() || {},
      response: {},
    }
    const response = credential.response
    for (const key of ['clientDataJSON','attestationObject','authenticatorData','signature','userHandle']) {
      if (response?.[key]) result.response[key] = toB64(response[key])
    }
    if (typeof response?.getTransports === 'function') result.response.transports = response.getTransports()
    return result
  }

  const decodeCreationOptions = (options) => {
    const fromB64 = (value) => {
      const text = String(value || '').replace(/-/g,'+').replace(/_/g,'/')
      const padded = text + '='.repeat((4 - text.length % 4) % 4)
      const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0))
      return bytes.buffer
    }
    return {
      ...options,
      challenge: fromB64(options.challenge),
      user: { ...options.user, id: fromB64(options.user.id) },
      excludeCredentials: (options.excludeCredentials || []).map((item) => ({ ...item, id: fromB64(item.id) })),
    }
  }

  const decodeRequestOptions = (options) => {
    const fromB64 = (value) => {
      const text = String(value || '').replace(/-/g,'+').replace(/_/g,'/')
      const padded = text + '='.repeat((4 - text.length % 4) % 4)
      return Uint8Array.from(atob(padded), c => c.charCodeAt(0)).buffer
    }
    return {
      ...options,
      challenge: fromB64(options.challenge),
      allowCredentials: (options.allowCredentials || []).map((item) => ({ ...item, id: fromB64(item.id) })),
    }
  }

  const startTotp = async () => {
    try {
      setSubmitting(true); setError('')
      const response = await startTotpEnrollment(mfa.challengeId)
      setTotpSetup(response?.data || null)
    } catch (err) { setError(err?.message || 'Unable to start authenticator setup') }
    finally { setSubmitting(false) }
  }

  const completeTotp = async () => {
    try {
      setSubmitting(true); setError('')
      const method = totpSetup?.id || mfa?.availableMethods?.find((item) => item.type === 'TOTP')?.id
      if (!method) throw new Error('Authenticator method is not available.')
      const result = totpSetup
        ? await completeTotpEnrollment({ challengeId:mfa.challengeId, methodId:method, code:mfaCode, trustDevice, deviceName:browserDeviceName() })
        : await verifyMfa({ challengeId:mfa.challengeId, methodId:method, methodType:'TOTP', code:mfaCode, trustDevice, deviceName:browserDeviceName() })
      if (Array.isArray(result?.recoveryCodes) && result.recoveryCodes.length) {
        setRecoveryCodes(result.recoveryCodes)
        return
      }
      if (result?.token) onUnlock()
    } catch (err) { setError(err?.message || 'Verification failed') }
    finally { setSubmitting(false) }
  }

  const useRecoveryCode = async () => {
    try {
      setSubmitting(true); setError('')
      const result = await verifyMfa({ challengeId:mfa.challengeId, methodType:'RECOVERY_CODE', code:alternateCode, trustDevice, deviceName:browserDeviceName() })
      if (result?.token) onUnlock()
    } catch (err) { setError(err?.message || 'Recovery code is invalid') }
    finally { setSubmitting(false) }
  }

  const useTemporaryCode = async () => {
    try {
      setSubmitting(true); setError('')
      const result = await verifyMfa({ challengeId:mfa.challengeId, methodType:'TEMPORARY_CODE', code:alternateCode, trustDevice:false, deviceName:browserDeviceName() })
      if (result?.token) onUnlock()
    } catch (err) { setError(err?.message || 'Temporary verification code is invalid') }
    finally { setSubmitting(false) }
  }

  const registerPasskey = async (authenticatorKind = 'PLATFORM') => {
    try {
      setSubmitting(true); setError('')
      if (!window.PublicKeyCredential || !navigator.credentials) throw new Error('Passkeys are not supported on this browser/device.')
      const response = await startPasskeyRegistration(mfa.challengeId, authenticatorKind)
      const credential = await navigator.credentials.create({ publicKey: decodeCreationOptions(response.data) })
      const result = await completePasskeyRegistration({
        challengeId:mfa.challengeId, credential:credentialToJson(credential), label:'Passkey',
        trustDevice, deviceName:browserDeviceName(),
      })
      if (Array.isArray(result?.recoveryCodes) && result.recoveryCodes.length) {
        setRecoveryCodes(result.recoveryCodes)
        return
      }
      if (result?.token) onUnlock()
    } catch (err) { setError(err?.message || 'Passkey setup failed') }
    finally { setSubmitting(false) }
  }

  const authenticatePasskey = async () => {
    try {
      setSubmitting(true); setError('')
      if (!window.PublicKeyCredential || !navigator.credentials) throw new Error('Passkeys are not supported on this browser/device.')
      const response = await getPasskeyOptions(mfa.challengeId)
      const credential = await navigator.credentials.get({ publicKey: decodeRequestOptions(response.data) })
      const result = await verifyPasskey({ challengeId:mfa.challengeId, credential:credentialToJson(credential), trustDevice, deviceName:browserDeviceName() })
      if (result?.token) onUnlock()
    } catch (err) { setError(err?.message || 'Passkey verification failed') }
    finally { setSubmitting(false) }
  }

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
      const result = await login(username.trim(), password)
      if (result?.mfaRequired && result?.challengeId) {
        await loadMfaChallenge(result.challengeId, result)
        return
      }
      onUnlock()
    } catch (err) {
      setError(err?.message || 'Unable to sign in')
    } finally {
      setSubmitting(false)
    }
  }

  const submitPasskeyLogin = async () => {
    try {
      setSubmitting(true)
      setError('')
      const identifier = username.trim()
      if (!identifier) { setError('Enter your email or username first.'); return }
      if (!window.PublicKeyCredential || !navigator.credentials) throw new Error('Passkeys are not supported on this browser/device.')
      const response = await startPasskeyLogin(identifier)
      const credential = await navigator.credentials.get({ publicKey: decodeRequestOptions(response.data) })
      const result = await verifyPasskeyLogin({
        challengeId: response.challengeId,
        credential: credentialToJson(credential),
        trustDevice: true,
        deviceName: browserDeviceName(),
      })
      if (result?.token) onUnlock()
    } catch (err) {
      const code=String(err?.payload?.code||err?.code||'').toUpperCase()
      const message=String(err?.payload?.message||err?.message||'')
      if(code==='PASSKEY_NOT_ENROLLED'||/no passkey is enrolled/i.test(message)){
        setError('No passkey is set up for this account yet. Sign in with your password, then open My Profile and choose Add passkey.')
      }else if(code==='PASSKEY_LOGIN_DISABLED'||/passkey sign-in is disabled/i.test(message)){
        setError('Passkey sign-in is disabled by your company security settings.')
      }else{
        setError(err?.message || 'Passkey sign-in failed')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const requestPasswordReset = async () => {
    try {
      const email = normalizeResetEmail(resetEmail || username)
      if (!email) { setError('Enter your email address.'); return }
      setSubmitting(true); setError(''); setResetNotice('')
      await apiRequest('/api/auth/password-reset/request', { method:'POST', body:JSON.stringify({ email }) })
      setResetEmail(email)
      setResetStage('verify')
      setResetNotice('If the account is eligible, a 6-digit code has been sent. It expires in 10 minutes.')
    } catch (err) {
      setError(err?.message || 'Unable to request a reset code')
    } finally { setSubmitting(false) }
  }

  const completePasswordReset = async () => {
    try {
      if (resetOtp.length !== 6) { setError('Enter the 6-digit code.'); return }
      if (!resetPassword) { setError('Enter a new password.'); return }
      if (resetPassword !== resetPasswordConfirm) { setError('Passwords do not match.'); return }
      setSubmitting(true); setError(''); setResetNotice('')
      await apiRequest('/api/auth/password-reset/complete', {
        method:'POST',
        body:JSON.stringify({ email: resetEmail, otp: resetOtp, password: resetPassword }),
      })
      setResetStage('')
      setResetOtp(''); setResetPassword(''); setResetPasswordConfirm('')
      setResetNotice('Password reset successfully. Sign in with your new password.')
    } catch (err) {
      setError(err?.message || 'Unable to reset password')
    } finally { setSubmitting(false) }
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

        <form className="login-glass-card" onSubmit={(event) => {
          if (!resetStage) return submit(event)
          event.preventDefault()
          return resetStage === 'request' ? requestPasswordReset() : completePasswordReset()
        }}>
          <div className={`profile-avatar login-avatar${sessionMode ? '' : ' login-avatar--brand'}`} aria-label={sessionMode ? `${displayName} profile` : 'One Solutions'}>
            {sessionMode ? initial : (
              <img className="login-brand-mark" src={`${import.meta.env.BASE_URL}icons/one-solutions-mark.svg`} alt="One Solutions" />
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
          ) : recoveryCodes.length ? (
            <>
              <div className="login-title">Save your recovery codes</div>
              <div className="login-subtitle">Each code can be used once if your normal MFA method is unavailable.</div>
              <div className="login-mfa-setup">
                <code style={{whiteSpace:'pre-wrap'}}>{recoveryCodes.join('\n')}</code>
                <small>Store these somewhere secure. They will not be shown again.</small>
              </div>
              <button className="login-submit" type="button" onClick={()=>onUnlock()}>I saved these codes</button>
            </>
          ) : mfa?.challengeId ? (
            <>
              <div className="login-title">Verify your identity</div>
              <div className="login-subtitle">{mfa.phishingResistantRequired ? 'A phishing-resistant passkey is required.' : 'Complete multi-factor authentication to continue.'}</div>

              {mfa.enrollmentRequired ? (
                <>
                  {mfa.allowedEnrollmentMethods?.includes('TOTP') ? (
                    <button className="login-submit" type="button" disabled={submitting} onClick={startTotp}>
                      Set up authenticator
                    </button>
                  ) : null}
                  {mfa.allowedEnrollmentMethods?.includes('PLATFORM_PASSKEY') ? (
                    <button className="google-signin-button" type="button" disabled={submitting} onClick={()=>registerPasskey('PLATFORM')}>
                      Set up built-in passkey
                    </button>
                  ) : null}
                  {mfa.allowedEnrollmentMethods?.includes('SECURITY_KEY') ? (
                    <button className="google-signin-button" type="button" disabled={submitting} onClick={()=>registerPasskey('SECURITY_KEY')}>
                      Set up physical security key
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  {mfa.availableMethods?.some((item)=>item.type==='PASSKEY') ? (
                    <button className="login-submit" type="button" disabled={submitting} onClick={authenticatePasskey}>
                      Use passkey
                    </button>
                  ) : null}
                  {!mfa.phishingResistantRequired && mfa.availableMethods?.some((item)=>item.type==='TOTP') ? (
                    <input className="login-field login-pin-field" value={mfaCode} onChange={(e)=>setMfaCode(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="6-digit code" inputMode="numeric" autoComplete="one-time-code" />
                  ) : null}
                  {!mfa.phishingResistantRequired && mfa.availableMethods?.some((item)=>item.type==='TOTP') ? (
                    <button className="login-submit" type="button" disabled={submitting || mfaCode.length!==6} onClick={completeTotp}>Verify code</button>
                  ) : null}
                  {!mfa.phishingResistantRequired && mfa.availableMethods?.some((item)=>item.type==='RECOVERY_CODES') ? (
                    <>
                      <input className="login-field" value={alternateCode} onChange={(e)=>setAlternateCode(e.target.value.toUpperCase())} placeholder="Recovery code" autoComplete="one-time-code" />
                      <button className="lock-signout" type="button" disabled={submitting || !alternateCode.trim()} onClick={useRecoveryCode}>Use recovery code</button>
                    </>
                  ) : null}
                  {!mfa.phishingResistantRequired && mfa.availableMethods?.some((item)=>item.type==='TEMPORARY_CODE') ? (
                    <>
                      <input className="login-field login-pin-field" value={alternateCode} onChange={(e)=>setAlternateCode(e.target.value.replace(/\D/g,'').slice(0,8))} placeholder="8-digit temporary code" inputMode="numeric" autoComplete="one-time-code" />
                      <button className="lock-signout" type="button" disabled={submitting || alternateCode.length!==8} onClick={useTemporaryCode}>Use temporary verification code</button>
                    </>
                  ) : null}
                </>
              )}

              {totpSetup ? (
                <div className="login-mfa-setup">
                  <strong>Authenticator key</strong>
                  <code>{totpSetup.secret}</code>
                  <small>Add this key to your authenticator app, then enter the 6-digit code.</small>
                  <input className="login-field login-pin-field" value={mfaCode} onChange={(e)=>setMfaCode(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="6-digit code" inputMode="numeric" autoComplete="one-time-code" />
                  <button className="login-submit" type="button" disabled={submitting || mfaCode.length!==6} onClick={completeTotp}>Confirm authenticator</button>
                </div>
              ) : null}

              <label className="login-trust-device">
                <input type="checkbox" checked={trustDevice} onChange={(e)=>setTrustDevice(e.target.checked)} />
                <span>Trust this device</span>
              </label>

              {error ? <div className="login-error">{error}</div> : null}
              <button className="lock-signout" type="button" onClick={()=>{setMfa(null);setTotpSetup(null);setMfaCode('');setAlternateCode('');setError('')}} disabled={submitting}>Back to sign in</button>
            </>
          ) : (
            <>
              {resetStage ? (
                <>
                  <div className="login-subtitle login-subtitle--brand">{resetStage === 'request' ? 'Reset your password' : 'Enter the email code'}</div>
                  {resetStage === 'request' ? (
                    <>
                      <input className="login-field" value={resetEmail} onChange={(e)=>setResetEmail(e.target.value)} placeholder="Email address" type="email" autoComplete="email" autoFocus />
                      {error ? <div className="login-error">{error}</div> : null}
                      <button className="login-submit" type="submit" disabled={submitting}>{submitting ? 'Sending…' : 'Send 6-digit code'}</button>
                    </>
                  ) : (
                    <>
                      {resetNotice ? <div className="login-subtitle">{resetNotice}</div> : null}
                      <input className="login-field login-pin-field" value={resetOtp} onChange={(e)=>setResetOtp(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="6-digit code" inputMode="numeric" autoComplete="one-time-code" autoFocus />
                      <input className="login-field" value={resetPassword} onChange={(e)=>setResetPassword(e.target.value)} placeholder="New password" type="password" autoComplete="new-password" />
                      <input className="login-field" value={resetPasswordConfirm} onChange={(e)=>setResetPasswordConfirm(e.target.value)} placeholder="Confirm new password" type="password" autoComplete="new-password" />
                      {error ? <div className="login-error">{error}</div> : null}
                      <button className="login-submit" type="submit" disabled={submitting || resetOtp.length!==6}>{submitting ? 'Resetting…' : 'Reset password'}</button>
                      <button className="lock-signout" type="button" disabled={submitting} onClick={requestPasswordReset}>Send a new code</button>
                    </>
                  )}
                  <button className="lock-signout" type="button" disabled={submitting} onClick={()=>{setResetStage('');setError('');setResetNotice('')}}>Back to sign in</button>
                </>
              ) : (
                <>
                  <div className="login-subtitle login-subtitle--brand">Sign in with your account</div>
                  {resetNotice ? <div className="login-subtitle">{resetNotice}</div> : null}

              <input
                className="login-field"
                name="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Email or username"
                autoComplete="username"
                autoFocus
              />

              <div className="login-password-wrap">
                <input
                  className="login-field"
                  name="password"
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
                disabled={submitting || preparing}
              >
                {preparing ? 'Preparing company context…' : submitting ? 'Signing in…' : 'Sign In'}
              </button>
              {preparing ? (
                <div className="login-preparing" role="status" aria-live="polite">
                  <span className="login-preparing-spinner" aria-hidden="true" />
                  <span>Starting onePOS…</span>
                </div>
              ) : null}

              {mobilePasskeyDevice ? (
                <>
                  <button
                    className="google-signin-button"
                    type="button"
                    onClick={submitPasskeyLogin}
                    disabled={submitting || !username.trim()}
                  >
                    Sign in with passkey
                  </button>
                  <div className="login-passkey-hint">Use Face ID, Touch ID or your Android/iPhone passkey.</div>
                </>
              ) : null}

              <div className="login-divider" aria-hidden="true"><span>or</span></div>

              {providers.map((provider) => (
                <button
                  key={provider.key}
                  className="google-signin-button"
                  type="button"
                  onClick={() => {
                    try { setSubmitting(true); setError(''); startAuthenticationProvider(provider, username.trim()) }
                    catch (err) { setError(err?.message || 'Unable to start SSO.'); setSubmitting(false) }
                  }}
                  disabled={submitting || !username.trim()}
                >
                  Continue with {provider.name}
                </button>
              ))}


              <button className="lock-signout" type="button" disabled={submitting} onClick={()=>{setResetEmail(normalizeResetEmail(username));setResetStage('request');setError('');setResetNotice('')}}>Forgot password?</button>
                </>
              )}
            </>
          )}
        </form>
      </section>
    </main>
  )
}
