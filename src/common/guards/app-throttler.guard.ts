import { Injectable } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';

/// Guard throttle dengan pesan bahasa Indonesia agar konsisten dengan envelope
/// error API. Batas default 120 request/menit; endpoint sensitif (login)
/// menimpa batasnya lewat decorator `@Throttle`.
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async throwThrottlingException(): Promise<void> {
    throw new ThrottlerException(
      'Terlalu banyak permintaan. Coba lagi sebentar.',
    );
  }
}
