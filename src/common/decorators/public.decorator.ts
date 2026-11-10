import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Tandai route agar tidak memerlukan access token. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
