import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisService } from './common/redis/redis.service';
import { RabbitMQService } from './common/rabbitmq/rabbitmq.service';
import * as Joi from 'joi';
import { CommonModule } from './common/common.module';
import { AuctionModule } from './auction/auction.module';
import { BidModule } from './bidding/bid-processing.module';
import { UserModule } from './user/user.module';
import { AuditingModule } from './auditing/auditing.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().uri().required(),
        REDIS_URL: Joi.string().uri().required(),
        RABBITMQ_URL: Joi.string().uri().required(),
        PORT: Joi.number().default(3000),
        CONSUMER_QUEUE_ID: Joi.number(),
        N_CONSUMERS: Joi.number().default(3),
      }),
    }),
    CommonModule,
    AuctionModule,
    BidModule,
    UserModule,
    AuditingModule,
  ],
  providers: [RedisService, RabbitMQService],
})
export class AppModule {}
