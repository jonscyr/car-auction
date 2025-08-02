export interface Auction {
  id: string;
  carId: string;
  startTime: Date;
  endTime: Date;
  startingBid: number;
  currentHighestBid: number;
  winnerId: string | null;
}
