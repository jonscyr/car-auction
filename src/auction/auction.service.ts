import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RedisService } from '../common/redis/redis.service';

@Injectable()
export class AuctionService {
  private readonly prisma: PrismaClient;

  constructor(private readonly redisService: RedisService) {
    this.prisma = new PrismaClient();
  }

  async getHighestBid(auctionId: string): Promise<number> {
    const cachedBid = await this.redisService
      .getClient()
      .GET(`auction:${auctionId}:highestBid`);
    if (cachedBid) {
      return Number(cachedBid);
    }

    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      select: { currentHighestBid: true },
    });

    return auction?.currentHighestBid || 0;
  }

  async updateHighestBid(auctionId: string, bidAmount: number, userId: string) {
    await this.redisService
      .getClient()
      .SET(`auction:${auctionId}:highestBid`, bidAmount.toString());

    // Optionally, publish bid updates to Redis Pub/Sub channels if needed
    await this.redisService.getClient().PUBLISH(
      `auction:${auctionId}:bidUpdate`,
      JSON.stringify({
        auctionId,
        bidAmount,
        userId,
      }),
    );
  }
}
