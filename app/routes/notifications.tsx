// PROTOTYPE — throwaway expanded notifications page. State comes from the
// in-memory provider in layout.app.tsx. Branch prototype/notification-ui only.
import { NotificationsPage } from "~/components/notifications-prototype";

export function meta() {
  return [{ title: "Notifications · Cadence" }];
}

export default function NotificationsRoute() {
  return <NotificationsPage />;
}
