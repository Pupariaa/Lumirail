import React, { useState, useMemo } from 'react';
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

export interface EntityZone {
  id: string;
  name: string;
  ledIds: LEDId[];
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
    })));
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
    setZones(zones.map(zone =>
      zone.id === zoneId ? { ...zone, ledIds } : zone
    ));
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
              <h3 className="entity-zones-title">Configure Zones</h3>
              <p className="entity-zones-description">Assign LEDs to each zone by selecting from the grid below</p>
              <div className="zones-config-container">
                {zones.map((zone) => (
                  <div key={zone.id} className="zone-config-card">
                    <div className="zone-header">
                      <h4 className="zone-label">{zone.name}</h4>
                      {zone.ledIds.length > 0 && (
                        <span className="zone-led-count">{zone.ledIds.length} LED(s)</span>
                      )}
                    </div>
                    <div className="led-grid">
                      {Array.from({ length: maxLEDs }, (_, i) => {
                        const ledId = (i + 1) as LEDId;
                        const isSelected = zone.ledIds.includes(ledId);
                        const usage = ledUsageMap.get(ledId);
                        const isDisabled = !!usage;

                        return (
                          <label
                            key={ledId}
                            className={`led-checkbox ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                            title={isDisabled && usage ? getLEDUsageTooltip(usage) : getLEDLabel(ledId)}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isDisabled}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  handleZoneLEDChange(zone.id, [...zone.ledIds, ledId].sort((a, b) => a - b));
                                } else {
                                  handleZoneLEDChange(zone.id, zone.ledIds.filter(id => id !== ledId));
                                }
                              }}
                            />
                            <span className="led-checkbox-label">{getLEDLabel(ledId)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
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

