import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, Keyboard, BookOpen, List, Zap, Database } from 'lucide-react'
import { INTENTION_DEFS } from '../components/intention-definitions'
import { useHelp } from '../context/useHelp'
import { HELP_SECTIONS } from '../lib/helpSections'

export function HelpPage() {
  const { hash } = useLocation()
  const { setActiveSectionId } = useHelp()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hash) return
    const id = hash.slice(1)
    setActiveSectionId(id)
    const container = containerRef.current
    const el = document.getElementById(id)
    if (!container || !el) return
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const scrollTop = container.scrollTop + rect.top - containerRect.top - 16
      container.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' })
    })
  }, [hash, setActiveSectionId])

  useEffect(() => {
    return () => setActiveSectionId(null)
  }, [setActiveSectionId])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ids = HELP_SECTIONS.map((s) => s.id)
    const elements = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el)
    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length === 0) return
        const topmost = visible.reduce((a, b) =>
          (a.boundingClientRect.top < b.boundingClientRect.top ? a : b)
        )
        const id = topmost.target.id
        if (ids.includes(id)) setActiveSectionId(id)
      },
      {
        root: container,
        rootMargin: '-10% 0px -70% 0px',
        threshold: 0,
      }
    )

    elements.forEach((el) => observer.observe(el))
    return () => elements.forEach((el) => observer.unobserve(el))
  }, [setActiveSectionId])

  return (
    <div ref={containerRef} className="app-layout home-layout help-page">
      <header className="home-hero" aria-label="Aide">
        <Link to="/" className="settings-back-link">
          <ArrowLeft size={18} strokeWidth={2.5} aria-hidden />
          Retour
        </Link>
        <div className="home-hero-copy">
          <div className="home-kicker">Documentation</div>
          <h1 className="page-title">Centre d&apos;aide</h1>
          <p className="page-description">
            Raccourcis clavier, fonctionnement et glossaire de Lumirail Studio.
          </p>
        </div>
      </header>

      <section className="help-section" id="help-shortcuts" aria-labelledby="help-shortcuts-heading">
        <h2 id="help-shortcuts-heading" className="section-heading">
          <Keyboard size={20} strokeWidth={2} aria-hidden />
          Raccourcis clavier
        </h2>
        <p className="help-intro">Les raccourcis varient selon le contexte. Sur Mac, remplacez Ctrl par Cmd.</p>

        <div className="help-subsection">
          <h3>Global (hors champs de saisie)</h3>
          <dl className="help-shortcut-list">
            <div className="help-shortcut-row">
              <dt><kbd>Ctrl</kbd> + <kbd>Z</kbd></dt>
              <dd>Annuler la dernière action</dd>
            </div>
            <div className="help-shortcut-row">
              <dt><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd></dt>
              <dd>Rétablir</dd>
            </div>
            <div className="help-shortcut-row">
              <dt><kbd>Ctrl</kbd> + <kbd>Y</kbd></dt>
              <dd>Rétablir</dd>
            </div>
          </dl>
        </div>

        <div className="help-subsection">
          <h3>Timeline (vue projet ou module)</h3>
          <dl className="help-shortcut-list">
            <div className="help-shortcut-row">
              <dt><kbd>Ctrl</kbd> + molette</dt>
              <dd>Zoomer / dézoomer sur la timeline</dd>
            </div>
            <div className="help-shortcut-row">
              <dt><kbd>Ctrl</kbd> + <kbd>Z</kbd></dt>
              <dd>Annuler</dd>
            </div>
            <div className="help-shortcut-row">
              <dt><kbd>Ctrl</kbd> + <kbd>Y</kbd></dt>
              <dd>Rétablir</dd>
            </div>
          </dl>
        </div>

        <div className="help-subsection">
          <h3>Timeline module (intentions sélectionnées)</h3>
          <dl className="help-shortcut-list">
            <div className="help-shortcut-row">
              <dt><kbd>Ctrl</kbd> + <kbd>C</kbd></dt>
              <dd>Copier l&apos;intention sélectionnée (une seule)</dd>
            </div>
            <div className="help-shortcut-row">
              <dt><kbd>Ctrl</kbd> + <kbd>V</kbd></dt>
              <dd>Coller (cliquer pour placer)</dd>
            </div>
            <div className="help-shortcut-row">
              <dt><kbd>Ctrl</kbd> + <kbd>A</kbd></dt>
              <dd>Tout sélectionner</dd>
            </div>
            <div className="help-shortcut-row">
              <dt><kbd>Suppr</kbd> / <kbd>Retour arrière</kbd></dt>
              <dd>Supprimer les intentions sélectionnées</dd>
            </div>
            <div className="help-shortcut-row">
              <dt><kbd>Échap</kbd></dt>
              <dd>Annuler le mode collage</dd>
            </div>
          </dl>
        </div>

        <div className="help-subsection">
          <h3>Fenêtres et dialogues</h3>
          <dl className="help-shortcut-list">
            <div className="help-shortcut-row">
              <dt><kbd>Échap</kbd></dt>
              <dd>Fermer le dialogue</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="help-section" id="help-fonctions" aria-labelledby="help-fonctions-heading">
        <h2 id="help-fonctions-heading" className="section-heading">
          <BookOpen size={20} strokeWidth={2} aria-hidden />
          Fonctionnement
        </h2>

        <div className="help-subsection">
          <h3>Structure des données</h3>
          <p>Espace de travail → Projet → Module. Un espace regroupe des projets (ex. association, maquette). Un projet a une durée (2–30 min = 24h simulées). Un module contient des intentions sur une timeline.</p>
        </div>

        <div className="help-subsection">
          <h3>Timeline principale</h3>
          <p>Représente la durée du projet. Bookmarks (repères), piste Moments (cycle jour/nuit), pistes par module. La durée du projet en minutes correspond à 24 heures simulées.</p>
        </div>

        <div className="help-subsection">
          <h3>Intentions sur un module</h3>
          <p>Glisser-déposer pour créer, déplacer ou redimensionner. Clic droit pour modifier le type ou les paramètres. Certains effets nécessitent une sortie PWM.</p>
        </div>
      </section>

      <section className="help-section" id="help-intentions" aria-labelledby="help-intentions-heading">
        <h2 id="help-intentions-heading" className="section-heading">
          <Zap size={20} strokeWidth={2} aria-hidden />
          Types d&apos;intentions
        </h2>
        <dl className="help-intention-list">
          {INTENTION_DEFS.map((def) => (
            <div key={def.kind} className="help-intention-row">
              <dt>{def.label}</dt>
              <dd>
                {def.description}
                {def.requiresPwm && <span className="help-pwm-badge">PWM</span>}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="help-section" id="help-modules" aria-labelledby="help-modules-heading">
        <h2 id="help-modules-heading" className="section-heading">
          Modules et DigiKey
        </h2>

        <div className="help-subsection">
          <h3>Ajouter un module</h3>
          <p>Dans un projet, cliquez sur le bouton + à côté de "Modules". Saisissez le numéro de série (format LMS-XX-XX-XX-XX-XX) ou utilisez "Scanner avec le DigiKey" si le module est connecté au dongle.</p>
        </div>

        <div className="help-subsection">
          <h3>DigiKey et téléversement</h3>
          <p>Le DigiKey est le dongle officiel Lumirail. Connectez-le en USB, connectez le module au DigiKey, puis utilisez "Téléverser la scène" pour envoyer la scène. Le module exécute la scène selon ses paramètres une fois déconnecté du DigiKey.</p>
        </div>
      </section>

      <section className="help-section" id="help-donnees" aria-labelledby="help-donnees-heading">
        <h2 id="help-donnees-heading" className="section-heading">
          <Database size={20} strokeWidth={2} aria-hidden />
          Données et sauvegarde
        </h2>

        <div className="help-subsection">
          <h3>Export / Import</h3>
          <p>Paramètres &gt; Données : téléchargez une sauvegarde JSON de vos espaces, projets et modules. Utilisez "Restaurer une sauvegarde" pour importer un fichier JSON.</p>
        </div>

        <div className="help-subsection">
          <h3>Effacer les données</h3>
          <p>Paramètres &gt; Données : "Effacer toutes les données" supprime définitivement espaces, projets et modules. Une confirmation est demandée.</p>
        </div>
      </section>

      <section className="help-section" id="help-glossaire" aria-labelledby="help-glossaire-heading">
        <h2 id="help-glossaire-heading" className="section-heading">
          <List size={20} strokeWidth={2} aria-hidden />
          Glossaire
        </h2>
        <dl className="help-glossary">
          <div className="help-glossary-row">
            <dt>Bookmark</dt>
            <dd>Repère sur la timeline principale (ex. "Lever du soleil"). Partagé entre tous les modules du projet.</dd>
          </div>
          <div className="help-glossary-row">
            <dt>DigiKey</dt>
            <dd>Dongle officiel Lumirail. Permet de télécharger les scènes dans les modules et de récupérer leurs informations.</dd>
          </div>
          <div className="help-glossary-row">
            <dt>Intention</dt>
            <dd>Élément sur la timeline d&apos;un module : allumage, extinction ou effet. Définit le comportement d&apos;une sortie sur un intervalle de temps.</dd>
          </div>
          <div className="help-glossary-row">
            <dt>LFP</dt>
            <dd>Format de fichier Lumirail pour les scènes. Utilisé lors du téléversement vers un module.</dd>
          </div>
          <div className="help-glossary-row">
            <dt>Module</dt>
            <dd>Équipement Lumirail (carte LED ou autre type). Possède des sorties contrôlées par les intentions de la scène.</dd>
          </div>
          <div className="help-glossary-row">
            <dt>Moment</dt>
            <dd>Zone colorée sur la piste Moments. Définit une plage jour/nuit (ex. "Nuit", "Jour") avec couleurs personnalisables.</dd>
          </div>
          <div className="help-glossary-row">
            <dt>PWM</dt>
            <dd>Modulation de largeur d&apos;impulsion. Certains effets (respiration, vacillement, fade) nécessitent une sortie PWM pour varier l&apos;intensité.</dd>
          </div>
          <div className="help-glossary-row">
            <dt>Scène</dt>
            <dd>Ensemble des intentions d&apos;un module sur la durée du projet. Définit le comportement d&apos;éclairage (ou autre) du module.</dd>
          </div>
          <div className="help-glossary-row">
            <dt>Sortie</dt>
            <dd>Canal de sortie d&apos;un module (LED, relais, etc.). Chaque intention est associée à une sortie.</dd>
          </div>
          <div className="help-glossary-row">
            <dt>Téléversement</dt>
            <dd>Envoi de la scène depuis l&apos;ordinateur vers le module via le DigiKey.</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
