import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Upload, Check, X } from "lucide-react";
import { C } from "../styles/tokens";
import { keyOf, startOfToday, buildJSON } from "../domain";
import {
  backupAgeLabel,
  backupName,
  backupUrgency,
  needsBackup,
  BACKUP_KEEP_DAYS,
} from "../domain/backup";
import { useBackupState, patchBackupState, initBackupState } from "../storage/backupState";
import {
  getStoredFolder,
  folderPermission,
  pickBackupFolder,
  writeBackupToFolder,
  pruneFolder,
  forgetBackupFolder,
} from "../storage/fsbackup";
import { canShareFiles, hasDirectoryPicker, shareTextFile } from "../platform/share";
import { download } from "../platform/download";

/* ------------------------------------------------------------------ */
/*  Shared action                                                      */
/* ------------------------------------------------------------------ */

type Status = { kind: "idle" | "busy" | "ok" | "warn" | "error"; text?: string };

function useRunBackup({ exercises, symptoms, logs, marks, psfs }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const timer = useRef<any>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const flash = useCallback((s: Status, ms = 4000) => {
    setStatus(s);
    if (timer.current) clearTimeout(timer.current);
    if (s.kind === "ok" || s.kind === "warn") {
      timer.current = setTimeout(() => setStatus({ kind: "idle" }), ms);
    }
  }, []);

  /* Silent path, safe to call on load: only writes when a folder handle exists
     and permission is already granted, so it never triggers a prompt. */
  const runSilent = useCallback(async () => {
    const todayKey = keyOf(startOfToday());
    await initBackupState();
    const handle = await getStoredFolder();
    if (!handle) return false;
    if ((await folderPermission(handle)) !== "granted") return false;

    const text = buildJSON(exercises, symptoms, logs, marks, psfs);
    const res = await writeBackupToFolder(handle, backupName(todayKey), text);
    if (!res.ok) return false;
    void pruneFolder(handle, todayKey, BACKUP_KEEP_DAYS);
    patchBackupState({
      lastDate: todayKey,
      lastMethod: "folder",
      lastVerified: res.verified,
      hasFolder: true,
    });
    return true;
  }, [exercises, symptoms, logs, marks, psfs]);

  /* Interactive path — must be called from a user gesture. */
  const run = useCallback(
    async (opts: { preferred?: "download" | "share" } = {}) => {
      const todayKey = keyOf(startOfToday());
      const filename = backupName(todayKey);
      const text = buildJSON(exercises, symptoms, logs, marks, psfs);
      flash({ kind: "busy", text: "Tallennetaan…" });

      /* 1. a folder, if we have one and can get permission now */
      const handle = await getStoredFolder();
      if (handle && (await folderPermission(handle, true)) === "granted") {
        const res = await writeBackupToFolder(handle, filename, text);
        if (res.ok) {
          void pruneFolder(handle, todayKey, BACKUP_KEEP_DAYS);
          patchBackupState({
            lastDate: todayKey,
            lastMethod: "folder",
            lastVerified: res.verified,
            hasFolder: true,
          });
          flash({ kind: "ok", text: "Varmuuskopio kirjoitettu ja tarkistettu." });
          return true;
        }
        flash({ kind: "error", text: res.error || "Kansioon kirjoitus epäonnistui." });
        return false;
      }

      /* 2. share sheet, when that is the chosen mechanism */
      const preferred = opts.preferred;
      if (preferred === "share" && canShareFiles()) {
        const r = await shareTextFile(filename, text);
        if (r === "shared") {
          patchBackupState({ lastDate: todayKey, lastMethod: "share", lastVerified: false });
          flash({ kind: "ok", text: "Tiedosto jaettu. Varmista että tallennus onnistui." });
          return true;
        }
        if (r === "cancelled") {
          flash({ kind: "idle" });
          return false;
        }
        /* unsupported or failed: fall through to a download */
      }

      /* 3. plain download */
      try {
        download(filename, text, "application/json");
        patchBackupState({ lastDate: todayKey, lastMethod: "download", lastVerified: false });
        flash({ kind: "warn", text: "Ladattu. Tarkista että tiedosto tallentui." });
        return true;
      } catch {
        flash({ kind: "error", text: "Tallennus epäonnistui." });
        return false;
      }
    },
    [exercises, symptoms, logs, marks, psfs, flash]
  );

  return { status, run, runSilent };
}

