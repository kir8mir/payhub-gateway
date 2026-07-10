import { IsNotEmpty, IsObject, IsString } from 'class-validator';

export class CallbackDto {
  @IsString()
  @IsNotEmpty()
  webhookId!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}
