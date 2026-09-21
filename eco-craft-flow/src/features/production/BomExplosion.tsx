import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/common/StatusBadge";
import { npr } from "@/lib/export";
import { num, str } from "@/lib/records";
import { recordPath } from "@/features/registry/paths";
import { explodeBom, flattenLeaves, rolledCost, whereUsed, type BomNode } from "@/features/production/cycle";
import { useRecords } from "@/services/entityService";
import type { ErpRecord } from "@/types/erp";

function Rows({ nodes }: { nodes: BomNode[] }) {
  return (
    <>
      {nodes.map((n) => (
        <div key={`${n.level}-${n.item}-${n.qty}`}>
          <div className="grid grid-cols-12 gap-2 border-b py-2 text-sm last:border-0">
            <div className="col-span-4 min-w-0" style={{ paddingLeft: n.level * 12 }}>
              <div className="truncate font-medium">{n.item}</div>
              <div className="truncate text-xs text-muted-foreground">{n.description}</div>
            </div>
            <div className="col-span-2 text-right tabular-nums">{n.qty.toLocaleString("en-IN")} {n.uom}</div>
            <div className="col-span-2 text-right text-xs text-muted-foreground">{n.scrapPct}% / {n.yieldPct}%</div>
            <div className="col-span-2 truncate text-xs">{n.substitute ? `Alt ${n.substitute}` : n.phantom ? "Phantom" : n.bom ? n.bom : "—"}</div>
            <div className="col-span-2 text-right tabular-nums">{npr(n.qty * n.rate)}</div>
          </div>
          {n.children.length > 0 && <Rows nodes={n.children} />}
        </div>
      ))}
    </>
  );
}

export function BomExplosion({ bom }: { bom: ErpRecord }) {
  const [qty, setQty] = useState(String(num(bom, "outputQty") || 1000));
  const scale = Number(qty) || num(bom, "outputQty") || 1000;
  const tree = useMemo(() => explodeBom(bom, scale), [bom, scale]);
  const leaves = flattenLeaves(tree);
  const cost = rolledCost(bom, scale);
  const used = whereUsed(str(bom, "product"));
  const versions = useRecords("boms").filter((b) => str(b, "product") === str(bom, "product"));
  const componentUsed = useRecords("boms").filter((b) => b.code !== bom.code && b.lines.some((l) => tree.some((n) => n.item === l.item) || leaves.some((n) => n.item === l.item)));

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Multi-level explosion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-sm">
              <span className="text-xs text-muted-foreground">Scale to output qty</span>
              <Input className="w-32" value={qty} onChange={(e) => setQty(e.target.value)} />
            </label>
            <div className="text-sm text-muted-foreground">
              Version {str(bom, "version")} · effective {str(bom, "effectiveFrom") || bom.date} · rolled {npr(cost)} / unit
            </div>
          </div>
          <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground">
            <div className="col-span-4">Component</div>
            <div className="col-span-2 text-right">Qty</div>
            <div className="col-span-2 text-right">Scrap / yield</div>
            <div className="col-span-2">Substitute / phantom</div>
            <div className="col-span-2 text-right">Extended</div>
          </div>
          <Rows nodes={tree} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-2xl border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Versions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {versions.map((v) => (
              <Link
                key={v.id}
                to={recordPath("boms", v.code) as never}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-muted/50"
              >
                <span>
                  <span className="font-mono text-xs">{v.code}</span>
                  <span className="ml-2">{str(v, "version")}</span>
                  {str(v, "previousVersion") ? <span className="ml-2 text-xs text-muted-foreground">from {str(v, "previousVersion")}</span> : null}
                </span>
                <StatusBadge tone={v.status === "approved" ? "success" : "neutral"}>{v.status}</StatusBadge>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Where-used</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {used.length === 0 && <p className="text-sm text-muted-foreground">Not used on other BOMs.</p>}
            {used.map((v) => (
              <Link
                key={v.id}
                to={recordPath("boms", v.code) as never}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-muted/50"
              >
                <span className="truncate">{v.code} · {v.title}</span>
                <StatusBadge tone={v.status === "approved" ? "success" : "neutral"}>{str(v, "product")}</StatusBadge>
              </Link>
            ))}
            {componentUsed.slice(0, 4).map((v) => (
              <div key={`c-${v.id}`} className="text-xs text-muted-foreground">Also shares components with {v.code}</div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
