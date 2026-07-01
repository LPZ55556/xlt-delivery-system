import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client?: Redis;

  constructor(private readonly config: ConfigService) {}

  getClient(): Redis {
    if (!this.client) {
      this.client = new Redis({
        host: this.config.get<string>('redis.host', '127.0.0.1'),
        port: this.config.get<number>('redis.port', 6379),
        password: this.config.get<string>('redis.password'),
        lazyConnect: true,
      });
    }
    return this.client;
  }

  async onModuleDestroy() {
    if (this.client) await this.client.quit();
  }
}
