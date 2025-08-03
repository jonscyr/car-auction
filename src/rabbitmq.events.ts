export const QUEUING = {
  EXCHANGES: {
    BID_X: 'bid.x',
    BID_HASH_X: 'bid.hash.x',
    AUDIT_FANOUT_X: 'audit.fanout.x',
    NOTIF_X: 'notification.x',
  },
  QUEUES: {
    BID_PROCESSING_PREFIX: 'bid-processing-',
    AUDIT_LOG_Q: 'audit-log',
    NOTIF_Q: 'notifications',
  },
};

export interface EventEnvelope<T> {
  eventType: string;
  timestamp: number;
  payload: T;
}

interface IPlaceBidPayload {
  auctionId: string;
  userId: string;
  bidAmount: number;
  //   timestamp: number;
}

export type PlaceBidEvent = EventEnvelope<IPlaceBidPayload> & {
  eventType: 'PLACE_BID';
};

interface IPlaceBidErrorPayload {
  auctionId: string;
  amount: number;
  reason: string;
  userId: string;
  type: string;
}

export type PlaceBidErrorEvent = EventEnvelope<IPlaceBidErrorPayload> & {
  eventType: 'PLACE_BID_ERROR';
};
