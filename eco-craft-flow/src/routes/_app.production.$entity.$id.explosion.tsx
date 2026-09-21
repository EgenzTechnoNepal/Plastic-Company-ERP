import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { RecordHeader } from "@/components/records/RecordHeader";
import { BomExplosion } from "@/features/production/BomExplosion";
import { entityKeyFor, listPathFor, parseRecordLocation, recordPath } from "@/features/registry/paths";
import { getEntity } from "@/features/registry/entities";
import { useRecord } from "@/services/entityService";

export const Route = createFileRoute("/_app/production/$entity/$id/explosion")({
  component: BomExplosionPage,
});

function BomExplosionPage() {
  const params = Route.useParams();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const parsed = parseRecordLocation(pathname);
  const slug = params.entity ?? parsed?.slug ?? "";
  const code = params.id ? decodeURIComponent(params.id) : parsed?.id ?? "";
  const entity = entityKeyFor("production", slug) ?? "";
  const def = getEntity(entity);
  const record = useRecord(entity, code);

  if (entity !== "boms" || !def || !record) {
    return <EmptyState title="Nothing to explode" description="Open a bill of materials to view the multi-level explosion." />;
  }

  return (
    <div className="space-y-6">
      <RecordHeader
        code={record.code}
        title={record.title}
        status={record.status}
        backTo={recordPath(entity, record.code)}
        backLabel="Back to BOM"
        subtitle="Explosion · where-used · versions"
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to={listPathFor(entity) as never}>BOM list</Link>
          </Button>
        }
      />
      <BomExplosion bom={record} />
    </div>
  );
}
