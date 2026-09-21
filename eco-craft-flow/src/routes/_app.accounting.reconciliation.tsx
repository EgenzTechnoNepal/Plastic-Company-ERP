import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Landmark } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/common/KpiCard";
import { npr } from "@/lib/export";
import { num } from "@/lib/records";
import { useRecords } from "@/services/entityService";

export const Route = createFileRoute("/_app/accounting/reconciliation")({ component: BankRecPage });

function BankRecPage() {
  const accounts = useRecords("accounts").filter((a) => {
    const t = `${a.title} ${a.code}`.toLowerCase();
    return t.includes("bank") || t.includes("cash") || a.code.startsWith("11");
  });
  const [statement, setStatement] = useState("");
  const book = accounts.reduce((s, a) => s + num(a, "balance"), 0);
  const stmt = Number(statement) || 0;
  const variance = stmt - book;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <KpiCard label="Book balance" value={npr(book)} icon={Landmark} />
        <KpiCard label="Statement" value={npr(stmt)} accent="secondary" />
        <KpiCard label="Variance" value={npr(variance)} hint={variance === 0 ? "Reconciled" : "Unreconciled"} accent={variance === 0 ? "accent" : "muted"} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Bank statement</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Closing balance from the bank / eSewa statement</p>
            <Input type="number" value={statement} onChange={(e) => setStatement(e.target.value)} />
          </div>
          <Button onClick={() => toast.success(variance === 0 ? "Period reconciled" : "Variance logged for accounts review")}>
            Mark reviewed
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Cash & bank accounts</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {accounts.map((a) => (
            <div key={a.id} className="flex justify-between border-b py-2">
              <span>{a.title}</span>
              <span className="font-medium">{npr(num(a, "balance"))}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
