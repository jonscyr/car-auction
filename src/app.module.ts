import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuctionModule } from './auction/auction.module';
import { BidModule } from './bidding/bid-processing.module';
import { RedisService } from './common/redis/redis.service';
import { RabbitMQProducer } from './common/rabbitmq/rabbitmq.producer';
import { RabbitMQSubscriber } from './common/rabbitmq/rabbitmq.subscriber';
import * as Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().uri().required(),
        REDIS_URL: Joi.string().uri().required(),
        RABBITMQ_URL: Joi.string().uri().required(),
        PORT: Joi.number().default(3000),
        RATE_LIMIT: Joi.number().default(5),
      }),
    }),
    AuctionModule,
    BidModule,
  ],
  providers: [RedisService, RabbitMQProducer, RabbitMQSubscriber],
})
export class AppModule {}
