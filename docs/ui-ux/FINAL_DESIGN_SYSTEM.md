# Implemented web design system

Implementation: `codex/web-frontend-finalization` in `/Users/macbook/Projects/umrah-connects-web-finalization`. Discovery specifications are historical inputs; this document describes source changes.

## Brand and composition

Named identity colors remain Deep Umrah Green #0F3D37, gold #C8A96B, ivory #F8F5EF, sandstone #E8DFD1 and navy #112234. Manrope headings, Inter interface text, IBM Plex Sans Arabic and existing logo assets remain. Semantic HSL variables are aligned approximately with named colors. Gold decorates dark surfaces and rules; dark gold is used for small text on light surfaces.

A contributes public hospitality, generous content rhythm and clear service paths. B contributes operational queues, compact readable records and explicit scope. C contributes restrained brand surfaces, ruled workflow explanations and distinct navy platform governance. No generated concept image is presented as a real hotel or destination.

Public hierarchy: brand/navigation → headline/task → service ecosystem → Discover/Request/Review/Manage explanation → role paths → support/footer. Workspaces: role/tenant context → page/task queue → API statistics/records → secondary analysis. Provider roles retain domain-specific data. Super Admin retains cross-tenant organizations/users/moderation/configuration.

## Reusable implementation

`apps/web/components/ui/system.tsx` supplies Button, Input, Textarea, Select, Checkbox, Radio, Switch, Badge/StatusDisplay, Avatar, Tooltip, Alert, Dialog, Drawer, Tabs, Card, StatBlock, LinkedStatBlock, CountTile, FieldInput, DataTable, Pagination, FilterBar, Search, EmptyState, ErrorState, QueryFailure, Skeleton, LoadingState, FileUpload, PageHeader and FormSection. Sonner remains the single toast implementation in the root layout.

345 legacy buttons were migrated to Button; 335 native text/select controls were migrated initially, with labels subsequently corrected and shared FieldInput adapters replacing repeated field implementations. 14 repeated field/stat helpers were consolidated. Domain forms remain domain-specific compositions of those primitives. 26 legacy modal surfaces, including privileged confirmation, now use Radix focus/escape/inert semantics through ModalSurface. Existing native checkbox/file controls remain where their behavior is purposeful.

Button defaults to type=button; submit intent is explicit. Busy disables repeat actions and exposes aria-busy. Controls have minimum 44px height; buttons also have minimum 44px width. On mobile, controls use 16px text. Readable text uses semantic labels and persistent form labels where applicable. Essential comparison tables retain columns in named keyboard-reachable overflow regions rather than shrinking them.

## States and interaction

80 query-backed component surfaces have local QueryFailure retry states; permission and missing-service/record responses differ from successful empty results. Unknown statistics use —. Loading is announced, reduced motion is respected, and invalid inputs cannot enable guarded booking actions. ConfirmDialog catches failures, preserves form state and prevents closing while its action is pending.

Public and workspace mobile navigation uses a focus-managed drawer. Public desktop dropdowns use native disclosure. Account and notifications menus use Radix. Unsupported settings and personal group/visa aggregation are visibly unavailable. Fake health, growth, reviews, profiles, newsletter success and settings saves are removed.

## Boundaries

This system does not imply server authorization, supplier availability, regulator integration, payment settlement or account-role provisioning. Those states must come from their respective contracts. Dark-mode tokens remain historical configuration; no dark-mode support is claimed. Full RTL and screen-reader certification require separate verification.

## Final visual and label corrections

Eleven record-detail headers preserve readable title width and wrap actions; booking-list actions reflow on mobile. The sidebar collapse control is 44px with an unsqueezed icon. Native wrapped label associations take precedence over generated API field names: 134 conflicting overrides and four redundant signup overrides were removed. Final typecheck, lint, build and all 39 tests pass. Acceptance limits are recorded in the completion matrix.
