# UI Notification Guidelines

MINDGUIDE uses five notification patterns. Pick one based on **urgency**, **scope**, **whether the user must act**, and **how long the message must stay visible**.

| Situation | Component | Location |
| :--- | :--- | :--- |
| A background or user-triggered action finished; a live notification arrived while `liveAlertPopups` is on | **Toast** (`sonner`) | `toast()` from `sonner`; `<Toaster>` is mounted once in `src/app/App.tsx` |
| Feedback tied to one form, panel or solver step (validation, failed request in that panel) | **Inline Alert** | `src/app/components/ui/alert.tsx` |
| App- or session-wide condition that persists (offline, degraded notification listener, sign-out error) | **Banner** | `src/app/components/ui/banner.tsx` (`OfflineBanner` and `NotificationErrorBanner` are mounted in `src/app/routes.tsx`) |
| Irreversible/destructive action or mandatory decision | **Confirm Dialog** | `src/app/components/ui/confirm-dialog.tsx` |
| Asynchronous updates to check on demand or review in full | **Badge + Sheet Drawer / Inbox** | `src/app/components/NotificationDrawer.tsx` in `StudentShell` / `AdminShell`, plus `/student/notifications` and `/admin/notifications` backed by `src/stores/notification-store.ts` |

## Rules

1. **Toasts** are for messages that are safe to miss. Never use a toast for validation errors, listener outages, or anything the user must read to recover.
2. **Inline alerts** sit next to the thing that needs attention. Use `tone="error" | "warning"` (announced with `role="alert"`) or `tone="info" | "success"` (announced politely with `role="status"`). Pass a recovery button through `action`.
3. **Banners** describe state, not events. Omit `onDismiss` when the banner should stay until the condition clears (for example `OfflineBanner`). Banners don't support a `success` tone. `NotificationErrorBanner` automatically hides on `/student/notifications` and `/admin/notifications` where `NotificationContent` already displays an inline `Alert`.
4. **Confirm dialogs** replace `window.confirm`. Use `variant="destructive"` for irreversible actions, and pass `isLoading` while the action runs: this disables both buttons and blocks Escape so the dialog can't close mid-request.
5. **Notification drawer** (`NotificationDrawer`) lets students and admins inspect unread items, mark them read, and jump to destinations without leaving an active page; the full `/student/notifications` and `/admin/notifications` views share the same `NotificationList` component.
6. Don't stack patterns for the same event (for example, a toast *and* an inline alert for one failed save).

## Examples

```tsx
// Inline alert with recovery
<Alert tone="error" action={<button onClick={retry}>Retry</button>}>{error}</Alert>

// Persistent banner
<Banner tone="warning">Tutor responses are delayed.</Banner>

// Destructive confirmation
<ConfirmDialog
  open={isOpen}
  onOpenChange={setIsOpen}
  variant="destructive"
  title="Abandon this session?"
  description="Your reasoning record will be preserved as read-only history."
  confirmLabel="Abandon session"
  isLoading={isAbandoning}
  onConfirm={abandon}
/>
```
