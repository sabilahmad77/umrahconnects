import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeEmail, PASSWORD_MESSAGE, PASSWORD_RULE } from './register.dto';

export class ForgotPasswordDto {
  @Transform(normalizeEmail) @IsEmail() @MaxLength(255) email!: string;
}

export class ResetPasswordDto {
  @IsString() @MinLength(20) @MaxLength(200) token!: string;
  @IsString() @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE }) password!: string;
}

export class ChangePasswordDto {
  @IsString() @MinLength(1) @MaxLength(128) currentPassword!: string;
  @IsString() @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE }) newPassword!: string;
}

export class VerifyEmailDto {
  @IsString() @MinLength(20) @MaxLength(200) token!: string;
}

export class OAuthTicketDto {
  @IsString() @MinLength(20) @MaxLength(200) ticket!: string;
}
