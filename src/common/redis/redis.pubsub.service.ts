import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RedisPubSubService {
  private publisher: Redis;
  private subscriber: Redis;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      throw new Error('REDIS_URL is not defined in environment variables');
    }
    this.publisher = new Redis(redisUrl);
    this.subscriber = new Redis(redisUrl);
  }

  async publishBidUpdate(auctionId: number, bid: any): Promise<void> {
    await this.publisher.publish(
      `auction:${auctionId}:bids`,
      JSON.stringify(bid),
    );
  }

  async subscribeToBidUpdates(
    auctionId: number,
    handler: (message: any) => void,
  ): Promise<void> {
    await this.subscriber.subscribe(`auction:${auctionId}:bids`);
    this.subscriber.on('message', (channel, message) => {
      if (channel === `auction:${auctionId}:bids`) {
        handler(JSON.parse(message));
      }
    });
  }
}
