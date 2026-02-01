import { useState, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { register } from '../auth'
import { createLocalStorageAdapter } from '../storage'
import { useAuth } from '../context/useAuth'
import logoLumirail from '../../assets/logo-lumirail.png'
import logoTechalchemy from '../../assets/logo-techalchemy.png'

export function RegisterPage() {
  const navigate = useNavigate()
  const { setUser } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    const adapter = createLocalStorageAdapter()
    const result = await register(adapter, email, password, confirmPassword)

    if (result.success && result.user) {
      setSuccess(true)
      setUser(result.user)
      setTimeout(() => navigate('/'), 1500)
    } else {
      setError(result.error ?? 'Registration failed')
    }
    setIsSubmitting(false)
  }

  if (success) {
    return (
      <div className="register-page" role="status" aria-live="polite">
        <div className="auth-card">
          <div className="auth-brand">
            <img src={logoLumirail} alt="" className="auth-logo" aria-hidden />
            <h1 className="auth-title">Account created</h1>
            <p className="auth-subtitle">Redirecting you to the app...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="register-page">
      <div className="auth-card">
        <div className="auth-brand">
          <img src={logoLumirail} alt="" className="auth-logo" aria-hidden />
          <h1 className="auth-title">Create an account</h1>
          <p className="auth-subtitle">Lumirail Studio Web</p>
        </div>
        <form onSubmit={handleSubmit} noValidate>
          {error && <p className="form-error" role="alert">{error}</p>}
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            autoFocus
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          <label htmlFor="confirmPassword">Confirm password</label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Registering...' : 'Register'}
          </button>
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