function statusColor(kind: Status["kind"]) {
  if (kind === "ok") return C.pine;
  if (kind === "error") return C.amber;
  if (kind === "warn") return C.amber;
  return C.inkSoft;
}

/* ------------------------------------------------------------------ */
/*  Banner (Tänään)                                                    */
/* ------------------------------------------------------------------ */

export function BackupBanner({ exercises, symptoms, logs, marks, psfs }) {
  const state = useBackupState();
  const { status, run, runSilent } = useRunBackup({ exercises, symptoms, logs, marks, psfs });
  const todayKey = keyOf(startOfToday());
  const tried = useRef(false);

  /* one silent attempt per session, before showing anything */
  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    void runSilent();
  }, [runSilent]);

  if (!needsBackup(state, todayKey) && status.kind === "idle") return null;

  const urgency = backupUrgency(state, todayKey);
  const stale = urgency === "stale";
  const done = !needsBackup(state, todayKey);

  return (
    <div
      style={{
        background: done ? C.pineTint : stale ? C.amberTint : C.surfaceSoft,
        border: `1px solid ${done ? C.pineSoft : stale ? C.amberLine : C.line}`,
        borderRadius: 14,
        padding: "13px 14px",
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 2 }}>
            {done ? "Varmuuskopio tehty" : "Päivän varmuuskopio puuttuu"}
          </div>
          <div style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.45 }}>
            {status.kind !== "idle" && status.text ? (
              <span style={{ color: statusColor(status.kind) }}>{status.text}</span>
            ) : (
              <>
                {backupAgeLabel(state, todayKey)}{" "}
                {stale && "Selain voi tyhjentää tallennustilan, joten pidä kopio tiedostona."}
              </>
            )}
          </div>
        </div>
        {!done && (
          <button
            className="tap"
            onClick={() => patchBackupState({ snoozedFor: todayKey })}
            aria-label="Piilota tälle päivälle"
            style={{
              flex: "0 0 auto",
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "transparent",
              color: C.inkFaint,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
            <X size={15} />
          </button>
        )}
      </div>

      {!done && (
        <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
          <button
            className="tap"
            disabled={status.kind === "busy"}
            onClick={() => run({ preferred: state.preferred })}
            style={{
              flex: 1,
              padding: "9px 0",
              borderRadius: 10,
              border: "none",
              background: C.pine,
              color: "#fff",
              fontSize: 13.5,
              fontWeight: 600,
              opacity: status.kind === "busy" ? 0.6 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
            }}>
            <Download size={15} />
            Varmuuskopioi
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Settings (Muokkaa)                                                 */
/* ------------------------------------------------------------------ */

function Row({ children }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 0",
        borderTop: `1px solid ${C.line}`,
      }}>
      {children}
    </div>
  );
}

function TextBtn({ children, onClick, disabled, tone }: any) {
  const color = tone === "danger" ? C.amber : C.pine;
  return (
    <button
      className="tap"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: "0 0 auto",
        padding: "7px 12px",
        borderRadius: 9,
        border: `1px solid ${disabled ? C.line : color}`,
        background: "transparent",
        color: disabled ? C.inkFaint : color,
        fontSize: 13,
        fontWeight: 600,
        opacity: disabled ? 0.55 : 1,
      }}>
      {children}
    </button>
  );
}

