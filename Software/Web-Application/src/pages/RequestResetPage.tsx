import { useState, FormEvent, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { requestPasswordReset } from '../auth/password-reset'
import { createLocalStorageAdapter } from '../storage'
import logoLumirail from '../../assets/logo-lumirail.png'
import logoTechalchemy from '../../assets/logo-techalchemy.png'

const ERROR_ID = 'request-reset-error'

function getBaseUrl(): string {
  if (typeof window === 'undefined') return ''
  return window.location.origin
}

export function RequestResetPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [resetLink, setResetLink] = useState<string | null>(null)
  const adapter = useMemo(() => createLocalStorageAdapter(), [])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setResetLink(null)
    const result = requestPasswordReset(adapter, getBaseUrl(), email)

    if (result.success) {
      if (result.resetLink) {
        setResetLink(result.resetLink)
      } else {
        setResetLink('')
      }
    } else {
      setError(result.error ?? 'Request failed')
    }
  }

  if (resetLink !== null) {
    return (
      <div className="auth-page" role="status" aria-live="polite">
        <div className="auth-card">
          <div className="auth-brand">
            <img src={logoLumirail} alt="" className="auth-logo" aria-hidden />
            <h1 className="auth-title">Check your email</h1>
            {resetLink ? (
              <p className="auth-subtitle">Use the link below to reset your password (v1: link shown here; in production this would be sent to your email):</p>
            ) : (
              <p className="auth-subtitle">If an account exists for that email, a reset link would be sent. No account was found.</p>
            )}
          </div>
          {resetLink && (
            <p>
              <a href={resetLink} className="reset-link">
                {resetLink}
              </a>
            </p>
          )}
          <div className="auth-links">
            <p>
              <Link to="/login">Back to sign in</Link>
            </p>
          </div>
          <div className="auth-footer">
            <img src={logoTechalchemy} alt="" className="auth-footer-logo" aria-hidden />
            <span className="auth-subtitle">by TechAlchemy</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <img src={logoLumirail} alt="" className="auth-logo" aria-hidden />
          <h1 className="auth-title">Reset password</h1>
          <p className="auth-subtitle">Enter your email to receive a reset link</p>
        </div>
        <form onSubmit={handleSubmit} noValidate>
          {error && <p id={ERROR_ID} className="form-error" role="alert">{error}</p>}
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            autoFocus
            aria-describedby={error ? ERROR_ID : undefined}
          />
          <button type="submit" className="btn btn-primary">Send reset link</button>
        </form>
        <div className="auth-links">
          <p>
            <Link to="/login">Back to sign in</Link>
          </p>
        </div>
        <div className="auth-footer">
          <img src={logoTechalchemy} alt="" className="auth-footer-logo" aria-hidden />
          <span className="auth-subtitle">by TechAlchemy</span>
        </div>
      </div>
    </div>
  )
}
