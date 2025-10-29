# LED Status Animations - LMS-S1-G2

## Vue d'ensemble

La LED WS2812B affiche différentes animations selon l'état du système. Toutes les animations utilisent une luminosité de **50%**.

**Fréquence de mise à jour** : 30ms

---

## États et Animations

### 🔵 INIT (Initialisation)
**Couleur** : Cyan (G + B)  
**Animation** : Respiration (fade in/out)  
**Durée du cycle** : 100 cycles (~3.0s)  
- Phase 1 (0-50) : Fade in du cyan
- Phase 2 (50-100) : Fade out du cyan

---

### 🔴 IO_ERROR (Erreur I/O)
**Couleur** : Rouge  
**Animation** : Clignotement  
**Durée du cycle** : 20 cycles (~0.6s)  
- Phase 1 (0-10) : LED allumée (rouge)
- Phase 2 (10-20) : LED éteinte

---

### 🟠 COMM_ERROR (Erreur de communication)
**Couleur** : Orange (R + G)  
**Animation** : Pulsation continue  
**Durée du cycle** : 60 cycles (~1.8s)  
- Phase 1 (0-30) : Fade in orange
- Phase 2 (30-60) : Fade out orange

---

### 🔵 WAITING_PAIR (En attente d'appairage)
**Couleur** : Bleu  
**Animation** : Respiration bleue  
**Durée du cycle** : 80 cycles (~2.4s)  
- Phase 1 (0-40) : Fade in bleu
- Phase 2 (40-80) : Fade out bleu

---

### 🟢 PAIRED (Appairé)
**Couleur** : Vert  
**Animation** : Respiration verte douce  
**Durée du cycle** : 120 cycles (~3.6s)  
- Phase 1 (0-60) : Fade in vert (80-255)
- Phase 2 (60-120) : Fade out vert (255-80)

---

### ⚪ COMMAND_RECEIVED (Commande reçue)
**Couleur** : Blanc  
**Animation** : Flash court  
**Durée du cycle** : 15 cycles (~0.45s)  
- Phase 1 (0-5) : Flash blanc
- Phase 2 (5-15) : LED éteinte
- **Note** : Revient automatiquement à l'état précédent après le flash

---

### 🟠 UNPAIRED (Non appairé)
**Couleur** : Orange  
**Animation** : Pulsation orange  
**Durée du cycle** : 60 cycles (~1.8s)  
- Phase 1 (0-30) : Fade in orange
- Phase 2 (30-60) : Fade out orange

---

### 🌈 RESETTING (Réinitialisation)
**Couleur** : Arc-en-ciel cyclique  
**Animation** : Transition de couleur continue  
**Durée du cycle** : 40 cycles (~1.2s)  
- Transition complète du spectre RGB (Rouge → Jaune → Vert → Cyan → Bleu → Magenta → Rouge)

---

### 🟡 POWER_LOW (Batterie faible)
**Couleur** : Jaune/Orange  
**Animation** : Respiration  
**Durée du cycle** : 40 cycles (~1.2s)  
- Phase 1 (0-20) : Fade in jaune/orange
- Phase 2 (20-40) : Fade out jaune/orange

---

### 🔴 SHORT_CIRCUIT (Court-circuit)
**Couleur** : Rouge  
**Animation** : Clignotement rapide  
**Durée du cycle** : 4 cycles (~0.12s)  
- Phase 1 (0-2) : LED allumée (rouge)
- Phase 2 (2-4) : LED éteinte

---

### 🟠 OVERCURRENT (Surcharge)
**Couleur** : Orange  
**Animation** : Pulsation rapide  
**Durée du cycle** : 30 cycles (~0.9s)  
- Phase 1 (0-15) : Fade in orange
- Phase 2 (15-30) : Fade out orange

---

### 🔴 TEMP_OVERHEAT_POWER (Surchauffe - Alimentation)
**Couleur** : Rouge  
**Animation** : Pulsation rouge  
**Durée du cycle** : 30 cycles (~0.9s)  
- Phase 1 (0-15) : Fade in rouge
- Phase 2 (15-30) : Fade out rouge

---

### 🟠 TEMP_OVERHEAT_LED1 (Surchauffe - Driver LED 1)
**Couleur** : Orange  
**Animation** : Pulsation orange  
**Durée du cycle** : 30 cycles (~0.9s)  
- Phase 1 (0-15) : Fade in orange
- Phase 2 (15-30) : Fade out orange

---

### 🟣 TEMP_OVERHEAT_LED2 (Surchauffe - Driver LED 2)
**Couleur** : Violet (R + B)  
**Animation** : Pulsation violette  
**Durée du cycle** : 30 cycles (~0.9s)  
- Phase 1 (0-15) : Fade in violet
- Phase 2 (15-30) : Fade out violet

---

## Priorité des États

Les états sont vérifiés dans cet ordre de priorité (du plus au moins urgent) :

1. **TEMP_OVERHEAT_*** (Surchauffe)
2. **COMM_ERROR**, **IO_ERROR** (Erreurs système)
3. **OVERCURRENT**, **SHORT_CIRCUIT**, **POWER_LOW** (Erreurs électriques)
4. **COMMAND_RECEIVED** (Flash temporaire)
5. **RESETTING** (Réinitialisation)
6. **PAIRED**, **WAITING_PAIR**, **UNPAIRED** (États normaux)
7. **INIT** (Démarrage)

---

## Détails Techniques

- **Bibliothèque** : Adafruit NeoPixel
- **Format** : NEO_GRB + NEO_KHZ800
- **Pin** : GPIO 4
- **Nombre de LED** : 1
- **Luminosité globale** : 50%

