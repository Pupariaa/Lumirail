import { useState, FormEvent, useMemo } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { resetPassword, validateResetToken } from '../auth/password-reset'
import { createLocalStorageAdapter } from '../storage'
import logoLumirail from '../../assets/logo-lumirail.png'
import logoTechalchemy from '../../assets/logo-techalchemy.png'

const ERROR_ID = 'reset-password-error'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const adapter = useMemo(() => createLocalStorageAdapter(), [])
  const isValidToken = token && validateResetToken(adapter, token)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    const result = await resetPassword(adapter, token, password, confirmPassword)

    if (result.success) {
      setSuccess(true)
      setTimeout(() => navigate('/login'), 2000)
    } else {
      setError(result.error ?? 'Reset failed')
    }
    setIsSubmitting(false)
  }

  if (success) {
    return (
      <div className="auth-page" role="status" aria-live="polite">
        <div className="auth-card">
          <div className="auth-brand">
            <img src={logoLumirail} alt="" className="auth-logo" aria-hidden />
            <h1 className="auth-title">Password updated</h1>
            <p className="auth-subtitle">Redirecting to sign in...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">
            <img src={logoLumirail} alt="" className="auth-logo" aria-hidden />
            <h1 className="auth-title">Invalid link</h1>
            <p className="auth-subtitle">This reset link is invalid. Please request a new one.</p>
          </div>
          <div className="auth-links">
            <p><Link to="/forgot-password">Request reset link</Link></p>
            <p><Link to="/login">Back to sign in</Link></p>
          </div>
          <div className="auth-footer">
            <img src={logoTechalchemy} alt="" className="auth-footer-logo" aria-hidden />
            <span className="auth-subtitle">by TechAlchemy</span>
          </div>
        </div>
      </div>
    )
  }

  if (!isValidToken) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">
            <img src={logoLumirail} alt="" className="auth-logo" aria-hidden />
            <h1 className="auth-title">Link expired</h1>
            <p className="auth-subtitle">This reset link has expired. Please request a new one.</p>
          </div>
          <div className="auth-links">
            <p><Link to="/forgot-password">Request reset link</Link></p>
            <p><Link to="/login">Back to sign in</Link></p>
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
          <h1 className="auth-title">Set new password</h1>
          <p className="auth-subtitle">Enter your new password below</p>
        </div>
        <form onSubmit={handleSubmit} noValidate>
          {error && <p id={ERROR_ID} className="form-error" role="alert">{error}</p>}
          <label htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            autoFocus
            aria-describedby={error ? ERROR_ID : undefined}
          />
          <label htmlFor="confirmPassword">Confirm new password</label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
            aria-describedby={error ? ERROR_ID : undefined}
          />
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            Reset password
          </button>
        </form>
        <div className="auth-links">
          <p><Link to="/login">Back to sign in</Link></p>
        </div>
        <div className="auth-footer">
          <img src={logoTechalchemy} alt="" className="auth-footer-logo" aria-hidden />
          <span className="auth-subtitle">by TechAlchemy</span>
        </div>
      </div>
    </div>
  )
}
