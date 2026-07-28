/* ui/Update — the connection indicator.
 *
 * This file used to also hold the "new version ready" banner for the service
 * worker. That went with the offline feature (see platform/sw.ts). What is left
 * is genuinely useful and has nothing to do with workers: if the app looks stuck
 * and the phone is offline, say so, rather than letting it look broken.
 *
 * Without a service worker the app needs the network to load at all, so this only
 * ever appears when the connection drops during a session — the data itself keeps
 * working, because it was never coming from a server.
 */

import { CloudOff } from "lucide-react";
import { useOnlineStatus } from "../platform/sw";
import { C } from "../styles/tokens";

export function OfflineNote() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <p
      style={{
        marginTop: 10,
        textAlign: "center",
        fontSize: 12,
        color: C.inkSoft,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        lineHeight: 1.5,
      }}
    >
      <CloudOff size={13} />
      Ei verkkoyhteyttä. Merkinnät tallentuvat silti laitteelle.
    </p>
  );
}
