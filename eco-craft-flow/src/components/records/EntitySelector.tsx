import { useRecords } from "@/services/entityService";
import { getEntity } from "@/features/registry/entities";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EntitySelectorProps {
  entity: string;
  value?: string;
  onChange: (code: string) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}

export function EntitySelector({ entity, value, onChange, placeholder, id, disabled }: EntitySelectorProps) {
  const rows = useRecords(entity);
  const def = getEntity(entity);
  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder ?? `Select ${def?.singular ?? entity}…`} />
      </SelectTrigger>
      <SelectContent>
        {rows.map((r) => (
          <SelectItem key={r.id} value={r.code}>
            <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
            <span className="ml-2">{r.title}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function WarehouseSelector(props: Omit<EntitySelectorProps, "entity">) {
  return <EntitySelector entity="warehouses" placeholder="Select warehouse…" {...props} />;
}

export function BatchSelector(props: Omit<EntitySelectorProps, "entity">) {
  return <EntitySelector entity="batches" placeholder="Select batch…" {...props} />;
}
