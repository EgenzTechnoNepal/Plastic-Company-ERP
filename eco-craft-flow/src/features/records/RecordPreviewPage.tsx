import { Link, useParams, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { RecordHeader } from "@/components/records/RecordHeader";
import { DocumentPreview } from "@/components/records/DocumentPreview";
import { entityKeyFor, listPathFor, parseRecordLocation, recordPath } from "@/features/registry/paths";
import { getEntity } from "@/features/registry/entities";
import { useRecord, useRecordsStatus } from "@/services/entityService";
import { M2_TYPED_DETAIL_ENTITIES } from "@/services/api/typedEntities";

export function RecordPreviewPage() {
  const params = useParams({ strict: false }) as { entity?: string; id?: string };
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const parsed = parseRecordLocation(pathname);
  const slug = params.entity ?? parsed?.slug ?? "";
  const module = parsed?.module ?? "";
  const code = params.id ? decodeURIComponent(params.id) : parsed?.id ?? "";
  const entity = entityKeyFor(module, slug) ?? "";
  const def = getEntity(entity);
  const record = useRecord(entity, code);
  const status = useRecordsStatus(entity, code);

  if (!def) {
    return <EmptyState title="Nothing to preview" description="Open a printable document first." />;
  }
  if (!record && status.loading) {
    return <p role="status" className="py-12 text-center text-sm text-muted-foreground">Loading document…</p>;
  }
  if (!record) {
    return (
      <EmptyState
        title={status.error ? "Could not load document" : "Nothing to preview"}
        description={status.error ?? "The document was not found."}
        action={
          status.error ? (
            <Button size="sm" variant="outline" onClick={status.retry}>Retry</Button>
          ) : undefined
        }
      />
    );
  }
  const recordRef = M2_TYPED_DETAIL_ENTITIES.has(entity) ? record.id : record.code;

  return (
    <div>
      <RecordHeader
        code={record.code}
        title={record.title}
        status={record.status}
        backTo={recordPath(entity, recordRef)}
        backLabel="Back to record"
        subtitle="Print preview"
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to={listPathFor(entity) as never}>List</Link>
          </Button>
        }
      />
      <p className="mb-4 text-xs text-muted-foreground">
        Preview only. This does not create a fiscal invoice or submit to IRD/CBMS.
      </p>
      <DocumentPreview record={record} def={def} />
    </div>
  );
}
