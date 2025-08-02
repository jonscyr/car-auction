import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { RedisService } from 'src/common/redis/redis.service';
import { Socket } from 'socket.io';
import { WsException } from '@nestjs/websockets';
@Injectable()
export class BidThrottleGuard implements CanActivate {
  constructor(private readonly redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient<Socket>();
    const data = context.switchToWs().getData();
    const userId = client.handshake.headers.userid as string;

    const auctionId = data.auctionId;
    // const userId = data.userId;

    if (!auctionId || !userId)
      throw new WsException({
        status: 'error',
        message: 'Missing auctionId or userId',
      });

    const redisKey = `throttle:${auctionId}:${userId}`;
    const limit = 5; // 5 bids
    const ttl = 10; // per 10 seconds

    const redisClient = this.redisService.getClient();

    const current = await redisClient.incr(redisKey);
    if (current === 1) {
      await redisClient.expire(redisKey, ttl);
    }

    if (current > limit) {
      client.emit('error', { message: 'Rate limit exceeded. Please wait.' });
      return false;
    }

    return true;
  }
}
