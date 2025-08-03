import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RedisService } from '../common/redis/redis.service';
import { RabbitMQService } from 'src/common/rabbitmq/rabbitmq.service';
import { Auction } from './types';
import { RedisPubSubService } from 'src/common/redis/redis.pubsub.service';
import { PUBSUB_EVENTS } from 'src/pubsub.events';

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

  private getUserClientsKey(userId: string): string {
    return `user:${userId}:clients`;
  }

  private getAuctionUsersKey(auctionId: string): string {
    return `auction:${auctionId}:users`;
  }

  private getClientAuctionKey(clientId: string): string {
    return `client:${clientId}:auction`;
  }

  private async getUserIdFromClient(clientId: string): Promise<string | null> {
    const redis = this.redisService.client;
    const userId = await redis.get(`client:${clientId}:user`);
    return userId;
  }

  async addClientToRoom(auctionId: string, clientId: string, userId: string) {
    const redis = this.redisService.client;

    // Track clientId under user
    await redis.sAdd(this.getUserClientsKey(userId), clientId);

    // Add user to auction room if not already present
    await redis.sAdd(this.getAuctionUsersKey(auctionId), userId);

    // Map clientId to auction for reverse lookup
    await redis.set(this.getClientAuctionKey(clientId), auctionId);

    // Map client to user id map
    await redis.set(`client:${clientId}:user`, userId);

    await this.redisPubSub.publish(PUBSUB_EVENTS.USER_JOINS, {
      auctionId,
      userId,
    });
  }

  async removeUserFromRoom(auctionId: string, userId: string) {
    const redis = this.redisService.client;

    // Remove user from auction users set
    await redis.sRem(this.getAuctionUsersKey(auctionId), userId);

    // Get all clientIds of this user
    const clientIds = await redis.sMembers(this.getUserClientsKey(userId));

    // Remove all client-to-auction mappings
    for (const clientId of clientIds) {
      await redis.del(this.getClientAuctionKey(clientId));
    }

    // Delete the user's client set
    await redis.del(this.getUserClientsKey(userId));

    // Publish leave event
    await this.redisPubSub.publish(PUBSUB_EVENTS.USER_LEAVES, {
      auctionId,
      userId,
    });
  }

  async isUserInRoom(auctionId: string, userId: string): Promise<boolean> {
    const redis = this.redisService.client;
    const isMember = await redis.sIsMember(
      this.getAuctionUsersKey(auctionId),
      userId,
    );
    return isMember === 1;
  }

  async removeClient(clientId: string) {
    const redis = this.redisService.client;

    const auctionId = await redis.get(this.getClientAuctionKey(clientId));
    if (!auctionId) return;

    const userId = await this.getUserIdFromClient(clientId);
    if (!userId) return;

    // Remove clientId from user's active clients set
    await redis.sRem(this.getUserClientsKey(userId), clientId);

    // Delete clientId to auction mapping
    await redis.del(this.getClientAuctionKey(clientId));

    // Delete client - userid mapping
    await redis.del(`client:${clientId}:user`);

    // Check if user has any other active clients
    const remainingClients = await redis.sCard(this.getUserClientsKey(userId));
    if (remainingClients === 0) {
      // Remove user from all auction rooms
      const auctionKeys = await redis.keys('auction:*:users');
      for (const key of auctionKeys) {
        const isMember = await redis.sIsMember(key, userId);
        if (isMember) {
          await redis.sRem(key, userId);

          const auctionIdMatch = key.match(/^auction:(.*):users$/);
          const auctionId = auctionIdMatch ? auctionIdMatch[1] : null;

          if (auctionId) {
            await this.redisPubSub.publish(PUBSUB_EVENTS.USER_LEAVES, {
              auctionId,
              userId,
            });
          }
        }
      }

      // Clean up user's client set
      await redis.del(this.getUserClientsKey(userId));
    }
  }

  async getClientIdForUserIdAndAuctionId(userId: string, auctionId: string) {
    const redis = this.redisService.client;
    const clientIds = await redis.sMembers(this.getUserClientsKey(userId));

    for (const clientId of clientIds) {
      const clientAuctionId = await redis.get(
        this.getClientAuctionKey(clientId),
      );
      if (clientAuctionId === auctionId) {
        return clientId;
      }
    }
  }

  //   async placeBid(auctionId: string, userId: string, bidAmount: number) {
  //     this.logger.log(
  //       `Placing bid for auction ${auctionId} by user ${userId}: $${bidAmount}`,
  //     );

  //   }
}
