export interface HelpSection {
  id: string
  label: string
}

export const HELP_SECTIONS: HelpSection[] = [
  { id: 'help-shortcuts', label: 'Raccourcis clavier' },
  { id: 'help-fonctions', label: 'Fonctionnement' },
  { id: 'help-intentions', label: 'Types d\'intentions' },
  { id: 'help-modules', label: 'Modules et DigiKey' },
  { id: 'help-donnees', label: 'Données et sauvegarde' },
  { id: 'help-glossaire', label: 'Glossaire' },
]
