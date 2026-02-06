import { useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { setTutorialDismissed } from '../lib/preferences'

interface TutorialStep {
  title: string
  content: string[]
  tip?: string
}

const STEPS: TutorialStep[] = [
  {
    title: 'Bienvenue dans Lumirail Studio',
    content: [
      'Lumirail Studio vous permet de créer des scènes d\'éclairage pour vos modules Lumirail (maquettes ferroviaires, dioramas).',
      'Ce tutoriel en 6 étapes vous guide pour créer votre première scène. Vous pourrez ensuite la télécharger dans vos modules via le dongle DigiKey.',
    ],
  },
  {
    title: '1. Créez un espace de travail',
    content: [
      'Un espace de travail correspond à une entité globale : le nom de votre association, de votre entreprise, ou tout regroupement de vos projets.',
      'Commencez par saisir un nom dans le champ ci-dessous et cliquez sur Créer. Vous pourrez en créer plusieurs plus tard.',
    ],
    tip: 'Exemples : nom du club, de la maquette, ou de l\'organisation.',
  },
  {
    title: '2. Créez un projet',
    content: [
      'Chaque projet représente une journée simulée. Vous définissez une durée (entre 2 et 30 minutes) qui correspond à 24 heures réelles.',
      'Exemple : 10 minutes = 24h. Une intention de 1 minute sur la timeline représente donc environ 2h30 de la journée.',
      'Ouvrez votre espace de travail, puis cliquez sur "Nouveau projet" pour en créer un.',
    ],
    tip: 'Pour une démo rapide : 2–5 min. Pour une scène détaillée : 15–30 min.',
  },
  {
    title: '3. Ajoutez un module',
    content: [
      'Un module Lumirail peut être de différents types (carte LED, etc.). Chaque module a des sorties que vous contrôlez via les scènes. Les modules ne sont pas connectés directement à l\'ordinateur.',
      'Le DigiKey est le dongle officiel Lumirail : il permet notamment de télécharger les scènes dans les modules. En mode Desktop, connectez le DigiKey via USB, puis connectez le module au DigiKey pour récupérer automatiquement ses informations.',
      'Dans le projet, cliquez sur le bouton + à côté de "Modules" pour ajouter un module. Chaque module possède sa propre timeline avec des intentions (ON, OFF, effets) que vous placez sur la durée du projet.',
    ],
    tip: 'En mode Desktop : connectez le DigiKey et le module avant d\'ajouter pour préremplir ses données.',
  },
  {
    title: '4. Éditez les scènes',
    content: [
      'La timeline principale (en haut) affiche la durée du projet avec des repères (bookmarks) et le cycle jour/nuit.',
      'Sur chaque module, glissez des intentions sur la timeline : allumage, extinction, ou effets prédéfinis (lever/coucher de soleil, etc.).',
      'Utilisez Ctrl + molette pour zoomer sur la timeline.',
    ],
    tip: 'Les moments (zones colorées) définissent des plages jour/nuit personnalisées.',
  },
  {
    title: '5. Téléchargez la scène',
    content: [
      'Une fois votre scène prête, utilisez "Téléverser la scène" pour l\'envoyer dans le module. Connectez le DigiKey via USB, connectez le module au DigiKey, puis lancez le téléversement.',
      'Le DigiKey transfère les données vers le module. Une fois terminé et le module déconnecté du DigiKey, il exécutera la scène selon les paramètres définis.',
    ],
    tip: 'Paramètres > Données : exportez ou importez une sauvegarde JSON.',
  },
]

export function TutorialOverlay() {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(true)

  const dismiss = useCallback(() => {
    setTutorialDismissed(true)
    setVisible(false)
  }, [])

  const next = useCallback(() => {
    if (step < STEPS.length - 1) setStep((s) => s + 1)
    else dismiss()
  }, [step, dismiss])

  const prev = useCallback(() => {
    if (step > 0) setStep((s) => s - 1)
  }, [step])

  const skip = useCallback(() => dismiss(), [dismiss])

  if (!visible) return null

  const current = STEPS[step]
  const isFirst = step === 0
  const isLast = step === STEPS.length - 1

  return (
    <div className="tutorial-overlay" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
      <div className="tutorial-backdrop" onClick={skip} aria-hidden />
      <div className="tutorial-card">
        <p className="tutorial-step-indicator" aria-hidden>
          {step + 1} / {STEPS.length}
        </p>
        <h2 id="tutorial-title" className="tutorial-title">{current.title}</h2>
        <div className="tutorial-content">
          {current.content.map((paragraph, i) => (
            <p key={i} className="tutorial-desc">{paragraph}</p>
          ))}
          {current.tip && (
            <p className="tutorial-tip">
              <span className="tutorial-tip-label">Conseil</span>
              {current.tip}
            </p>
          )}
        </div>
        <div className="tutorial-progress">
          {STEPS.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`tutorial-dot ${i === step ? 'tutorial-dot-active' : ''}`}
              aria-current={i === step ? 'step' : undefined}
              aria-label={`Étape ${i + 1}`}
              onClick={() => setStep(i)}
            />
          ))}
        </div>
        <div className="tutorial-actions">
          <button type="button" className="btn btn-ghost" onClick={skip}>
            Passer
          </button>
          <div className="tutorial-nav">
            {!isFirst && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={prev} aria-label="Étape précédente">
                <ChevronLeft size={18} strokeWidth={2.5} aria-hidden />
                Précédent
              </button>
            )}
            <button type="button" className="btn btn-primary tutorial-btn-next" onClick={next}>
              {isLast ? 'Commencer' : (
                <>
                  Suivant
                  <ChevronRight size={18} strokeWidth={2.5} aria-hidden />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
