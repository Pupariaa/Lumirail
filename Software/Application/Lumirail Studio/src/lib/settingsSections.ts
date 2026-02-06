export interface SettingsSection {
  id: string
  label: string
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: 'settings-about', label: 'À propos' },
  { id: 'settings-params', label: 'Paramètres' },
  { id: 'settings-data', label: 'Données' },
  { id: 'settings-licence', label: 'Licence' },
  { id: 'settings-system', label: 'Informations système' },
]
