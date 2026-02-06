import { useContext } from 'react'
import { HelpContext } from './helpContext'

export function useHelp() {
  return useContext(HelpContext)
}
