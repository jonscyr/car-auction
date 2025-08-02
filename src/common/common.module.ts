import { Module } from '@nestjs/common';
import { RedisService } from './redis/redis.service';
import { PrismaService } from './prisma/prisma.service';
import { RabbitMQService } from './rabbitmq/rabbitmq.service';
import { RedisPubSubService } from './redis/redis.pubsub.service';

@Module({
  providers: [RedisService, PrismaService, RabbitMQService, RedisPubSubService],
  exports: [RedisService, PrismaService, RabbitMQService, RedisPubSubService],
})
export class CommonModule {}
