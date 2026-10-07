import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function BackendAggregateUnavailable({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Alert className="my-4">
      <AlertTitle>{title} unavailable</AlertTitle>
      <AlertDescription>{description} Backend aggregate required.</AlertDescription>
    </Alert>
  );
}
