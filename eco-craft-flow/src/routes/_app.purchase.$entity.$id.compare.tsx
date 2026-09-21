import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { RecordHeader } from "@/components/records/RecordHeader";
import { RfqCompare } from "@/features/purchase/RfqCompare";
import { entityKeyFor, listPathFor, parseRecordLocation, recordPath } from "@/features/registry/paths";
import { getEntity } from "@/features/registry/entities";
import { useRecord } from "@/services/entityService";

export const Route = createFileRoute("/_app/purchase/$entity/$id/compare")({
  component: RfqComparePage,
});

function RfqComparePage() {
  const params = Route.useParams();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const parsed = parseRecordLocation(pathname);
  const slug = params.entity ?? parsed?.slug ?? "";
  const code = params.id ? decodeURIComponent(params.id) : parsed?.id ?? "";
  const entity = entityKeyFor("purchase", slug) ?? "";
  const def = getEntity(entity);
  const record = useRecord(entity, code);

  if (entity !== "rfqs" || !def || !record) {
    return <EmptyState title="Nothing to compare" description="Open an RFQ to compare vendor quotes." />;
  }

  return (
    <div className="space-y-6">
      <RecordHeader
        code={record.code}
        title={record.title}
        status={record.status}
        backTo={recordPath(entity, record.code)}
        backLabel="Back to RFQ"
        subtitle="Quote comparison"
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to={listPathFor(entity) as never}>RFQ list</Link>
          </Button>
        }
      />
      <RfqCompare rfq={record} />
    </div>
  );
}
