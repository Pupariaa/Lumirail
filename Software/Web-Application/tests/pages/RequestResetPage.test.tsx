import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RequestResetPage } from '../../src/pages/RequestResetPage'
import { register } from '../../src/auth'
import { createLocalStorageAdapter } from '../../src/storage'

function renderRequestReset() {
  return render(
    <MemoryRouter>
      <RequestResetPage />
    </MemoryRouter>
  )
}

describe('RequestResetPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders reset form', () => {
    renderRequestReset()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument()
  })

  it('shows reset link when user exists', async () => {
    const adapter = createLocalStorageAdapter()
    await register(adapter, 'user@example.com', 'pass1234', 'pass1234')
    renderRequestReset()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    expect(await screen.findByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/check your email/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /reset-password/ })).toBeInTheDocument()
  })

  it('shows message when user does not exist', async () => {
    renderRequestReset()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'unknown@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    expect(await screen.findByText(/no account was found/i)).toBeInTheDocument()
  })

  it('shows error for invalid email format', async () => {
    renderRequestReset()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'invalid-email' } })
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid email/i)
  })

  it('has keyboard-accessible form structure', () => {
    renderRequestReset()
    const emailInput = screen.getByLabelText(/email/i)
    const submitButton = screen.getByRole('button', { name: /send reset link/i })
    expect(emailInput).not.toHaveAttribute('tabIndex', '-1')
    expect(submitButton).not.toHaveAttribute('tabIndex', '-1')
    expect(submitButton).toHaveAttribute('type', 'submit')
  })
})
