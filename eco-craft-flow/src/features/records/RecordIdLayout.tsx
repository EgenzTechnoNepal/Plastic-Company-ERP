import { Outlet } from "@tanstack/react-router";

/** Parent for /$id, /$id/edit and /$id/preview so child routes actually render. */
export function RecordIdLayout() {
  return <Outlet />;
}
