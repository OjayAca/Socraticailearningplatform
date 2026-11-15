import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  type LucideIcon,
} from "lucide-react";

/** Severity shared by every persistent notification primitive (Alert, Banner). */
export type NotificationTone = "info" | "success" | "warning" | "error";

interface NotificationToneStyle {
  /** Container colours for light and dark themes. */
  containerClassName: string;
  /** Default icon communicating the tone. */
  Icon: LucideIcon;
  /**
   * ARIA live role. Errors and warnings interrupt assistive technology
   * (`alert`); info and success are announced politely (`status`).
   */
  role: "alert" | "status";
}

const toneStyles: Record<NotificationTone, NotificationToneStyle> = {
  info: {
    containerClassName:
      "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200",
    Icon: Info,
    role: "status",
  },
  success: {
    containerClassName:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
    Icon: CheckCircle2,
    role: "status",
  },
  warning: {
    containerClassName:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
    Icon: AlertTriangle,
    role: "alert",
  },
  error: {
    containerClassName:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300",
    Icon: AlertCircle,
    role: "alert",
  },
};

/**
 * Resolves the visual and accessibility treatment for a notification tone.
 *
 * @param tone - The severity of the notification.
 * @returns The container classes, default icon and ARIA role for that tone.
 */
export function getNotificationToneStyle(tone: NotificationTone): NotificationToneStyle {
  return toneStyles[tone];
}
