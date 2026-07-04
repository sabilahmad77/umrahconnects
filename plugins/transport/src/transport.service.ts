import { Injectable, NotFoundException } from '@nestjs/common';

export interface CreateVehicleDto {
  tenantId: string;
  plateNumber: string;
  type: 'bus' | 'minibus' | 'van' | 'car';
  capacity: number;
  make?: string;
  model?: string;
  year?: number;
}

export interface Vehicle extends CreateVehicleDto {
  id: string;
  status: 'available' | 'in_use' | 'maintenance';
  createdAt: Date;
}

export interface CreateDriverDto {
  tenantId: string;
  name: string;
  licenseNumber: string;
  phone: string;
  nationality: string;
  languages?: string[];
}

export interface Driver extends CreateDriverDto {
  id: string;
  status: 'available' | 'assigned' | 'off_duty';
  createdAt: Date;
}

export interface CreateRouteDto {
  tenantId: string;
  name: string;
  origin: string;
  destination: string;
  estimatedMinutes: number;
  waypoints?: string[];
}

export interface Route extends CreateRouteDto {
  id: string;
}

export interface CreateTransportAssignmentDto {
  tenantId: string;
  bookingId: string;
  vehicleId: string;
  driverId: string;
  routeId: string;
  pilgrimIds: string[];
  departureAt: Date;
  notes?: string;
}

export interface TransportAssignment extends CreateTransportAssignmentDto {
  id: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: Date;
}

export interface TasreehPermit {
  id: string;
  tenantId: string;
  assignmentId: string;
  permitNumber: string;
  issuedAt: Date;
  validFrom: Date;
  validTo: Date;
  status: 'pending' | 'issued' | 'expired' | 'revoked';
}

@Injectable()
export class TransportService {
  // ── Vehicles ──────────────────────────────────────────────────────────────

  async createVehicle(dto: CreateVehicleDto): Promise<Vehicle> {
    // TODO: implement - persist vehicle record
    throw new Error('Not implemented');
  }

  async listVehicles(tenantId: string, status?: Vehicle['status']): Promise<Vehicle[]> {
    // TODO: implement - list vehicles, optionally filter by status
    return [];
  }

  async getVehicle(tenantId: string, vehicleId: string): Promise<Vehicle> {
    // TODO: implement
    throw new NotFoundException(`Vehicle ${vehicleId} not found`);
  }

  async updateVehicle(tenantId: string, vehicleId: string, dto: Partial<CreateVehicleDto>): Promise<Vehicle> {
    // TODO: implement
    throw new NotFoundException(`Vehicle ${vehicleId} not found`);
  }

  // ── Drivers ───────────────────────────────────────────────────────────────

  async createDriver(dto: CreateDriverDto): Promise<Driver> {
    // TODO: implement - persist driver record
    throw new Error('Not implemented');
  }

  async listDrivers(tenantId: string, status?: Driver['status']): Promise<Driver[]> {
    // TODO: implement
    return [];
  }

  async getDriver(tenantId: string, driverId: string): Promise<Driver> {
    // TODO: implement
    throw new NotFoundException(`Driver ${driverId} not found`);
  }

  async updateDriver(tenantId: string, driverId: string, dto: Partial<CreateDriverDto>): Promise<Driver> {
    // TODO: implement
    throw new NotFoundException(`Driver ${driverId} not found`);
  }

  // ── Routes ────────────────────────────────────────────────────────────────

  async createRoute(dto: CreateRouteDto): Promise<Route> {
    // TODO: implement
    throw new Error('Not implemented');
  }

  async listRoutes(tenantId: string): Promise<Route[]> {
    // TODO: implement
    return [];
  }

  // ── Assignments ───────────────────────────────────────────────────────────

  async createAssignment(dto: CreateTransportAssignmentDto): Promise<TransportAssignment> {
    // TODO: implement - create assignment, mark vehicle and driver as in_use
    throw new Error('Not implemented');
  }

  async getAssignment(tenantId: string, assignmentId: string): Promise<TransportAssignment> {
    // TODO: implement
    throw new NotFoundException(`Assignment ${assignmentId} not found`);
  }

  async listAssignments(
    tenantId: string,
    filters: { bookingId?: string; status?: TransportAssignment['status'] } = {},
  ): Promise<TransportAssignment[]> {
    // TODO: implement
    return [];
  }

  async updateAssignmentStatus(
    tenantId: string,
    assignmentId: string,
    status: TransportAssignment['status'],
  ): Promise<TransportAssignment> {
    // TODO: implement - transition status, update vehicle/driver availability
    throw new NotFoundException(`Assignment ${assignmentId} not found`);
  }

  // ── Tasreeh Permits ───────────────────────────────────────────────────────

  async requestTasreehPermit(tenantId: string, assignmentId: string): Promise<TasreehPermit> {
    // TODO: implement - call Saudi MOI tasreeh API, create permit record
    throw new Error('Not implemented');
  }

  async getPermitsByAssignment(assignmentId: string): Promise<TasreehPermit[]> {
    // TODO: implement - list permits for an assignment
    return [];
  }

  async revokePermit(tenantId: string, permitId: string): Promise<void> {
    // TODO: implement - revoke permit via API if applicable, update local status
  }
}
