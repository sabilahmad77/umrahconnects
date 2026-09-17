import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Alert, Button, DataTable, FieldInput, LoadingState, QueryFailure, StatBlock } from '../components/ui/system';
describe('shared interaction and data state semantics', () => {
  it('blocks repeat submission while an action is busy', () => { const html = renderToStaticMarkup(<Button busy>Save</Button>); expect(html).toContain('disabled=""'); expect(html).toContain('aria-busy="true"'); expect(html).toContain('type="button"'); });
  it('keeps submit intent explicit', () => { expect(renderToStaticMarkup(<Button type="submit">Sign in</Button>)).toContain('type="submit"'); });
  it('announces loading and failures with appropriate live roles', () => { expect(renderToStaticMarkup(<LoadingState />)).toContain('role="status"'); expect(renderToStaticMarkup(<Alert title="Failed" />)).toContain('role="alert"'); });
  it('distinguishes permission failure from empty results', () => { const html=renderToStaticMarkup(<QueryFailure error={{response:{status:403}}} onRetry={()=>{}} />); expect(html).toContain('Permission required'); expect(html).toContain('workspace administrator'); expect(html).toContain('Try again'); });
  it('does not substitute zero for unavailable statistics', () => { const html=renderToStaticMarkup(<StatBlock label="Bookings" />); expect(html).toContain('—'); expect(html).toContain('Data unavailable'); });
  it('retains a genuine zero', () => { expect(renderToStaticMarkup(<StatBlock label="Bookings" value={0} />)).toContain('>0<'); });
  it('associates a persistent label with its control', () => { const html=renderToStaticMarkup(<FieldInput label="Email" value="" onChange={()=>{}} />); const id=html.match(/<input[^>]*id="([^"]+)"/)?.[1]; expect(id).toBeTruthy(); expect(html).toContain(`for="${id}"`); });
  it('makes comparison tables keyboard reachable and named', () => { const html=renderToStaticMarkup(<DataTable label="Booking records"><tbody><tr><td>Record</td></tr></tbody></DataTable>); expect(html).toContain('role="region"'); expect(html).toContain('aria-label="Booking records"'); expect(html).toContain('tabindex="0"'); });
});
