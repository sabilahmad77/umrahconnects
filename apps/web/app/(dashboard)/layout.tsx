import { WorkspaceShell } from '@/components/layout/workspace-shell';

/** Every signed-in page renders inside the workspace shell, which also decides route access. */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
