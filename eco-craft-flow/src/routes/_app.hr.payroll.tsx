import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Coins, Play, Receipt, Users, Wallet } from "lucide-react";
import { EntityListPage } from "@/components/common/EntityListPage";
import { Button } from "@/components/ui/button";
import { npr } from "@/lib/export";
import { sumField } from "@/lib/records";
import { getService } from "@/services/catalog";
import { useRecords } from "@/services/entityService";

export const Route = createFileRoute("/_app/hr/payroll")({
  component: PayrollPage,
});

function PayrollPage() {
  const payslips = useRecords("payslips");

  const runPayroll = async () => {
    try {
      await getService("payroll_runs").create({
        title: `Payroll ${new Date().toISOString().slice(0, 7)}`,
        status: "draft",
        fields: { period: new Date().toISOString().slice(0, 7), employees: payslips.length || 1, ssf: true, tds: true },
      });
      toast.success("Payroll run created — approve, then pay to post SSF/TDS and generate the bank file");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start payroll");
    }
  };

  return (
    <div className="space-y-10">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1" onClick={runPayroll}>
          <Play className="h-4 w-4" /> New payroll run
        </Button>
      </div>
      <EntityListPage
        entity="payroll_runs"
        kpis={(rows) => [
          { label: "Runs", value: rows.length, icon: Play },
          { label: "Approved", value: rows.filter((r) => r.status === "approved" || r.status === "posted").length, icon: Wallet, accent: "accent" },
        ]}
      />
      <EntityListPage
        entity="payslips"
        exportName="payroll-register"
        kpis={(rows) => [
          { label: "Employees on run", value: rows.length, icon: Users },
          { label: "Gross wages", value: npr(sumField(rows, "basic") + sumField(rows, "allowances") + sumField(rows, "overtime")), icon: Coins, accent: "secondary" },
          { label: "Deductions", value: npr(sumField(rows, "ssf") + sumField(rows, "cit") + sumField(rows, "tax")), icon: Receipt, accent: "muted" },
          { label: "Net payable", value: npr(sumField(rows, "net")), icon: Wallet },
        ]}
      />
    </div>
  );
}
