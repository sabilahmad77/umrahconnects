/**
 * The only TripGroup fields exposed outside the owning organization
 * (public directory, discover, detail of a PUBLIC group seen by another tenant).
 * Never add briefingNotes, emergencyContact, itinerary, leadGuideId, mutawifId,
 * createdBy or incident/member data here.
 */
export const PUBLIC_GROUP_SELECT = {
  id: true,
  name: true,
  description: true,
  coverUrl: true,
  visibility: true,
  tripType: true,
  season: true,
  departureDate: true,
  returnDate: true,
  capacity: true,
  enrolledCount: true,
  status: true,
  createdAt: true,
  _count: { select: { members: true, posts: true } },
} as const;
