import { Module } from '@nestjs/common';
import { UserService } from './user/user.service';
import { CommonModule } from 'src/common/common.module';

@Module({
  providers: [UserService],
  exports: [UserService],
  imports: [CommonModule],
})
export class UserModule {}
