import React, { useState, useMemo, useRef, useEffect } from 'react';
import { LEDId } from '../../shared/simulation/types';
import { useSimulationStore } from '../store/useSimulationStore';
import { MODULE_CHANNEL_COUNT } from '../../shared/simulation/hardware/types';

export interface EntityType {
  id: string;
  name: string;
  category: string;
  icon?: string;
  defaultZones?: string[];
}

export interface SchedulePeriod {
  id: string;
  startHour: number;
  endHour: number;
  intensity: number;
  randomEnabled: boolean;
  randomDurationMinutes?: number;
  randomMinOccurrences?: number;
  randomMaxOccurrences?: number;
  randomMinSpacingHours?: number;
}

export interface ZoneSchedule {
  periods: SchedulePeriod[];
}

export interface EntityZone {
  id: string;
  name: string;
  ledIds: LEDId[];
  schedule?: ZoneSchedule;
}

export interface Entity {
  id: string;
  type: EntityType;
  zones: EntityZone[];
}

interface LEDUsage {
  entityId: string;
  entityName: string;
  zoneName: string;
}

interface LEDSelectorProps {
  maxLEDs: number;
  selectedLEDs: LEDId[];
  disabledLEDs: Set<LEDId>;
  ledUsageMap: Map<LEDId, LEDUsage>;
  getLEDLabel: (ledId: LEDId) => string;
  getLEDUsageTooltip: (usage: LEDUsage) => string;
  onChange: (ledIds: LEDId[]) => void;
}

