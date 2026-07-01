import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { FirstRunSetupModule } from './modules/first-run-setup/first-run-setup.module';
import { LocationsModule } from './modules/locations/locations.module';
import { MerchantsModule } from './modules/merchants/merchants.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ProductsModule } from './modules/products/products.module';
import { ReportsModule } from './modules/reports/reports.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env', '../../.env.example'],
      load: [appConfig, databaseConfig, redisConfig],
    }),
    DatabaseModule,
    RedisModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    MerchantsModule,
    OrdersModule,
    ReportsModule,
    LocationsModule,
    AuditLogsModule,
    FirstRunSetupModule,
  ],
})
export class AppModule {}
