import { useEffect, useMemo, useState } from 'react';
import { networkQuantities } from '../lib/pricing';
import type { Duct, Network, ProjectBudget } from '../lib/types';
import { useEquipmentModels } from './pop/EquipmentCatalog';
import PriceCatalog, { usePriceItems } from './PriceCatalog';
import ProjectBudgetModal from './ProjectBudgetModal';

/**
 * Cadastro de preços e orçamento do projeto aberto no mapa (alternando entre os dois).
 * A tabela usada é a do dono do projeto; só ele altera os preços.
 */
export default function PricingCenter({
  view,
  projectId,
  projectName,
  network,
  ducts,
  budget,
  isOwner,
  canEdit,
  onView,
  onBudgetSaved,
  onClose,
}: {
  view: 'prices' | 'budget';
  projectId: number;
  projectName: string;
  network: Network;
  ducts: Duct[];
  budget: ProjectBudget | null | undefined;
  isOwner: boolean;
  canEdit: boolean;
  onView: (v: 'prices' | 'budget') => void;
  onBudgetSaved: (b: ProjectBudget) => void;
  onClose: () => void;
}) {
  const { prices, reload } = usePriceItems(projectId);
  const [draft, setDraft] = useState<{ cfg: ProjectBudget; dirty: boolean } | null>(null);
  // Veio do orçamento: fechar o cadastro volta para ele.
  const [fromBudget, setFromBudget] = useState(view === 'budget');
  useEffect(() => {
    if (view === 'budget') setFromBudget(true);
  }, [view]);
  const { models } = useEquipmentModels(projectId);
  const scope = budget?.scope ?? 'all';
  const quantities = useMemo(() => (view === 'prices' ? networkQuantities(network, ducts, scope) : undefined), [view, network, ducts, scope]);
  if (view === 'prices')
    return <PriceCatalog prices={prices} models={models} quantities={quantities} readOnly={!isOwner} onChanged={reload} onClose={fromBudget ? () => onView('budget') : onClose} />;
  return (
        <ProjectBudgetModal
          projectId={projectId}
          projectName={projectName}
          network={network}
          ducts={ducts}
          prices={prices}
          budget={budget}
          canEdit={canEdit}
          canEditPrices={isOwner}
          onSaved={onBudgetSaved}
          onPricesChanged={reload}
          onOpenPrices={() => onView('prices')}
          draft={draft}
          onDraft={setDraft}
          onClose={onClose}
        />
  );
}
