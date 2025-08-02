import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RedisPubSubService {
  public publisher: Redis;
  public subscriber: Redis;
  private handlers: Map<string, (message: any) => void> = new Map();

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      throw new Error('REDIS_URL is not defined in environment variables');
    }
    this.publisher = new Redis(redisUrl);
    this.subscriber = new Redis(redisUrl);

    // Handle incoming messages
    this.subscriber.on('message', (channel, message) => {
      const handler = this.handlers.get(channel);
      if (handler) {
        handler(JSON.parse(message));
      }
    });
  }

  async publish(channel: string, message: any) {
    await this.publisher.publish(channel, JSON.stringify(message));
  }

  async subscribe(channel: string, handler: (message: any) => void) {
    this.handlers.set(channel, handler);
    await this.subscriber.subscribe(channel);
  }
}
