# LumiRail – Spécification complète Upload & Stockage LFP

## Contexte global

**Chaîne complète :**

```
WebApp
  → WebSerial UART 115200
ESP32 (Digi-Key)  [bridge intelligent]
  → UART 115200
ESP8266 Module    [stockage + lecture scène]
```

Le fichier transféré est un **.lfp** (LumiRail Frame Package) :
- binaire pur
- prêt à être lu
- frames RAW u8
- aucune logique de scène côté firmware module

---

## Format du fichier .LFP (rappel)

- Header fixe 32 octets, MAGIC = "LFP1"
- Directory minimal "DIR1"
- 1 chunk FRAM en RAW
- FRAMES = FRAME_COUNT × CHANNEL_COUNT octets
- valeurs 0 / 255 (On/Off)
- lecture séquentielle à TICK_MS

Détail du protocole de lecture et vérification : [lfp-protocol.md](./lfp-protocol.md).

Le firmware ne modifie **jamais** un .lfp, il ne fait que le stocker et le lire.

---

## Stockage côté module (ESP8266)

Pour chaque slot x :

| Fichier     | Rôle                          |
|-------------|-------------------------------|
| `scene_x.tmp` | Zone de réception (upload en cours) |
| `scene_x.bin` | Scène active (jouée)          |
| `scene_x.bak` | Backup sécurité (ancienne scène)   |

**Important :** `scene_x.bin` ne doit **jamais** être modifié pendant un upload.

---

## Transaction atomique (sécurité)

### Upload

1. Écrire le fichier complet dans `scene_x.tmp`
2. Vérifier CRC32 global
3. Valider le LFP :
   - MAGIC
   - CRC header
   - CRC directory
   - CRC chunk FRAM

### Commit

1. `scene_x.bin` → `scene_x.bak`
2. `scene_x.tmp` → `scene_x.bin`

### Résilience

- Coupure pendant upload → `.bin` intact
- Coupure pendant commit → rollback possible via `.bak`
- Reboot → recovery automatique

---

## Protocole de transport série

### Framing (transport)

```
SOF(2) | VER(1) | TYPE(1) | SEQ(1) | LEN(2) | PAYLOAD | CRC16(2)
```

- **SOF** = `0x55 0xAA`
- **VER** = `0x01`
- **CRC16** = CRC16-CCITT-FALSE
- CRC16 protège le transport
- CRC32 protège les données

---

## Découpage fichier

- **PAGE_SIZE** = 512 octets
- **PAGE_COUNT** = ceil(file_size / PAGE_SIZE)
- CRC32 par page
- CRC32 global du fichier

---

## Messages du protocole

### HELLO

- `client_id` u32

### HELLO_ACK

- `fw_version` u16
- `page_size_supported` u16
- `max_window` u8

### BEGIN

- `file_type` u16 (1 = LFP)
- `file_size` u32
- `file_crc32` u32
- `page_size` u16
- `page_count` u16
- `slot_id` u8
- `session_id` u32

### BEGIN_ACK

- `session_id` u32
- `resume_mode` u8
- `next_required_page` u16 (ACK cumulatif)

### DATA

- `session_id` u32
- `page_index` u16
- `page_len` u16
- `page_crc32` u32
- `page_data` bytes

Le module :
- vérifie CRC32 page
- écrit dans `scene_x.tmp` à offset = page_index × PAGE_SIZE

### ACK

- `session_id` u32
- `ack_base` u16 (toutes les pages < ack_base sont OK)

### NACK

- `session_id` u32
- `page_index` u16

### END

- `session_id` u32

### END_ACK

- `session_id` u32
- `status` u8
- `error_code` u8

Si status == OK :
- commit atomique `scene_x.tmp` → `scene_x.bin`
- backup `scene_x.bin` → `scene_x.bak`

---

## Fenêtre / performance

- **window** = 8 pages
- envoi en rafale sans attendre chaque ACK
- ACK cumulatif + retransmission minimale
- .lfp ~24 KB → ~3 secondes à 115200 baud

---

## Rôles des agents

### WebApp (upload)

- génère le .lfp
- calcule CRC32 global
- découpe en pages 512 octets
- envoie uniquement à l’ESP32 (DigiKey)
- flow-control logiciel : attendre ACK ESP32
- ne parle jamais directement au module

### ESP32 (Digi-Key)

- bridge intelligent
- gère framing, CRC16, window, retry, timeout
- protège WebSerial ↔ UART
- ACK côté Web uniquement après ACK module
- ne stocke pas la scène

### ESP8266 (module)

- reçoit pages UART
- écrit dans `scene_x.tmp`
- vérifie CRC32 page + global
- valide structure LFP
- commit atomique .tmp → .bin
- gère recovery au boot
- joue uniquement `scene_x.bin`

---

## Règles finales

- **CRC16** = transport
- **CRC32** = données
- jamais d’écriture directe sur .bin
- upload reprenable
- aucune corruption possible
