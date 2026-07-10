import { IsEmail, IsInt, IsPositive, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsInt()
  @IsPositive()
  brandId: number;
}
