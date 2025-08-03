export const PUBSUB_EVENTS = {
  BID_UPDATES: 'bid-updates',
  USER_JOINS: 'user-joins',
  USER_LEAVES: 'user-leaves',
  AUTCION_UPDATES: 'auction-updates',
  BID_ERROR: 'bid-error',
};

export interface IBidUpdate {
  auctionId: string;
  bidAmount: number;
  userId: string;
}