export function BackupSettings({ exercises, symptoms, logs, marks, psfs }) {
  const state = useBackupState();
  const { status, run } = useRunBackup({ exercises, symptoms, logs, marks, psfs });
  const todayKey = keyOf(startOfToday());
  const [folderName, setFolderName] = useState<string | null>(null);
  const canPick = hasDirectoryPicker();
  const canShare = canShareFiles();

  useEffect(() => {
    let alive = true;
    void getStoredFolder().then((h) => {
      if (!alive) return;
      setFolderName(h ? h.name || "valittu kansio" : null);
      if (!!h !== state.hasFolder) patchBackupState({ hasFolder: !!h });
    });
    return () => {
      alive = false;
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const choose = async () => {
    const h = await pickBackupFolder();
    if (h) {
      setFolderName(h.name || "valittu kansio");
      patchBackupState({ hasFolder: true });
    }
  };

  const forget = async () => {
    await forgetBackupFolder();
    setFolderName(null);
    patchBackupState({ hasFolder: false });
  };

  return (
    <>
      <SectionHeading>Varmuuskopiot</SectionHeading>
      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.line}`,
          borderRadius: 16,
          padding: "4px 16px 14px",
          marginBottom: 16,
        }}>
        <div style={{ padding: "12px 0", fontSize: 13, color: C.inkSoft, lineHeight: 1.5 }}>
          {backupAgeLabel(state, todayKey)}{" "}
          {state.lastMethod === "folder" && state.lastVerified && "Kirjoitettu kansioon ja tarkistettu."}
          {state.lastMethod === "download" && "Tallennettu latauksena."}
          {state.lastMethod === "share" && "Tallennettu jakamalla."}
        </div>

        {canPick && (
          <Row>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, color: C.ink, fontWeight: 550 }}>Kansio</div>
              <div style={{ fontSize: 12, color: C.inkFaint }}>
                {folderName ? folderName : "Ei valittu — kopio tehdään latauksena."}
              </div>
            </div>
            {folderName && (
              <TextBtn onClick={forget} tone="danger">
                Poista
              </TextBtn>
            )}
            <TextBtn onClick={choose}>{folderName ? "Vaihda" : "Valitse"}</TextBtn>
          </Row>
        )}

        <Row>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, color: C.ink, fontWeight: 550 }}>Tapa</div>
            <div style={{ fontSize: 12, color: C.inkFaint }}>
              {canShare
                ? "Lataus tallentaa suoraan, jakaminen antaa valita kohteen."
                : "Jakaminen ei ole käytettävissä tässä selaimessa."}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flex: "0 0 auto" }}>
            {(["download", "share"] as const).map((m) => {
              const on = state.preferred === m;
              const dis = m === "share" && !canShare;
              return (
                <button
                  key={m}
                  className="tap"
                  disabled={dis}
                  onClick={() => patchBackupState({ preferred: m })}
                  style={{
                    padding: "7px 11px",
                    borderRadius: 9,
                    border: `1px solid ${on ? C.pine : C.line}`,
                    background: on ? C.pineTint : "transparent",
                    color: dis ? C.inkFaint : on ? C.pineDeep : C.inkSoft,
                    fontSize: 13,
                    fontWeight: 600,
                    opacity: dis ? 0.5 : 1,
                  }}>
                  {m === "download" ? "Lataus" : "Jaa"}
                </button>
              );
            })}
          </div>
        </Row>

        <Row>
          <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: statusColor(status.kind) }}>
            {status.text || `Vanhat kopiot siivotaan ${BACKUP_KEEP_DAYS} päivän jälkeen (vain kansio).`}
          </div>
          <TextBtn onClick={() => run({ preferred: state.preferred })} disabled={status.kind === "busy"}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {status.kind === "ok" ? <Check size={14} /> : <Upload size={14} />}
              Kopioi nyt
            </span>
          </TextBtn>
        </Row>

        <p style={{ margin: "12px 0 0", fontSize: 12, color: C.inkFaint, lineHeight: 1.5 }}>
          iPhonella lataus menee siihen kansioon, joka on valittu kohdassa Asetukset → Safari →
          Lataukset. Se voi olla myös iCloud Drive tai muu kansio, esimerkiksi synkronoitu kansio.
        </p>
      </div>
    </>
  );
}

function SectionHeading({ children }) {
  return (
    <div
      style={{
        fontSize: 11,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: C.inkSoft,
        fontWeight: 700,
        margin: "22px 2px 9px",
      }}>
      {children}
    </div>
  );
}
