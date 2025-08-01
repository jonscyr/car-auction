import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client: RedisClientType;

  async onModuleInit() {
    this.client = createClient({ url: process.env.REDIS_URL });
    await this.client.connect();
  }

  getClient(): RedisClientType {
    return this.client;
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
