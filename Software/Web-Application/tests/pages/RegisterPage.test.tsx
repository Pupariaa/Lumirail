import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../../src/context'
import { RegisterPage } from '../../src/pages/RegisterPage'

function renderRegister() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('RegisterPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders registration form', () => {
    renderRegister()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /register/i })).toBeInTheDocument()
  })

  it('shows error for password mismatch', async () => {
    renderRegister()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@test.com' } })
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'pass1234' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'different' } })
    fireEvent.click(screen.getByRole('button', { name: /register/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/match/i)
  })

  it('shows success message and redirects after valid registration', async () => {
    renderRegister()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'newuser@test.com' } })
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'pass1234' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'pass1234' } })
    fireEvent.click(screen.getByRole('button', { name: /register/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/account created successfully/i)
  })

  it('has keyboard-accessible form structure (tab order, no tabIndex=-1)', () => {
    renderRegister()
    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/^password$/i)
    const confirmInput = screen.getByLabelText(/confirm password/i)
    const submitButton = screen.getByRole('button', { name: /register/i })
    expect(emailInput).not.toHaveAttribute('tabIndex', '-1')
    expect(passwordInput).not.toHaveAttribute('tabIndex', '-1')
    expect(confirmInput).not.toHaveAttribute('tabIndex', '-1')
    expect(submitButton).not.toHaveAttribute('tabIndex', '-1')
    expect(submitButton).toHaveAttribute('type', 'submit')
  })
})
