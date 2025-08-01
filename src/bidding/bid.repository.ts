import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class BidRepository {
  private readonly prisma = new PrismaClient();

  async placeBid(auctionId: string, userId: string, amount: number) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
    });

    if (!auction) {
      throw new Error(`Auction with id ${auctionId} not found`);
    }

    if (amount <= auction.currentHighestBid) {
      throw new Error('Bid is not higher than current highest bid');
    }

    await this.prisma.bid.create({
      data: {
        auctionId,
        userId,
        amount, // Corrected from bidAmount to amount
      },
    });

    await this.prisma.auction.update({
      where: { id: auctionId },
      data: { currentHighestBid: amount, winnerId: userId },
    });
  }
}
