import { Module } from '@nestjs/common';
import { RedisService } from './redis/redis.service';
import { PrismaService } from './prisma/prisma.service';
import { RabbitMQService } from './rabbitmq/rabbitmq.service';

@Module({
  providers: [RedisService, PrismaService, RabbitMQService],
  exports: [RedisService, PrismaService, RabbitMQService],
})
export class CommonModule {}
