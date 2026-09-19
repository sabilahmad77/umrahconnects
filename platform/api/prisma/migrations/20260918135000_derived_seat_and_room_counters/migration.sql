-- eng100-a03b: seat counters and room occupancy are derived state.
-- TransportService.recountSeats and HotelsService.syncRoomOccupancy now recompute
-- them from the trips / bookings on every write; this one-off pass makes rows that
-- have not been written since then consistent too. Data only, no schema change.

-- Vehicle: passengers on its open trips.
UPDATE plugin_transport.vehicles v
SET booked_seats = COALESCE((
  SELECT SUM(a.passenger_count)
  FROM plugin_transport.transport_assignments a
  WHERE a.vehicle_id = v.id
    AND a.tenant_id = v.tenant_id
    AND a.status IN ('DRAFT', 'SCHEDULED', 'CONFIRMED', 'IN_PROGRESS')
), 0);

-- Route: seats sold (every trip that was not cancelled).
UPDATE plugin_transport.transport_routes r
SET booked_seats = COALESCE((
  SELECT SUM(a.passenger_count)
  FROM plugin_transport.transport_assignments a
  WHERE a.route_id = r.id
    AND a.tenant_id = r.tenant_id
    AND a.status <> 'CANCELLED'
), 0);

UPDATE plugin_transport.transport_routes
SET status = 'FULLY_BOOKED'
WHERE status = 'ACTIVE' AND total_seats IS NOT NULL AND booked_seats >= total_seats;

UPDATE plugin_transport.transport_routes
SET status = 'ACTIVE'
WHERE status = 'FULLY_BOOKED' AND (total_seats IS NULL OR booked_seats < total_seats);

-- Room: OCCUPIED exactly while a checked-in booking holds it (it used to be set when a
-- booking was merely created).
UPDATE plugin_hotel.rooms r
SET status = 'AVAILABLE'
WHERE r.status = 'OCCUPIED'
  AND NOT EXISTS (
    SELECT 1 FROM plugin_hotel.hotel_bookings b
    WHERE b.room_id = r.id AND b.tenant_id = r.tenant_id AND b.status = 'CHECKED_IN'
  );

UPDATE plugin_hotel.rooms r
SET status = 'OCCUPIED'
WHERE r.status = 'AVAILABLE'
  AND EXISTS (
    SELECT 1 FROM plugin_hotel.hotel_bookings b
    WHERE b.room_id = r.id AND b.tenant_id = r.tenant_id AND b.status = 'CHECKED_IN'
  );
