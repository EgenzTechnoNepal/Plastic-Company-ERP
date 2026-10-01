# EcoWrap ERP — Phase B Implementation Note (Contractual M2)

**Baseline before Phase B:** `108c0dcff551b5c67d78b59f6ca652f58262532d`  
**Scope:** Core/Admin hardening + typed CRM + approval foundation  
**Status:** Implemented — awaiting verification  

## B0 Assessment (summary)

| Area | Finding |
|------|---------|
| Customer | Typed model existed (Phase 1); extended |
| Supplier | Typed procurement Supplier is sole identity |
| Contact / Address / Activity | Were DomainRecord-only → typed models added |
| Approvals | No shared model → `workflow.ApprovalRequest` added |
| DomainRecord CRM data | Seed-only demo rows; no production migration required |
| FE CRM | EntityListPage + DomainRecord; cut over customers/contacts/activities to typed APIs |

## Delivered

- Extended `Customer` (type, website, shipping_address)
- `Contact`, `PartyAddress`, `CrmActivity` + services with audit + events
- Typed APIs under `/crm/customer-masters|contact-masters|party-addresses|activity-masters/`
- `ApprovalRequest` + request/approve/reject/cancel services (no stock/GL side effects)
- API `/workflow/approval-requests/`
- FE adapters in `services/api/crm.ts` + `records.ts` routing
- Live approvals inbox prefers typed PENDING requests
- Manager RBAC gains SUBMIT/APPROVE/REJECT; seed creates typed CUST-001 + contact
- Tests: CRM isolation/RBAC + approval foundation

## Remains DomainRecord (intentional)

leads, opportunities, quotations, dealers, territories, tickets — later phases / CRM depth beyond Phase B.

## Next

Internal Phase C — Purchase inbound FE cutover + PR/RFQ/returns (do not start until Phase B verified).
