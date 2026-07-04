import { Injectable, NotFoundException } from '@nestjs/common';

export interface CreateTripGroupDto {
  tenantId: string;
  packageId: string;
  name: string;
  departureDate: Date;
  returnDate: Date;
  maxSize: number;
  pilgrimIds?: string[];
}

export interface TripGroup extends CreateTripGroupDto {
  id: string;
  size: number;
  mutawifId?: string;
  status: 'planning' | 'active' | 'completed' | 'cancelled';
  createdAt: Date;
}

export interface ItineraryItem {
  id: string;
  groupId: string;
  day: number;
  date: Date;
  activity: string;
  location: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
}

export interface CreateItineraryItemDto {
  day: number;
  date: Date;
  activity: string;
  location: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
}

export interface Mutawif {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  languages: string[];
  certificationNumber?: string;
  status: 'available' | 'assigned';
}

export interface Incident {
  id: string;
  tenantId: string;
  groupId: string;
  pilgrimId?: string;
  type: 'medical' | 'lost' | 'behavioural' | 'logistical' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  resolvedAt?: Date;
  resolution?: string;
  reportedBy: string;
  reportedAt: Date;
}

export interface CreateIncidentDto {
  groupId: string;
  pilgrimId?: string;
  type: Incident['type'];
  severity: Incident['severity'];
  description: string;
  reportedBy: string;
}

@Injectable()
export class GroupOpsService {
  // ── Trip Groups ───────────────────────────────────────────────────────────

  async createTripGroup(dto: CreateTripGroupDto): Promise<TripGroup> {
    // TODO: implement - create trip group, optionally batch-add pilgrims
    throw new Error('Not implemented');
  }

  async getTripGroup(tenantId: string, groupId: string): Promise<TripGroup> {
    // TODO: implement - load group with member list
    throw new NotFoundException(`TripGroup ${groupId} not found`);
  }

  async listTripGroups(
    tenantId: string,
    filters: { status?: TripGroup['status']; packageId?: string } = {},
  ): Promise<TripGroup[]> {
    // TODO: implement
    return [];
  }

  async addPilgrimToGroup(groupId: string, pilgrimId: string): Promise<void> {
    // TODO: implement - add pilgrim to group, check maxSize
  }

  async removePilgrimFromGroup(groupId: string, pilgrimId: string): Promise<void> {
    // TODO: implement
  }

  // ── Itineraries ───────────────────────────────────────────────────────────

  async setItinerary(tenantId: string, groupId: string, items: CreateItineraryItemDto[]): Promise<ItineraryItem[]> {
    // TODO: implement - replace group itinerary with new items
    return [];
  }

  async getItinerary(groupId: string): Promise<ItineraryItem[]> {
    // TODO: implement - load itinerary ordered by day
    return [];
  }

  // ── Mutawif ───────────────────────────────────────────────────────────────

  async assignMutawif(tenantId: string, groupId: string, mutawifId: string): Promise<TripGroup> {
    // TODO: implement - assign mutawif to group, mark mutawif as assigned
    throw new NotFoundException(`TripGroup ${groupId} not found`);
  }

  async listMutawifs(tenantId: string): Promise<Mutawif[]> {
    // TODO: implement
    return [];
  }

  async createMutawif(tenantId: string, data: Omit<Mutawif, 'id' | 'tenantId' | 'status'>): Promise<Mutawif> {
    // TODO: implement
    throw new Error('Not implemented');
  }

  // ── Incidents ─────────────────────────────────────────────────────────────

  async reportIncident(tenantId: string, dto: CreateIncidentDto): Promise<Incident> {
    // TODO: implement - create incident, trigger notification for critical severity
    throw new Error('Not implemented');
  }

  async resolveIncident(tenantId: string, incidentId: string, resolution: string): Promise<Incident> {
    // TODO: implement - mark incident as resolved, record resolution
    throw new NotFoundException(`Incident ${incidentId} not found`);
  }

  async listIncidents(
    tenantId: string,
    filters: { groupId?: string; severity?: Incident['severity'] } = {},
  ): Promise<Incident[]> {
    // TODO: implement
    return [];
  }
}
