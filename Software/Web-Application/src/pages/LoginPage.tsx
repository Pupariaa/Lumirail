import { useState, FormEvent, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { login, validateEmail } from '../auth'
import { createLocalStorageAdapter } from '../storage'
import { useAuth } from '../context/useAuth'
import logoLumirail from '../../assets/logo-lumirail.png'
import logoTechalchemy from '../../assets/logo-techalchemy.png'

const ERROR_ID = 'login-error'

export function LoginPage() {
  const navigate = useNavigate()
  const { setUser } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const adapter = useMemo(() => createLocalStorageAdapter(), [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setError('Email is required')
      return
    }
    const emailError = validateEmail(trimmedEmail)
    if (emailError) {
      setError(emailError)
      return
    }
    if (!password) {
      setError('Password is required')
      return
    }

    const result = await login(adapter, trimmedEmail, password)

    if (result.success && result.user) {
      setUser(result.user)
      navigate('/')
    } else {
      setError(result.error ?? 'Login failed')
    }
  }

  return (
    <div className="login-page">
      <div className="auth-card">
        <div className="auth-brand">
          <img src={logoLumirail} alt="" className="auth-logo" aria-hidden />
          <h1 className="auth-title">Sign in</h1>
          <p className="auth-subtitle">Lumirail Studio Web</p>
        </div>
        <form onSubmit={handleSubmit} noValidate>
          {error && (
            <p id={ERROR_ID} className="form-error" role="alert">
              {error}
            </p>
          )}
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
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            aria-describedby={error ? ERROR_ID : undefined}
          />
          <button type="submit" className="btn btn-primary">Sign in</button>
        </form>
        <div className="auth-links">
          <p>
            <Link to="/forgot-password">Forgot password?</Link>
          </p>
          <p>
            <Link to="/register">Create account</Link>
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
