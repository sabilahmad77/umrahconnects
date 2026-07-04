import { PluginManifest } from '../../shared/plugin-manifest.interface';
export { FinanceModule } from './finance.module';
export { FinanceService } from './finance.service';
export { FinanceController } from './finance.controller';

export const manifest: PluginManifest = {
  id: 'finance',
  version: '1.0.0',
  name: 'Finance & Reconciliation',
  description: 'Manages invoices, payments, double-entry ledger, FX rates, and ZATCA e-invoicing for KSA compliance.',
  dependencies: ['core.tenant', 'booking'],
  phase: 'P1',
  provides: [
    { id: 'finance.invoice.read', description: 'Read invoice records' },
    { id: 'finance.invoice.write', description: 'Create and manage invoices' },
    { id: 'finance.payment.read', description: 'Read payment records' },
    { id: 'finance.payment.write', description: 'Process payments' },
    { id: 'finance.ledger.read', description: 'Read general ledger entries' },
  ],
  consumes: ['booking.read'],
  routePrefix: '/plugins/finance',
  dbSchema: 'plugin_finance',
};
