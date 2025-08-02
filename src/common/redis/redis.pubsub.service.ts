import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RedisPubSubService {
  public publisher: Redis;
  public subscriber: Redis;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      throw new Error('REDIS_URL is not defined in environment variables');
    }
    this.publisher = new Redis(redisUrl);
    this.subscriber = new Redis(redisUrl);
  }

  async publish(channel: string, message: any) {
    await this.publisher.publish(channel, JSON.stringify(message));
  }

  async subscribe(channel: string, handler: (message: any) => void) {
    await this.subscriber.subscribe(channel, (message) => {
      handler(JSON.parse(message as unknown as string));
    });
  }
}
