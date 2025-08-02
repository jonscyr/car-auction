import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RedisService } from '../common/redis/redis.service';
import { RabbitMQService } from 'src/common/rabbitmq/rabbitmq.service';
import { Auction } from './types';
import { RedisPubSubService } from 'src/common/redis/redis.pubsub.service';

const DEFAULT_ACTION_CACHE_TTL = 300;

@Injectable()
export class AuctionService {
  private readonly logger = new Logger(AuctionService.name);
  private readonly prisma: PrismaClient;

  constructor(
    private readonly redisService: RedisService,
    private readonly redisPubSub: RedisPubSubService,
    private readonly rabbitMQService: RabbitMQService,
  ) {
    this.prisma = new PrismaClient();
  }

  private getAuctionCacheKey(auctionId: string): string {
    return `auction:${auctionId}:details`;
  }

  async getAuctionById(auctionId: string): Promise<Auction> {
    const cacheKey = this.getAuctionCacheKey(auctionId);

    // 1. Try fetching from Redis Cache
    const cached = await this.redisService.client.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as Auction;
    }

    // 2. Fallback to DB
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
    });

    if (!auction) {
      throw new Error(`Auction with id ${auctionId} not found`);
    }

    // 3. Cache in Redis (set with TTL if needed)
    await this.redisService.client.set(cacheKey, JSON.stringify(auction), {
      expiration: { type: 'EX', value: DEFAULT_ACTION_CACHE_TTL },
    });

    return auction as Auction;
  }

  isAuctionActive(auction: Auction): boolean {
    const now = new Date();
    return now >= auction.startTime && now <= auction.endTime;
  }

  async invalidateAuctionCache(auctionId: string) {
    const cacheKey = this.getAuctionCacheKey(auctionId);
    await this.redisService.client.del(cacheKey);
  }

  private getRoomKey(auctionId: string): string {
    return `auction:${auctionId}:clients`;
  }

  private getClientKey(clientId: string): string {
    return `client:${clientId}:auction`;
  }

  async addClientToRoom(auctionId: string, clientId: string, userId: string) {
    await this.redisService.client.sAdd(this.getRoomKey(auctionId), clientId);
    await this.redisService.client.set(this.getClientKey(clientId), auctionId);
    await this.redisPubSub.publish('user-joins', {
      auctionId: auctionId,
      userId: userId,
    });
  }

  async removeClientFromRoom(clientId: string) {
    const auctionId = await this.redisService.client.get(
      this.getClientKey(clientId),
    );
    if (auctionId) {
      await this.redisService.client.sRem(this.getRoomKey(auctionId), clientId);
      await this.redisService.client.del(this.getClientKey(clientId));
    }
  }

  async getClientsInRoom(auctionId: string): Promise<string[]> {
    return this.redisService.client.sMembers(this.getRoomKey(auctionId));
  }

  async isClientInRoom(auctionId: string, clientId: string): Promise<boolean> {
    // TODO: use R.isNil
    return !!(await this.redisService.client.sIsMember(
      this.getRoomKey(auctionId),
      clientId,
    ));
  }

  async placeBid(auctionId: string, userId: string, bidAmount: number) {
    this.logger.log(
      `Placing bid for auction ${auctionId} by user ${userId}: $${bidAmount}`,
    );

    await this.rabbitMQService.publishToQueue('bid-processing-queue', {
      auctionId,
      userId,
      bidAmount,
      timestamp: new Date(),
    });
  }
}
