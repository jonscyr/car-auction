import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { RedisService } from 'src/common/redis/redis.service';
import { WsException } from '@nestjs/websockets';

@Injectable()
export class RedisRateLimiterGuard implements CanActivate {
  constructor(private readonly redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = this.redisService.getClient();

    const socket = context.switchToWs().getClient();
    const userId = socket.handshake.query.userId as string; // or use token decoding logic

    const key = `rate-limit:${userId}`;
    const limit = 10; // max 10 events
    const ttl = 60; // per 60 seconds

    const current = await client.incr(key);

    if (current === 1) {
      await client.expire(key, ttl);
    }

    if (current > limit) {
      throw new WsException({
        status: 'error',
        message: 'Rate limit exceeded',
      });
    }

    return true;
  }
}
