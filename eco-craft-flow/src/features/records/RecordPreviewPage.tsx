import { Link, useParams, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { RecordHeader } from "@/components/records/RecordHeader";
import { DocumentPreview } from "@/components/records/DocumentPreview";
import { entityKeyFor, listPathFor, parseRecordLocation, recordPath } from "@/features/registry/paths";
import { getEntity } from "@/features/registry/entities";
import { useRecord } from "@/services/entityService";

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

  if (!def || !record) {
    return <EmptyState title="Nothing to preview" description="Open a printable document first." />;
  }

  return (
    <div>
      <RecordHeader
        code={record.code}
        title={record.title}
        status={record.status}
        backTo={recordPath(entity, record.code)}
        backLabel="Back to record"
        subtitle="Print preview"
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to={listPathFor(entity) as never}>List</Link>
          </Button>
        }
      />
      <p className="mb-4 text-xs text-muted-foreground">
        Simulated print layout — IRD/CBMS copy attaches when the backend is connected.
      </p>
      <DocumentPreview record={record} def={def} />
    </div>
  );
}
