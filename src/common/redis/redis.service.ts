import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  public client: RedisClientType;
  public subscriber: RedisClientType;

  async onModuleInit() {
    this.client = createClient({ url: process.env.REDIS_URL }); // TODO: use connection pooling
    this.subscriber = this.client.duplicate();

    // TODO: add retry mechanisms
    this.client.on('error', (err) => {
      this.logger.error('Redis Client Error', err);
    });

    this.subscriber.on('error', (err) => {
      this.logger.error('Redis Subscriber Error', err);
    });

    await this.client.connect();
    await this.subscriber.connect();
  }

  async onModuleDestroy() {
    await this.client.quit();
    await this.subscriber.quit();
  }

  async publish(channel: string, message: string) {
    await this.client.publish(channel, message);
  }

  async subscribe(channel: string, callback: (message: string) => void) {
    await this.subscriber.subscribe(channel, (message) => {
      callback(message);
    });
  }

  getClient(): RedisClientType {
    return this.client;
  }
}
