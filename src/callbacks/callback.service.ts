import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, Provider, WebhookStatus } from '@prisma/client';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { CallbackDto } from './dto/callback.dto';

type ProviderType = 'PSP' | 'GSP';

export interface CallbackAcceptedResponse {
  providerType: ProviderType;
  provider: string;
  brandId: number;
  idempotencyKey: string;
  status: 'created' | 'duplicated';
  accepted: true;
}

@Injectable()
export class CallbackService {
  constructor(private readonly prisma: PrismaService) {}

  handlePspCallback(provider: string, brandId: number, dto: CallbackDto) {
    return this.processCallback('PSP', provider, brandId, dto);
  }

  handleGspCallback(provider: string, brandId: number, dto: CallbackDto) {
    return this.processCallback('GSP', provider, brandId, dto);
  }

  private async processCallback(
    providerType: ProviderType,
    provider: string,
    brandId: number,
    dto: CallbackDto,
  ): Promise<CallbackAcceptedResponse> {
    const key = this.buildStorageIdempotencyKey(
      providerType,
      provider,
      dto.webhookId,
    );
    const response = this.buildAcceptedResponse(
      providerType,
      provider,
      brandId,
      dto.webhookId,
      'created',
    );

    const existing = await this.prisma.idempotencyKey.findUnique({
      where: {
        brandId_key: {
          brandId,
          key,
        },
      },
    });

    if (existing) {
      return {
        ...(existing.storedResponse as unknown as CallbackAcceptedResponse),
        status: 'duplicated',
      };
    }

    const requestHash = this.calculateRequestHash(dto.payload);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.idempotencyKey.create({
          data: {
            brandId,
            key,
            requestHash,
            storedResponse: response as unknown as Prisma.InputJsonValue,
          },
        });

        await tx.rawWebhook.create({
          data: {
            provider: providerType === 'PSP' ? Provider.PSP : Provider.GSP,
            brandId,
            idempotencyKey: key,
            status: WebhookStatus.RECEIVED,
            payload: dto.payload as unknown as Prisma.InputJsonValue,
          },
        });
      });

      return response;
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const duplicate = await this.prisma.idempotencyKey.findUnique({
          where: {
            brandId_key: {
              brandId,
              key,
            },
          },
        });

        if (duplicate) {
          return {
            ...(duplicate.storedResponse as unknown as CallbackAcceptedResponse),
            status: 'duplicated',
          };
        }
      }

      throw error;
    }
  }

  private buildAcceptedResponse(
    providerType: ProviderType,
    provider: string,
    brandId: number,
    idempotencyKey: string,
    status: 'created' | 'duplicated',
  ): CallbackAcceptedResponse {
    return {
      providerType,
      provider,
      brandId,
      idempotencyKey,
      status,
      accepted: true,
    };
  }

  private buildStorageIdempotencyKey(
    providerType: ProviderType,
    provider: string,
    webhookId: string,
  ): string {
    return `${providerType}:${provider}:${webhookId}`;
  }

  private calculateRequestHash(payload: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