const LEDSelector: React.FC<LEDSelectorProps> = ({
  maxLEDs,
  selectedLEDs,
  disabledLEDs,
  ledUsageMap,
  getLEDLabel,
  getLEDUsageTooltip,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
    return undefined;
  }, [isOpen]);

  const filteredLEDs = useMemo(() => {
    if (!searchTerm) return Array.from({ length: maxLEDs }, (_, i) => (i + 1) as LEDId);
    const term = searchTerm.toLowerCase();
    return Array.from({ length: maxLEDs }, (_, i) => (i + 1) as LEDId).filter(ledId =>
      getLEDLabel(ledId).toLowerCase().includes(term)
    );
  }, [searchTerm, maxLEDs, getLEDLabel]);

  const handleToggleLED = (ledId: LEDId) => {
    if (disabledLEDs.has(ledId)) return;

    if (selectedLEDs.includes(ledId)) {
      onChange(selectedLEDs.filter(id => id !== ledId));
    } else {
      onChange([...selectedLEDs, ledId].sort((a, b) => a - b));
    }
  };

  const displayText = selectedLEDs.length > 0
    ? selectedLEDs.map(getLEDLabel).join(', ')
    : 'Select LEDs...';

  return (
    <div className="led-selector" ref={dropdownRef}>
      <div
        className="led-selector-input"
        onClick={() => setIsOpen(!isOpen)}
      >
        <input
          ref={inputRef}
          type="text"
          className="input"
          value={isOpen ? searchTerm : displayText}
          onChange={(e) => {
            if (!isOpen) setIsOpen(true);
            setSearchTerm(e.target.value);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Select LEDs..."
          readOnly={!isOpen}
        />
        <span className="led-selector-arrow">{isOpen ? '▲' : '▼'}</span>
      </div>
      {isOpen && (
        <div className="led-selector-dropdown">
          {filteredLEDs.length === 0 ? (
            <div className="led-selector-empty">No LEDs found</div>
          ) : (
            filteredLEDs.map((ledId) => {
              const isSelected = selectedLEDs.includes(ledId);
              const isDisabled = disabledLEDs.has(ledId);
              const usage = ledUsageMap.get(ledId);

              return (
                <label
                  key={ledId}
                  className={`led-selector-option ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                  title={isDisabled && usage ? getLEDUsageTooltip(usage) : getLEDLabel(ledId)}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={isDisabled}
                    onChange={() => handleToggleLED(ledId)}
                  />
                  <span className="led-selector-label">{getLEDLabel(ledId)}</span>
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export const ENTITY_ZONES: Record<string, string[]> = {
  'house-small': ['Chambre 1', 'Chambre 2', 'Salon', 'Cuisine', 'WC'],
  'house-medium': ['Chambre 1', 'Chambre 2', 'Chambre 3', 'Salon', 'Cuisine', 'Salle de bain', 'WC'],
  'house-large': ['Chambre 1', 'Chambre 2', 'Chambre 3', 'Chambre 4', 'Salon', 'Cuisine', 'Salle à manger', 'Salle de bain', 'WC'],
  'residential-building': ['Appartement 1', 'Appartement 2', 'Appartement 3', 'Hall', 'Escalier'],
  'residence': ['Bâtiment 1', 'Bâtiment 2', 'Bâtiment 3', 'Allée principale', 'Parking'],
  'mixed-building': ['Résidentiel étage 1', 'Résidentiel étage 2', 'Commerce rez-de-chaussée', 'Hall'],
  'shop-standard': ['Vitrine', 'Intérieur', 'Enseigne'],
  'supermarket': ['Entrée', 'Rayon 1', 'Rayon 2', 'Rayon 3', 'Caisse'],
  'restaurant': ['Salle principale', 'Terrasse', 'Bar', 'Cuisine'],
  'warehouse': ['Entrée', 'Zone stockage 1', 'Zone stockage 2', 'Quai'],
  'sign': ['Enseigne'],
  'station': ['Hall', 'Quai 1', 'Quai 2', 'Escalier'],
  'streetlight-road': ['Luminaire 1', 'Luminaire 2'],
  'streetlight-pedestrian': ['Luminaire'],
  'parking-lighting': ['Zone 1', 'Zone 2', 'Zone 3'],
  'platform-lighting': ['Quai 1', 'Quai 2', 'Hall'],
  'tunnel-lighting': ['Entrée', 'Zone centrale', 'Sortie'],
  'construction-road': ['Barrière 1', 'Barrière 2', 'Balise 1', 'Balise 2'],
  'barrier-light': ['Barrière 1', 'Barrière 2'],
  'beacon-construction': ['Balise 1', 'Balise 2', 'Balise 3'],
  'road-block': ['Barrière 1', 'Barrière 2', 'Gyrophare'],
  'temporary-installation': ['Zone 1', 'Zone 2', 'Zone 3'],
  'power-pole': ['Feu principal'],
  'substation': ['Local technique', 'Extérieur'],
  'wind-turbine': ['Balisage 1', 'Balisage 2', 'Balisage 3'],
  'antenna': ['Feu principal'],
  'aircraft-obstacle': ['Feu 1', 'Feu 2', 'Feu 3'],
  'vehicle-parked': ['Phare gauche', 'Phare droit'],
  'vehicle-construction': ['Gyrophare', 'Éclairage travail'],
  'crane': ['Feu principal', 'Éclairage cabine'],
  'train-stopped': ['Éclairage intérieur', 'Signalisation'],
  'wagon-technical': ['Éclairage', 'Signalisation'],
  'traffic-light': ['Feu principal'],
  'railway-signal': ['Signal'],
  'beacon-rotating': ['Gyrophare'],
  'alarm-light': ['Alarme'],
  'safety-beacon': ['Balise'],
  'christmas-decoration': ['Décor 1', 'Décor 2', 'Décor 3'],
  'garland-urban': ['Guirlande 1', 'Guirlande 2', 'Guirlande 3'],
  'festive-lighting': ['Zone 1', 'Zone 2', 'Zone 3'],
  'art-installation': ['Installation'],
};

export const ENTITY_CATEGORIES: Record<string, EntityType[]> = {
  '🏠 Habitat': [
    { id: 'house-small', name: 'Maison individuelle (petite)', category: '🏠 Habitat', defaultZones: ENTITY_ZONES['house-small'] },
    { id: 'house-medium', name: 'Maison individuelle (moyenne)', category: '🏠 Habitat', defaultZones: ENTITY_ZONES['house-medium'] },
    { id: 'house-large', name: 'Maison individuelle (grande)', category: '🏠 Habitat', defaultZones: ENTITY_ZONES['house-large'] },
    { id: 'residential-building', name: 'Immeuble résidentiel', category: '🏠 Habitat' },
    { id: 'residence', name: 'Résidence / cité', category: '🏠 Habitat' },
    { id: 'mixed-building', name: 'Bâtiment mixte (habitation + commerce)', category: '🏠 Habitat' },
  ],
  '🏪 Commerce & activité': [
    { id: 'shop-standard', name: 'Commerce standard', category: '🏪 Commerce & activité' },
    { id: 'supermarket', name: 'Supermarché', category: '🏪 Commerce & activité' },
    { id: 'restaurant', name: 'Restaurant / bar', category: '🏪 Commerce & activité' },
    { id: 'warehouse', name: 'Entrepôt / hangar', category: '🏪 Commerce & activité' },
    { id: 'sign', name: 'Enseigne lumineuse seule', category: '🏪 Commerce & activité' },
    { id: 'station', name: 'Gare / Arrêt de bus / Metro', category: '🏪 Commerce & activité' },
  ],
  '🚦 Éclairage public': [
    { id: 'streetlight-road', name: 'Lampadaire de route', category: '🚦 Éclairage public' },
    { id: 'streetlight-pedestrian', name: 'Lampadaire de rue/piéton', category: '🚦 Éclairage public' },
    { id: 'parking-lighting', name: 'Éclairage de parking', category: '🚦 Éclairage public' },
    { id: 'platform-lighting', name: 'Éclairage de quai / gare', category: '🚦 Éclairage public' },
    { id: 'tunnel-lighting', name: 'Éclairage tunnel / passage', category: '🚦 Éclairage public' },
  ],
  '🚧 Infrastructures temporaires': [
    { id: 'construction-road', name: 'Chantier routier', category: '🚧 Infrastructures temporaires' },
    { id: 'barrier-light', name: 'Barrières lumineuses', category: '🚧 Infrastructures temporaires' },
    { id: 'beacon-construction', name: 'Balises de chantier', category: '🚧 Infrastructures temporaires' },
    { id: 'road-block', name: 'Barrage routier', category: '🚧 Infrastructures temporaires' },
    { id: 'temporary-installation', name: 'Installation temporaire (foire, événement)', category: '🚧 Infrastructures temporaires' },
  ],
  '⚡ Infrastructures techniques': [
    { id: 'power-pole', name: 'Pylône électrique', category: '⚡ Infrastructures techniques' },
    { id: 'substation', name: 'Sous-station / local technique', category: '⚡ Infrastructures techniques' },
    { id: 'wind-turbine', name: 'Éolienne (balisage)', category: '⚡ Infrastructures techniques' },
    { id: 'antenna', name: 'Antenne / mât', category: '⚡ Infrastructures techniques' },
    { id: 'aircraft-obstacle', name: 'Feux d\'obstacle aérien', category: '⚡ Infrastructures techniques' },
  ],
  '🚗 Véhicules & machines fixes': [
    { id: 'vehicle-parked', name: 'Véhicule stationné (phares off)', category: '🚗 Véhicules & machines fixes' },
    { id: 'vehicle-construction', name: 'Véhicule de chantier', category: '🚗 Véhicules & machines fixes' },
    { id: 'crane', name: 'Grue', category: '🚗 Véhicules & machines fixes' },
    { id: 'train-stopped', name: 'Train à l\'arrêt', category: '🚗 Véhicules & machines fixes' },
    { id: 'wagon-technical', name: 'Wagon technique', category: '🚗 Véhicules & machines fixes' },
  ],
  '🚨 Signalisation & sécurité': [
    { id: 'traffic-light', name: 'Feu de signalisation', category: '🚨 Signalisation & sécurité' },
    { id: 'railway-signal', name: 'Signal ferroviaire', category: '🚨 Signalisation & sécurité' },
    { id: 'beacon-rotating', name: 'Gyrophare', category: '🚨 Signalisation & sécurité' },
    { id: 'alarm-light', name: 'Alarme lumineuse', category: '🚨 Signalisation & sécurité' },
    { id: 'safety-beacon', name: 'Balise de sécurité', category: '🚨 Signalisation & sécurité' },
  ],
  '🎄 Décoratif / événementiel': [
    { id: 'christmas-decoration', name: 'Décoration de Noël', category: '🎄 Décoratif / événementiel' },
    { id: 'garland-urban', name: 'Guirlandes urbaines', category: '🎄 Décoratif / événementiel' },
    { id: 'festive-lighting', name: 'Éclairage festif', category: '🎄 Décoratif / événementiel' },
    { id: 'art-installation', name: 'Installation artistique', category: '🎄 Décoratif / événementiel' },
  ],
};

interface CreateEntityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (entityType: EntityType, zones: EntityZone[]) => void;
  maxLEDs: number;
  moduleCount: number;
  existingEntities?: Entity[];
}

const CreateEntityModal: React.FC<CreateEntityModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  maxLEDs,
  moduleCount: _moduleCount,
  existingEntities = []
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedEntityType, setSelectedEntityType] = useState<EntityType | null>(null);
  const [zones, setZones] = useState<EntityZone[]>([]);
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
  const [zoneActiveTab, setZoneActiveTab] = useState<Map<string, 'leds' | 'schedule'>>(new Map());
  const [draggingPeriod, setDraggingPeriod] = useState<{
    zoneId: string;
    periodId: string;
    mode: 'move' | 'resize-left' | 'resize-right';
    startX: number;
    startStartHour: number;
    startEndHour: number;
    trackWidth: number;
  } | null>(null);

  const ledUsageMap = useMemo(() => {
    const map = new Map<LEDId, LEDUsage>();
    existingEntities.forEach(entity => {
      entity.zones.forEach(zone => {
        zone.ledIds.forEach(ledId => {
          map.set(ledId, {
            entityId: entity.id,
            entityName: entity.type.name,
            zoneName: zone.name,
          });
        });
      });
    });
    return map;
  }, [existingEntities]);

  const getLEDLabel = (ledId: LEDId): string => {
    const moduleIndex = Math.floor((ledId - 1) / MODULE_CHANNEL_COUNT);
    const ledIndexInModule = ((ledId - 1) % MODULE_CHANNEL_COUNT) + 1;
    return `LMS#${moduleIndex}-${ledIndexInModule}`;
  };

  const getLEDUsageTooltip = (usage: LEDUsage): string => {
    return `Already used by ${usage.entityName} - ${usage.zoneName}`;
  };

  useEffect(() => {
    if (!draggingPeriod) return;

    const handleMouseMove = (e: MouseEvent) => {
      const hourDelta = ((e.clientX - draggingPeriod.startX) / draggingPeriod.trackWidth) * 24;

      setZones(currentZones => {
        const zone = currentZones.find(z => z.id === draggingPeriod.zoneId);
        if (!zone || !zone.schedule) return currentZones;

        const period = zone.schedule.periods.find(p => p.id === draggingPeriod.periodId);
        if (!period) return currentZones;

        let newStartHour = draggingPeriod.startStartHour;
        let newEndHour = draggingPeriod.startEndHour;

        if (draggingPeriod.mode === 'move') {
          const duration = draggingPeriod.startEndHour - draggingPeriod.startStartHour;
          newStartHour = Math.max(0, Math.min(23 - duration, draggingPeriod.startStartHour + hourDelta));
          newEndHour = newStartHour + duration;
        } else if (draggingPeriod.mode === 'resize-left') {
          newStartHour = Math.max(0, Math.min(draggingPeriod.startEndHour - 1, draggingPeriod.startStartHour + hourDelta));
        } else if (draggingPeriod.mode === 'resize-right') {
          newEndHour = Math.max(draggingPeriod.startStartHour + 1, Math.min(24, draggingPeriod.startEndHour + hourDelta));
        }

        return currentZones.map(z =>
          z.id === draggingPeriod.zoneId && z.schedule
            ? {
              ...z,
              schedule: {
                ...z.schedule,
                periods: z.schedule.periods.map(p =>
                  p.id === draggingPeriod.periodId
                    ? { ...p, startHour: Math.round(newStartHour), endHour: Math.round(newEndHour) }
                    : p
                ),
              },
            }
            : z
        );
      });
    };

    const handleMouseUp = () => {
      setDraggingPeriod(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingPeriod]);

  if (!isOpen) return null;

  const handleCancel = () => {
    setSelectedCategory(null);
    setSelectedEntityType(null);
    setZones([]);
    onClose();
  };

  const handleEntitySelect = (entityType: EntityType) => {
    setSelectedEntityType(entityType);
    const defaultZones = entityType.defaultZones || ENTITY_ZONES[entityType.id] || [];
    setZones(defaultZones.map((zoneName, index) => ({
      id: `zone-${index}`,
      name: zoneName,
      ledIds: [],
      schedule: {
        periods: [{
          id: `period-${index}-0`,
          startHour: 18,
          endHour: 23,
          intensity: 100,
          randomEnabled: false,
          randomDurationMinutes: 10,
          randomMinOccurrences: 1,
          randomMaxOccurrences: 2,
          randomMinSpacingHours: 2,
        }],
      },
    })));
    setExpandedZones(new Set(defaultZones.map((_, index) => `zone-${index}`)));
    setZoneActiveTab(new Map(defaultZones.map((_, index) => [`zone-${index}`, 'leds' as const])));
  };

  const handleBackToTypes = () => {
    setSelectedEntityType(null);
    setZones([]);
  };

  const handleBackToCategories = () => {
    setSelectedCategory(null);
    setSelectedEntityType(null);
    setZones([]);
  };

  const handleZoneLEDChange = (zoneId: string, ledIds: LEDId[]) => {
    setZones(currentZones => currentZones.map(zone =>
      zone.id === zoneId ? { ...zone, ledIds } : zone
    ));
  };


  const handleAddPeriod = (zoneId: string) => {
    setZones(currentZones => {
      const zone = currentZones.find(z => z.id === zoneId);
      if (!zone || !zone.schedule) return currentZones;

      const newPeriod: SchedulePeriod = {
        id: `period-${Date.now()}`,
        startHour: 0,
        endHour: 6,
        intensity: 50,
        randomEnabled: false,
        randomDurationMinutes: 10,
        randomMinOccurrences: 1,
        randomMaxOccurrences: 2,
        randomMinSpacingHours: 2,
      };

      return currentZones.map(z =>
        z.id === zoneId && z.schedule
          ? {
            ...z,
            schedule: {
              ...z.schedule,
              periods: [...z.schedule.periods, newPeriod],
            },
          }
          : z
      );
    });
  };

  const handleRemovePeriod = (zoneId: string, periodId: string) => {
    setZones(currentZones => {
      const zone = currentZones.find(z => z.id === zoneId);
      if (!zone || !zone.schedule) return currentZones;

      return currentZones.map(z =>
        z.id === zoneId && z.schedule
          ? {
            ...z,
            schedule: {
              ...z.schedule,
              periods: z.schedule.periods.filter(p => p.id !== periodId),
            },
          }
          : z
      );
    });
  };

  const handlePeriodChange = (zoneId: string, periodId: string, updates: Partial<SchedulePeriod>) => {
    setZones(currentZones => {
      const zone = currentZones.find(z => z.id === zoneId);
      if (!zone || !zone.schedule) return currentZones;

      return currentZones.map(z =>
        z.id === zoneId && z.schedule
          ? {
            ...z,
            schedule: {
              ...z.schedule,
              periods: z.schedule.periods.map(p =>
                p.id === periodId ? { ...p, ...updates } : p
              ),
            },
          }
          : z
      );
    });
  };

  const getDisabledLEDsForZone = (zoneId: string): Set<LEDId> => {
    const disabled = new Set<LEDId>();

    existingEntities.forEach(entity => {
      entity.zones.forEach(zone => {
        zone.ledIds.forEach(ledId => disabled.add(ledId));
      });
    });

    zones.forEach(zone => {
      if (zone.id !== zoneId) {
        zone.ledIds.forEach(ledId => disabled.add(ledId));
      }
    });

    return disabled;
  };

  const handleCreate = () => {
    if (selectedEntityType) {
      onCreate(selectedEntityType, zones);
      handleCancel();
    }
  };

  const categories = Object.keys(ENTITY_CATEGORIES);

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="modal-content entity-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            {selectedEntityType ? `Create ${selectedEntityType.name}` : 'Create Entity'}
          </h2>
          <button className="modal-close" onClick={handleCancel}>×</button>
        </div>
        <div className="modal-body">
          {!selectedCategory ? (
            <div className="entity-categories">
              {categories.map((category) => (
                <button
                  key={category}
                  className="entity-category-card"
                  onClick={() => setSelectedCategory(category)}
                >
                  <span className="category-icon">{category.split(' ')[0]}</span>
                  <span className="category-name">{category.substring(category.indexOf(' ') + 1)}</span>
                </button>
              ))}
            </div>
          ) : !selectedEntityType ? (
            <div className="entity-types-view">
              <button
                className="entity-back-button"
                onClick={handleBackToCategories}
              >
                ← Back
              </button>
              <h3 className="entity-category-title">{selectedCategory}</h3>
              <div className="entity-type-list">
                {ENTITY_CATEGORIES[selectedCategory].map((entityType) => (
                  <button
                    key={entityType.id}
                    className="entity-type-card"
                    onClick={() => handleEntitySelect(entityType)}
                  >
                    <span className="entity-type-name">{entityType.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="entity-zones-view">
              <button
                className="entity-back-button"
                onClick={handleBackToTypes}
              >
                ← Back
              </button>
              <div className="zones-config-header">
                <div>
                  <h3 className="entity-zones-title">Configure Zones</h3>
                  <p className="entity-zones-description">Configure LEDs and schedule for each zone (24h cycle)</p>
                </div>
              </div>

              <div className="zones-column-container">
                {zones.map((zone) => {
                  const disabledLEDs = getDisabledLEDsForZone(zone.id);
                  const schedule: ZoneSchedule = zone.schedule || {
                    periods: [{
                      id: `period-${zone.id}-0`,
                      startHour: 18,
                      endHour: 23,
                      intensity: 100,
                      randomEnabled: false,
                    }],
                  };
                  const isExpanded = expandedZones.has(zone.id);
                  const activeTab = zoneActiveTab.get(zone.id) || 'leds';

                  return (
                    <div key={zone.id} className="zone-accordion-card">
                      <div
                        className="zone-accordion-header"
                        onClick={() => {
                          const newExpanded = new Set(expandedZones);
                          if (isExpanded) {
                            newExpanded.delete(zone.id);
                          } else {
                            newExpanded.add(zone.id);
                          }
                          setExpandedZones(newExpanded);
                        }}
                      >
                        <div className="zone-accordion-title">
                          <span className="zone-accordion-icon">{isExpanded ? '▼' : '▶'}</span>
                          <h4 className="zone-label">{zone.name}</h4>
                          {zone.ledIds.length > 0 && (
                            <span className="zone-led-count">{zone.ledIds.length} LED(s)</span>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="zone-accordion-content">
                          <div className="zone-tabs">
                            <button
                              type="button"
                              className={`zone-tab ${activeTab === 'leds' ? 'active' : ''}`}
                              onClick={() => setZoneActiveTab(new Map(zoneActiveTab.set(zone.id, 'leds')))}
                            >
                              LED Assignment
                            </button>
                            <button
                              type="button"
                              className={`zone-tab ${activeTab === 'schedule' ? 'active' : ''}`}
                              onClick={() => setZoneActiveTab(new Map(zoneActiveTab.set(zone.id, 'schedule')))}
                            >
                              Schedule
                            </button>
                          </div>

                          <div className="zone-tab-content">
                            {activeTab === 'leds' && (
                              <div className="zone-tab-panel">
                                <LEDSelector
                                  maxLEDs={maxLEDs}
                                  selectedLEDs={zone.ledIds}
                                  disabledLEDs={disabledLEDs}
                                  ledUsageMap={ledUsageMap}
                                  getLEDLabel={getLEDLabel}
                                  getLEDUsageTooltip={getLEDUsageTooltip}
                                  onChange={(ledIds) => handleZoneLEDChange(zone.id, ledIds)}
                                />
                              </div>
                            )}

                            {activeTab === 'schedule' && (
                              <div className="zone-tab-panel">
                                <div className="zone-config-section">
                                  <div className="zone-section-header">
                                    <label className="zone-section-label">Schedule (24h cycle)</label>
                                    <button
                                      type="button"
                                      className="button small"
                                      onClick={() => handleAddPeriod(zone.id)}
                                    >
                                      + Add Period
                                    </button>
                                  </div>

                                  <div className="micro-timeline-container">
                                    <div className="micro-timeline-ruler">
                                      {Array.from({ length: 24 }, (_, i) => (
                                        <div key={i} className="micro-timeline-mark">
                                          <span className="micro-timeline-hour">{i}h</span>
                                        </div>
                                      ))}
                                    </div>

                                    <div className="micro-timeline-track">
                                      {schedule.periods.map((period) => {
                                        const startPercent = (period.startHour / 24) * 100;
                                        const widthPercent = ((period.endHour - period.startHour) / 24) * 100;
                                        const isDragging = draggingPeriod?.periodId === period.id;

                                        return (
                                          <div
                                            key={period.id}
                                            className={`micro-timeline-period ${isDragging ? 'dragging' : ''}`}
                                            style={{
                                              left: `${startPercent}%`,
                                              width: `${widthPercent}%`,
                                              opacity: period.intensity / 100,
                                            }}
                                            title={`${period.startHour}h - ${period.endHour}h (${period.intensity}%)`}
                                            onMouseDown={(e) => {
                                              const track = e.currentTarget.parentElement;
                                              if (!track) return;

                                              const trackRect = track.getBoundingClientRect();

                                              const resizeHandleWidth = 8;

                                              const periodElement = e.currentTarget;
                                              const periodRect = periodElement.getBoundingClientRect();
                                              const relativeX = e.clientX - periodRect.left;

                                              if (relativeX < resizeHandleWidth) {
                                                setDraggingPeriod({
                                                  zoneId: zone.id,
                                                  periodId: period.id,
                                                  mode: 'resize-left',
                                                  startX: e.clientX,
                                                  startStartHour: period.startHour,
                                                  startEndHour: period.endHour,
                                                  trackWidth: trackRect.width,
                                                });
                                              } else if (relativeX > periodRect.width - resizeHandleWidth) {
                                                setDraggingPeriod({
                                                  zoneId: zone.id,
                                                  periodId: period.id,
                                                  mode: 'resize-right',
                                                  startX: e.clientX,
                                                  startStartHour: period.startHour,
                                                  startEndHour: period.endHour,
                                                  trackWidth: trackRect.width,
                                                });
                                              } else {
                                                setDraggingPeriod({
                                                  zoneId: zone.id,
                                                  periodId: period.id,
                                                  mode: 'move',
                                                  startX: e.clientX,
                                                  startStartHour: period.startHour,
                                                  startEndHour: period.endHour,
                                                  trackWidth: trackRect.width,
                                                });
                                              }

                                              e.preventDefault();
                                              e.stopPropagation();
                                            }}
                                          >
                                            <div className="micro-timeline-period-resize-handle micro-timeline-period-resize-handle-left" />
                                            <div className="micro-timeline-period-content">
                                              <span className="micro-timeline-period-time">
                                                {period.startHour}h-{period.endHour}h
                                              </span>
                                              <span className="micro-timeline-period-intensity">{period.intensity}%</span>
                                            </div>
                                            <div className="micro-timeline-period-resize-handle micro-timeline-period-resize-handle-right" />
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  <div className="periods-list">
                                    {schedule.periods.map((period, index) => (
                                      <div key={period.id} className="period-config-card">
                                        <div className="period-header">
                                          <span className="period-number">Period {index + 1}</span>
                                          <button
                                            type="button"
                                            className="button-icon small"
                                            onClick={() => handleRemovePeriod(zone.id, period.id)}
                                            title="Remove period"
                                          >
                                            ×
                                          </button>
                                        </div>

                                        <div className="period-controls-grid">
                                          <div className="period-control-item">
                                            <label className="schedule-label">Start Hour</label>
                                            <input
                                              type="number"
                                              className="input schedule-input"
                                              min="0"
                                              max="23"
                                              value={period.startHour}
                                              onChange={(e) => {
                                                const hour = Math.max(0, Math.min(23, parseInt(e.target.value) || 0));
                                                handlePeriodChange(zone.id, period.id, { startHour: hour });
                                              }}
                                            />
                                            <span className="schedule-unit">h</span>
                                          </div>

                                          <div className="period-control-item">
                                            <label className="schedule-label">End Hour</label>
                                            <input
                                              type="number"
                                              className="input schedule-input"
                                              min="0"
                                              max="23"
                                              value={period.endHour}
                                              onChange={(e) => {
                                                const hour = Math.max(0, Math.min(23, parseInt(e.target.value) || 0));
                                                handlePeriodChange(zone.id, period.id, { endHour: hour });
                                              }}
                                            />
                                            <span className="schedule-unit">h</span>
                                          </div>

                                          <div className="period-control-item full-width">
                                            <label className="schedule-label">Intensity</label>
                                            <div className="intensity-control">
                                              <input
                                                type="range"
                                                className="intensity-slider"
                                                min="0"
                                                max="100"
                                                value={period.intensity}
                                                onChange={(e) => {
                                                  const intensity = parseInt(e.target.value) || 0;
                                                  handlePeriodChange(zone.id, period.id, { intensity });
                                                }}
                                              />
                                              <span className="intensity-value">{period.intensity}%</span>
                                              <span className="intensity-pwm">({Math.round(period.intensity * 2.54)})</span>
                                            </div>
                                          </div>

                                          <div className="period-control-item full-width">
                                            <label className="schedule-label">
                                              <input
                                                type="checkbox"
                                                checked={period.randomEnabled}
                                                onChange={(e) => {
                                                  handlePeriodChange(zone.id, period.id, {
                                                    randomEnabled: e.target.checked,
                                                    randomDurationMinutes: period.randomDurationMinutes ?? 10,
                                                    randomMinOccurrences: period.randomMinOccurrences ?? 1,
                                                    randomMaxOccurrences: period.randomMaxOccurrences ?? 2,
                                                    randomMinSpacingHours: period.randomMinSpacingHours ?? 2,
                                                  });
                                                }}
                                              />
                                              Random Variation
                                            </label>
                                            {period.randomEnabled && (
                                              <div className="random-config">
                                                <div className="random-config-grid">
                                                  <div className="random-config-item">
                                                    <label className="schedule-label">Duration (minutes)</label>
                                                    <input
                                                      type="number"
                                                      className="input schedule-input"
                                                      min="1"
                                                      max="1440"
                                                      value={period.randomDurationMinutes ?? 10}
                                                      onChange={(e) => {
                                                        const minutes = Math.max(1, Math.min(1440, parseInt(e.target.value) || 10));
                                                        handlePeriodChange(zone.id, period.id, {
                                                          randomDurationMinutes: minutes,
                                                        });
                                                      }}
                                                    />
                                                    <span className="schedule-unit">min</span>
                                                  </div>

                                                  <div className="random-config-item">
                                                    <label className="schedule-label">Min Occurrences</label>
                                                    <input
                                                      type="number"
                                                      className="input schedule-input"
                                                      min="1"
                                                      max="100"
                                                      value={period.randomMinOccurrences ?? 1}
                                                      onChange={(e) => {
                                                        const min = Math.max(1, Math.min(100, parseInt(e.target.value) || 1));
                                                        handlePeriodChange(zone.id, period.id, {
                                                          randomMinOccurrences: Math.min(min, period.randomMaxOccurrences ?? 100),
                                                        });
                                                      }}
                                                    />
                                                  </div>

                                                  <div className="random-config-item">
                                                    <label className="schedule-label">Max Occurrences</label>
                                                    <input
                                                      type="number"
                                                      className="input schedule-input"
                                                      min="1"
                                                      max="100"
                                                      value={period.randomMaxOccurrences ?? 2}
                                                      onChange={(e) => {
                                                        const max = Math.max(1, Math.min(100, parseInt(e.target.value) || 2));
                                                        handlePeriodChange(zone.id, period.id, {
                                                          randomMaxOccurrences: Math.max(max, period.randomMinOccurrences ?? 1),
                                                        });
                                                      }}
                                                    />
                                                  </div>

                                                  <div className="random-config-item">
                                                    <label className="schedule-label">Min Spacing</label>
                                                    <input
                                                      type="number"
                                                      className="input schedule-input"
                                                      min="0"
                                                      max="24"
                                                      step="0.5"
                                                      value={period.randomMinSpacingHours ?? 2}
                                                      onChange={(e) => {
                                                        const spacing = Math.max(0, Math.min(24, parseFloat(e.target.value) || 2));
                                                        handlePeriodChange(zone.id, period.id, {
                                                          randomMinSpacingHours: spacing,
                                                        });
                                                      }}
                                                    />
                                                    <span className="schedule-unit">h</span>
                                                  </div>
                                                </div>

                                                <div className="random-info">
                                                  <p className="random-info-text">
                                                    Random allumages: {period.randomMinOccurrences ?? 1}-{period.randomMaxOccurrences ?? 2} fois,
                                                    durée {period.randomDurationMinutes ?? 10} min,
                                                    espacés d'au moins {period.randomMinSpacingHours ?? 2}h
                                                  </p>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="modal-actions">
                <button type="button" className="button secondary" onClick={handleCancel}>
                  Cancel
                </button>
                <button type="button" className="button primary" onClick={handleCreate}>
                  Create
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const Sidebar: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [entities, setEntities] = useState<Entity[]>([]);
  const maxLEDs = useSimulationStore((state) => state.maxLEDs);
  const hardwareModel = useSimulationStore((state) => state.hardwareModel);
  const moduleCount = hardwareModel.getModuleCount();

  const handleAddEntity = () => {
    setIsModalOpen(true);
  };

  const handleCreateEntity = (entityType: EntityType, zones: EntityZone[]) => {
    const newEntity: Entity = {
      id: `entity-${Date.now()}`,
      type: entityType,
      zones,
    };
    setEntities([...entities, newEntity]);
    console.log('Create entity:', newEntity);
  };

  return (
    <>
      <div className="sidebar">
        <div className="sidebar-section">
          <div className="sidebar-header">
            <h3 className="sidebar-title">Entités</h3>
            <button
              className="button button-icon sidebar-add-button"
              onClick={handleAddEntity}
              title="Add entity"
            >
              +
            </button>
          </div>
          <div className="preset-list">
          </div>
        </div>
      </div>
      <CreateEntityModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreateEntity}
        maxLEDs={maxLEDs}
        moduleCount={moduleCount}
        existingEntities={entities}
      />
    </>
  );
};

