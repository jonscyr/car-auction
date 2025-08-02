import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { UserService } from 'src/user/user/user.service';
// import * as jwt from 'jsonwebtoken';

// JWT implementation is yet to be done. considering it as out of scope for this exercise.
// Expecting just userId in the payload
@Injectable()
export class WsJwtAuthGuard implements CanActivate {
  constructor(private readonly userService: UserService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient<Socket>();
    // const token = client.handshake.auth.token;
    const userId = client.handshake.headers.userid as string;

    // if (!token) throw new UnauthorizedException('No token provided');
    if (!userId)
      throw new WsException({
        status: 'error',
        message: 'No userId provided',
      });

    //   const payload = jwt.verify(token, process.env.JWT_SECRET);
    //   client.data.user = payload;
    const user = await this.userService.getUserById(userId);
    if (!user) {
      throw new WsException({
        status: 'error',
        message: 'No userId provided',
      });
    }

    // Inject user details into client.data for downstream access
    client.data.user = user;
    return true;
  }
}

export interface AuthenticatedSocket extends Socket {
  data: {
    user: {
      id: string;
      username: string;
      // Add more user properties if needed
    };
  };
}
