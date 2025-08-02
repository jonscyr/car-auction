import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RedisService } from 'src/common/redis/redis.service';

@Injectable()
export class UserService {
  private prisma = new PrismaClient();

  constructor(private readonly redisCache: RedisService) {}

  async getUserById(
    userId: string,
  ): Promise<{ id: string; username: string } | null> {
    const cacheKey = `user:${userId}`;
    const cachedUser = await this.redisCache.client.get(cacheKey);

    if (cachedUser) {
      return JSON.parse(cachedUser);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true },
    });

    if (user) {
      // Cache user data for 5 minutes
      await this.redisCache.client.set(cacheKey, JSON.stringify(user), {
        EX: 300,
      });
    }

    return user;
  }
}
