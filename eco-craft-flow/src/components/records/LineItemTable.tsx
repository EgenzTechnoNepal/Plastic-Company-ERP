import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { npr } from "@/lib/export";
import { cn } from "@/lib/utils";
import { docTotals, lineAmount, lineTax, type LineItem } from "@/types/erp";
import { newLineId } from "@/services/entityService";
import { EntitySelector } from "@/components/records/EntitySelector";

interface LineItemTableProps {
  lines: LineItem[];
  onChange: (lines: LineItem[]) => void;
  mode?: "items" | "ledger";
  readOnly?: boolean;
}

function patch(lines: LineItem[], id: string, next: Partial<LineItem>): LineItem[] {
  return lines.map((l) => (l.id === id ? { ...l, ...next } : l));
}

export function LineItemTable({ lines, onChange, mode = "items", readOnly }: LineItemTableProps) {
  const totals = docTotals(lines);
  const debit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const credit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const balanced = Math.abs(debit - credit) < 0.01;

  const add = () =>
    onChange([
      ...lines,
      mode === "ledger"
        ? { id: newLineId(), item: "", description: "", qty: 0, rate: 0, debit: 0, credit: 0, account: "" }
        : { id: newLineId(), item: "", description: "", uom: "PCS", qty: 1, rate: 0, discountPct: 0, taxPct: 13 },
    ]);

  return (
    <div className="space-y-3">
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {mode === "ledger" ? (
                <>
                  <TableHead>Account</TableHead>
                  <TableHead>Narration</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                </>
              ) : (
                <>
                  <TableHead>Item</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>UOM</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Disc %</TableHead>
                  <TableHead className="text-right">VAT %</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </>
              )}
              {!readOnly && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.id}>
                {mode === "ledger" ? (
                  <>
                    <TableCell className="min-w-40">
                      {readOnly ? (
                        l.account || "—"
                      ) : (
                        <EntitySelector entity="accounts" value={l.account} onChange={(v) => onChange(patch(lines, l.id, { account: v }))} />
                      )}
                    </TableCell>
                    <TableCell>
                      {readOnly ? (
                        l.description || "—"
                      ) : (
                        <Input value={l.description ?? ""} onChange={(e) => onChange(patch(lines, l.id, { description: e.target.value }))} />
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {readOnly ? (
                        npr(l.debit || 0)
                      ) : (
                        <Input
                          type="number"
                          className="text-right"
                          value={l.debit ?? 0}
                          onChange={(e) => onChange(patch(lines, l.id, { debit: Number(e.target.value) || 0 }))}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {readOnly ? (
                        npr(l.credit || 0)
                      ) : (
                        <Input
                          type="number"
                          className="text-right"
                          value={l.credit ?? 0}
                          onChange={(e) => onChange(patch(lines, l.id, { credit: Number(e.target.value) || 0 }))}
                        />
                      )}
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className="min-w-40">
                      {readOnly ? (
                        l.item || "—"
                      ) : (
                        <EntitySelector entity="products" value={l.item} onChange={(v) => onChange(patch(lines, l.id, { item: v }))} />
                      )}
                    </TableCell>
                    <TableCell>
                      {readOnly ? l.description || "—" : (
                        <Input value={l.description ?? ""} onChange={(e) => onChange(patch(lines, l.id, { description: e.target.value }))} />
                      )}
                    </TableCell>
                    <TableCell className="w-20">
                      {readOnly ? l.uom : (
                        <Input value={l.uom ?? "PCS"} onChange={(e) => onChange(patch(lines, l.id, { uom: e.target.value }))} />
                      )}
                    </TableCell>
                    <TableCell className="w-24 text-right">
                      {readOnly ? l.qty : (
                        <Input type="number" className="text-right" value={l.qty} onChange={(e) => onChange(patch(lines, l.id, { qty: Number(e.target.value) || 0 }))} />
                      )}
                    </TableCell>
                    <TableCell className="w-28 text-right">
                      {readOnly ? npr(l.rate) : (
                        <Input type="number" className="text-right" value={l.rate} onChange={(e) => onChange(patch(lines, l.id, { rate: Number(e.target.value) || 0 }))} />
                      )}
                    </TableCell>
                    <TableCell className="w-20 text-right">
                      {readOnly ? l.discountPct ?? 0 : (
                        <Input type="number" className="text-right" value={l.discountPct ?? 0} onChange={(e) => onChange(patch(lines, l.id, { discountPct: Number(e.target.value) || 0 }))} />
                      )}
                    </TableCell>
                    <TableCell className="w-20 text-right">
                      {readOnly ? l.taxPct ?? 13 : (
                        <Input type="number" className="text-right" value={l.taxPct ?? 13} onChange={(e) => onChange(patch(lines, l.id, { taxPct: Number(e.target.value) || 0 }))} />
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">{npr(lineAmount(l) + lineTax(l))}</TableCell>
                  </>
                )}
                {!readOnly && (
                  <TableCell>
                    <Button type="button" variant="ghost" size="icon" aria-label="Remove line" onClick={() => onChange(lines.filter((x) => x.id !== l.id))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 md:hidden">
        {lines.map((l, i) => (
          <div key={l.id} className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              Line {i + 1}
              {!readOnly && (
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange(lines.filter((x) => x.id !== l.id))}>
                  Remove
                </Button>
              )}
            </div>
            {mode === "items" ? (
              <>
                <div className="text-sm font-medium">{l.item || "Item"} · {l.description}</div>
                <div className="text-xs text-muted-foreground">
                  {l.qty} {l.uom} × {npr(l.rate)} − {l.discountPct ?? 0}% + {l.taxPct ?? 13}% VAT
                </div>
                <div className="text-right font-semibold">{npr(lineAmount(l) + lineTax(l))}</div>
              </>
            ) : (
              <>
                <div className="text-sm font-medium">{l.account} · {l.description}</div>
                <div className="flex justify-between text-xs">
                  <span>Dr {npr(l.debit || 0)}</span>
                  <span>Cr {npr(l.credit || 0)}</span>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {!readOnly && (
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={add}>
          <Plus className="h-4 w-4" /> Add line
        </Button>
      )}

      {mode === "ledger" ? (
        <div className={cn("flex justify-end gap-6 text-sm", !balanced && "text-destructive")}>
          <span>Debit {npr(debit)}</span>
          <span>Credit {npr(credit)}</span>
          <span className="font-semibold">{balanced ? "Balanced" : `Out ${npr(Math.abs(debit - credit))}`}</span>
        </div>
      ) : (
        <div className="ml-auto max-w-sm space-y-1 rounded-lg border bg-muted/30 p-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{npr(totals.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>− {npr(totals.discount)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Taxable</span><span>{npr(totals.taxable)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">VAT 13%</span><span>{npr(totals.tax)}</span></div>
          <div className="flex justify-between border-t pt-1 font-semibold"><span>Total</span><span>{npr(totals.total)}</span></div>
        </div>
      )}
    </div>
  );
}
