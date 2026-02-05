import { useState, useCallback } from 'react'
import { getTutorialDismissed, setTutorialDismissed } from '../lib/preferences'

const STEPS = [
  { title: 'Espaces de travail', desc: 'Organisez vos projets dans des espaces de travail.' },
  { title: 'Projets', desc: 'Chaque projet a une duree (2-30 min) qui represente 24h simulees.' },
  { title: 'Modules', desc: 'Ajoutez des modules et editez leurs scenes dans la timeline.' },
  { title: 'Scenes', desc: 'Les scenes definissent l\'eclairage de vos modules sur la duree du projet.' },
]

export function TutorialOverlay() {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(() => !getTutorialDismissed())

  const dismiss = useCallback(() => {
    setTutorialDismissed(true)
    setVisible(false)
  }, [])

  const next = useCallback(() => {
    if (step < STEPS.length - 1) setStep((s) => s + 1)
    else dismiss()
  }, [step, dismiss])

  const skip = useCallback(() => dismiss(), [dismiss])

  if (!visible) return null

  const current = STEPS[step]
  return (
    <div className="tutorial-overlay" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
      <div className="tutorial-backdrop" onClick={skip} aria-hidden />
      <div className="tutorial-card">
        <h2 id="tutorial-title" className="tutorial-title">{current.title}</h2>
        <p className="tutorial-desc">{current.desc}</p>
        <div className="tutorial-progress">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`tutorial-dot ${i === step ? 'tutorial-dot-active' : ''}`}
              aria-current={i === step ? 'step' : undefined}
            />
          ))}
        </div>
        <div className="tutorial-actions">
          <button type="button" className="btn btn-ghost" onClick={skip}>
            Passer
          </button>
          <button type="button" className="btn btn-primary" onClick={next}>
            {step < STEPS.length - 1 ? 'Suivant' : 'Commencer'}
          </button>
        </div>
      </div>
    </div>
  )
}
