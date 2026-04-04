export interface Rider {
  id: string;
  name: string;
  phone: string;
  platformId: string;
  zone: string;
  earnings: number;
  upiId: string;
}

export interface Policy {
  id: string;
  riderId: string;
  premium: number;
  status: 'active' | 'expired';
  startDate: string;
  endDate: string;
  zone: string;
}

export interface Claim {
  id: string;
  policyId: string;
  eventId: string;
  amount: number;
  status: 'paid' | 'pending' | 'rejected';
  timestamp: string;
  type: 'Rain' | 'AQI' | 'Heat';
}

export interface TriggerEvent {
  id: string;
  zone: string;
  type: 'Rain' | 'AQI' | 'Heat';
  value: number;
  timestamp: string;
}
