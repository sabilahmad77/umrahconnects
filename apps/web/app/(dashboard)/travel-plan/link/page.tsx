import { InvitationResponse } from '@/components/travelers/invitation-response';

// The page URL carries a single-use invitation token until the client strips it:
// never send it onward in a Referer.
export const metadata = { title: 'Trip invitation', referrer: 'no-referrer' as const };

export default function TravelPlanLinkPage() {
  return <InvitationResponse />;
}
