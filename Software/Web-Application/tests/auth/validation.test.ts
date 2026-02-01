import { describe, it, expect } from 'vitest'
import { validateEmail, validatePassword } from '../../src/auth/validation'

describe('validateEmail', () => {
  it('returns error for empty email', () => {
    expect(validateEmail('')).toBe('Email is required')
  })

  it('returns error for invalid format', () => {
    expect(validateEmail('invalid')).not.toBeNull()
    expect(validateEmail('a@b')).not.toBeNull()
  })

  it('returns null for valid email', () => {
    expect(validateEmail('user@example.com')).toBeNull()
  })
})

describe('validatePassword', () => {
  it('returns error for short password', () => {
    expect(validatePassword('short')).toContain('8 characters')
  })

  it('returns error when no letter', () => {
    expect(validatePassword('12345678')).toContain('letter')
  })

  it('returns error when no number', () => {
    expect(validatePassword('abcdefgh')).toContain('number')
  })

  it('returns null for valid password', () => {
    expect(validatePassword('pass1234')).toBeNull()
  })
})
