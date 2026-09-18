import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EMAIL_LOCALES, emailLocale, isTimeZone } from '../auth/auth-emails';
import { NOTIFICATION_CATEGORY_KEYS, NotificationCategory, categoryOf } from './preferences.catalog';
import type { UpdatePreferencesDto } from './dto/update-preferences.dto';

type InAppSettings = Record<NotificationCategory, boolean>;

interface StoredNotifications {
  inApp?: Partial<Record<NotificationCategory, boolean>>;
}

export interface UserPreferencesView {
  locale: 'en' | 'ar';
  timezone: string;
  notifications: { inApp: InAppSettings };
  /** Whether the in-app switches are honoured by the notification service on this deployment. */
  enforcement: { inApp: boolean };
  options: { locales: readonly string[]; notificationCategories: readonly NotificationCategory[] };
}

/**
 * The signed-in person's own preferences. Every read and write is keyed by the
 * caller's user id from the verified session — there is no user id in any
 * route or body, so one person can never read or change another's.
 */
@Injectable()
export class PreferencesService {
  private inAppEnforced = false;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Called once by NotificationsService when its fire() consults
   * allowsInApp() before storing a notification. Until that hook exists the
   * API reports `enforcement.inApp = false` and the settings page does not
   * offer the per-category switches, so nobody sees a control that does nothing.
   */
  markInAppEnforced() {
    this.inAppEnforced = true;
  }

  /** False when the recipient switched this notification's category off. SYSTEM and unknown types always pass. */
  async allowsInApp(userId: string, type: string): Promise<boolean> {
    const category = categoryOf(type);
    if (!category) return true;
    const row = await this.prisma.userPreference.findUnique({ where: { userId }, select: { notifications: true } });
    return (row?.notifications as StoredNotifications | undefined)?.inApp?.[category] !== false;
  }

  async get(userId: string): Promise<UserPreferencesView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { locale: true, timezone: true, preferences: { select: { notifications: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    const stored = (user.preferences?.notifications ?? {}) as StoredNotifications;
    const inApp = Object.fromEntries(
      NOTIFICATION_CATEGORY_KEYS.map((key) => [key, stored.inApp?.[key] !== false]),
    ) as InAppSettings;
    return {
      locale: emailLocale(user.locale),
      timezone: isTimeZone(user.timezone) ? user.timezone : 'Asia/Riyadh',
      notifications: { inApp },
      enforcement: { inApp: this.inAppEnforced },
      options: { locales: EMAIL_LOCALES, notificationCategories: NOTIFICATION_CATEGORY_KEYS },
    };
  }

  async update(userId: string, dto: UpdatePreferencesDto): Promise<UserPreferencesView> {
    if (dto.timezone !== undefined && !isTimeZone(dto.timezone)) {
      throw new BadRequestException({ code: 'INVALID_TIMEZONE', message: 'Choose a valid time zone (for example Asia/Riyadh).' });
    }
    const exists = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!exists) throw new NotFoundException('User not found');

    const inAppChanges = Object.entries(dto.notifications?.inApp ?? {}).filter(
      ([key, value]) => (NOTIFICATION_CATEGORY_KEYS as string[]).includes(key) && typeof value === 'boolean',
    );

    await this.prisma.$transaction(async (tx) => {
      if (dto.locale !== undefined || dto.timezone !== undefined) {
        await tx.user.update({
          where: { id: userId },
          data: { ...(dto.locale !== undefined ? { locale: dto.locale } : {}), ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}) },
        });
      }
      if (inAppChanges.length) {
        const current = await tx.userPreference.findUnique({ where: { userId }, select: { notifications: true } });
        const stored = (current?.notifications ?? {}) as StoredNotifications;
        const inApp: Partial<Record<NotificationCategory, boolean>> = { ...(stored.inApp ?? {}) };
        // Only opt-outs are stored; switching a category back on removes the entry.
        for (const [key, value] of inAppChanges) {
          if (value === false) inApp[key as NotificationCategory] = false;
          else delete inApp[key as NotificationCategory];
        }
        const notifications = { ...stored, inApp } as Prisma.InputJsonObject;
        await tx.userPreference.upsert({
          where: { userId },
          create: { userId, notifications },
          update: { notifications },
        });
      }
    });
    return this.get(userId);
  }
}
