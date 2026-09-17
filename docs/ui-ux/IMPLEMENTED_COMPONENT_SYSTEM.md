# Implemented component system

See [FINAL_DESIGN_SYSTEM.md](FINAL_DESIGN_SYSTEM.md) for the canonical description. Primary source: `apps/web/components/ui/system.tsx`; global styles: `apps/web/app/globals.css`; responsive shell: `apps/web/components/layout/workspace-shell.tsx`; privileged confirmation: `apps/web/components/ui/confirm-dialog.tsx`.

Shared primitives replace native styling variants while domain components retain booking, hotel, transport, visa, finance, community and governance business context. Radix handles interactive overlays; Sonner handles toasts; React Query handles server-state caching. No second UI framework or mock API was introduced.

Verification: tests/component-semantics.test.tsx checks disabled/busy behavior, submit intent, live roles, permission recovery, unknown versus zero statistics, associated labels and reachable table regions. Browser evidence covers navigation, dialogs and actual route rendering.
