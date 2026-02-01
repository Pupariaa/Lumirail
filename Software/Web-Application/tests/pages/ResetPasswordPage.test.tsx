import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ResetPasswordPage } from '../../src/pages/ResetPasswordPage'
import { register, requestPasswordReset } from '../../src/auth'
import { createLocalStorageAdapter } from '../../src/storage'

function renderResetPassword(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/reset-password${search}`]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('shows invalid link when no token', () => {
    renderResetPassword()
    expect(screen.getByText(/invalid link/i)).toBeInTheDocument()
  })

  it('shows expired link when token is expired', async () => {
    const adapter = createLocalStorageAdapter()
    await register(adapter, 'user@example.com', 'pass1234', 'pass1234')
    const req = requestPasswordReset(adapter, 'https://app.example.com', 'user@example.com')
    const token = req.resetLink?.split('token=')[1]
    if (!token) throw new Error('expected token')
    const expiredToken = {
      token,
      email: 'user@example.com',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    }
    adapter.setItem('lumirail_reset_tokens', JSON.stringify([expiredToken]))
    renderResetPassword(`?token=${token}`)
    expect(screen.getByText(/link expired/i)).toBeInTheDocument()
  })

  it('shows form when token is valid', async () => {
    const adapter = createLocalStorageAdapter()
    await register(adapter, 'user@example.com', 'pass1234', 'pass1234')
    const req = requestPasswordReset(adapter, 'https://app.example.com', 'user@example.com')
    const token = req.resetLink?.split('token=')[1]
    if (!token) throw new Error('expected token')
    renderResetPassword(`?token=${token}`)
    expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument()
  })

  it('resets password and redirects on success', async () => {
    const adapter = createLocalStorageAdapter()
    await register(adapter, 'user@example.com', 'pass1234', 'pass1234')
    const req = requestPasswordReset(adapter, 'https://app.example.com', 'user@example.com')
    const token = req.resetLink?.split('token=')[1]
    if (!token) throw new Error('expected token')
    renderResetPassword(`?token=${token}`)
    const passwordInput = await screen.findByLabelText(/^new password$/i)
    fireEvent.change(passwordInput, { target: { value: 'newPass456' } })
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'newPass456' } })
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }))
    expect(await screen.findByText(/password updated/i)).toBeInTheDocument()
  })

  it('shows error for password mismatch', async () => {
    const adapter = createLocalStorageAdapter()
    await register(adapter, 'user@example.com', 'pass1234', 'pass1234')
    const req = requestPasswordReset(adapter, 'https://app.example.com', 'user@example.com')
    const token = req.resetLink?.split('token=')[1]
    if (!token) throw new Error('expected token')
    renderResetPassword(`?token=${token}`)
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'newPass456' } })
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'different' } })
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/match/i)
  })

  it('shows error for weak password', async () => {
    const adapter = createLocalStorageAdapter()
    await register(adapter, 'user@example.com', 'pass1234', 'pass1234')
    const req = requestPasswordReset(adapter, 'https://app.example.com', 'user@example.com')
    const token = req.resetLink?.split('token=')[1]
    if (!token) throw new Error('expected token')
    renderResetPassword(`?token=${token}`)
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'short' } })
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8/i)
  })

  it('has keyboard-accessible form structure', async () => {
    const adapter = createLocalStorageAdapter()
    await register(adapter, 'user@example.com', 'pass1234', 'pass1234')
    const req = requestPasswordReset(adapter, 'https://app.example.com', 'user@example.com')
    const token = req.resetLink?.split('token=')[1]
    if (!token) throw new Error('expected token')
    renderResetPassword(`?token=${token}`)
    const passwordInput = screen.getByLabelText(/^new password$/i)
    const confirmInput = screen.getByLabelText(/confirm new password/i)
    const submitButton = screen.getByRole('button', { name: /reset password/i })
    expect(passwordInput).not.toHaveAttribute('tabIndex', '-1')
    expect(confirmInput).not.toHaveAttribute('tabIndex', '-1')
    expect(submitButton).not.toHaveAttribute('tabIndex', '-1')
    expect(submitButton).toHaveAttribute('type', 'submit')
  })
})
