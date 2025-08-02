import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisService } from './common/redis/redis.service';
import { RabbitMQService } from './common/rabbitmq/rabbitmq.service';
import * as Joi from 'joi';
import { CommonModule } from './common/common.module';
import { AuctionModule } from './auction/auction.module';
import { BidModule } from './bidding/bid-processing.module';

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
    CommonModule,
  ],
  providers: [RedisService, RabbitMQService],
})
export class AppModule {}
