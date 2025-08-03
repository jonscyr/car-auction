import { Module } from '@nestjs/common';
import { AuditLogConsumerService } from './audit/audit.service';
import { CommonModule } from 'src/common/common.module';

@Module({
  providers: [AuditLogConsumerService],
  imports: [CommonModule],
})
export class AuditingModule {}
