import { Module } from '@nestjs/common';
import { RedisService } from './redis/redis.service';
import { RabbitMQProducer } from './rabbitmq/rabbitmq.producer';
import { PrismaService } from './prisma/prisma.service';
import { RabbitMQSubscriber } from './rabbitmq/rabbitmq.subscriber';

@Module({
  providers: [
    RedisService,
    RabbitMQProducer,
    PrismaService,
    RabbitMQSubscriber,
  ],
  exports: [RedisService, RabbitMQProducer, PrismaService, RabbitMQSubscriber],
})
export class CommonModule {}
