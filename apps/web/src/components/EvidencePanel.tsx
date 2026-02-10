import { useState, useEffect } from "react";
import type { NarrationEvent } from "../api/noemaClient";

const API_BASE = "/api";

interface Props {
  events: NarrationEvent[];
  hideHeader?: boolean;
}

const styles = {
  container: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
  },
  header: {
    padding: "10px 14px",
    fontSize: 15,
    fontWeight: 700,
    color: "#fbbf24",
    borderBottom: "1px solid #1e1e2e",
    letterSpacing: 1,
  },
  body: {
    flex: 1,
    overflow: "auto",
    padding: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#9ca3af",
    letterSpacing: 1,
    textTransform: "uppercase" as const,
    marginBottom: 6,
    marginTop: 12,
  },
  beliefCard: {
    padding: "8px 12px",
    marginBottom: 6,
    backgroundColor: "#14101f",
    border: "1px solid #2d2353",
    borderRadius: 4,
  },
  beliefTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "#a78bfa",
    marginBottom: 2,
  },
  beliefMessage: {
    fontSize: 11,
    color: "#c4b5fd",
    lineHeight: 1.5,
  },
  confidenceBar: (confidence: number) => ({
    height: 3,
    borderRadius: 2,
    backgroundColor: "#1e1e2e",
    marginTop: 4,
    position: "relative" as const,
    overflow: "hidden" as const,
  }),
  confidenceFill: (confidence: number) => ({
    height: "100%",
    width: `${Math.min(confidence * 100, 100)}%`,
    backgroundColor: confidence >= 0.7 ? "#22c55e" : confidence >= 0.4 ? "#fbbf24" : "#ef4444",
    borderRadius: 2,
    transition: "width 0.3s",
  }),
  experienceCard: {
    padding: "8px 12px",
    marginBottom: 6,
    backgroundColor: "#1a0f1e",
    border: "1px solid #3d2353",
    borderRadius: 4,
  },
  experienceMessage: {
    fontSize: 11,
    color: "#f9a8d4",
    lineHeight: 1.5,
  },
  evidenceCard: {
    padding: "6px 10px",
    marginBottom: 6,
    backgroundColor: "#111118",
    border: "1px solid #1e1e2e",
    borderRadius: 4,
  },
  evidenceType: {
    fontSize: 10,
    fontWeight: 600,
    color: "#fbbf24",
    textTransform: "uppercase" as const,
    marginBottom: 2,
  },
  evidenceMessage: {
    fontSize: 11,
    color: "#9ca3af",
    lineHeight: 1.5,
  },
  screenshotLink: {
    fontSize: 10,
    color: "#60a5fa",
    cursor: "pointer",
    textDecoration: "underline",
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    marginTop: 4,
    marginRight: 6,
  },
  empty: {
    padding: 20,
    textAlign: "center" as const,
    color: "#4b5563",
    fontSize: 12,
  },
};

export default function EvidencePanel({ events, hideHeader }: Props) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  // Separate events by type for organized display
  const beliefEvents = events.filter((e) => e.type === "belief_formed");
  const experienceEvents = events.filter((e) => e.type === "experience_learned");
  const evidenceEvents = events.filter((e) => e.type === "evidence_captured");

  // Collect all screenshot URLs for arrow-key navigation
  const allScreenshotUrls: string[] = [];
  for (const ev of evidenceEvents) {
    const screenshots = ev.data?.screenshots as string[] | undefined;
    if (screenshots) {
      for (const s of screenshots) {
        const filename = s.split("/").pop() || s;
        allScreenshotUrls.push(`/api/screenshots/${filename}`);
      }
    }
  }

  return (
    <div style={styles.container}>
      {!hideHeader && (
        <div style={styles.header}>
          EVIDENCE & BELIEFS
          {beliefEvents.length > 0 && (
            <span style={{ color: "#a78bfa", marginLeft: 8, fontWeight: 400 }}>
              {beliefEvents.length} belief{beliefEvents.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}
      <div style={styles.body}>
        {beliefEvents.length === 0 && experienceEvents.length === 0 && evidenceEvents.length === 0 && (
          <div style={styles.empty}>
            Evidence and beliefs will appear here as NOEMA observes and reasons.
          </div>
        )}

        {/* ─── Beliefs Section ─── */}
        {beliefEvents.length > 0 && (
          <>
            <div style={{ ...styles.sectionTitle, marginTop: 0 }}>
              🧠 Mental Models ({beliefEvents.length})
            </div>
            {beliefEvents.map((event, i) => {
              const title = event.data?.title as string | undefined;
              const confidence = event.data?.confidence as number | undefined;
              const oldConf = event.data?.old_confidence as number | undefined;
              const isNew = !oldConf;

              return (
                <div key={event.event_id || i} style={styles.beliefCard}>
                  <div style={styles.beliefTitle}>
                    {isNew ? "🆕 " : "📈 "}
                    {title || "Belief"}
                    {confidence !== undefined && (
                      <span style={{ fontSize: 10, color: "#6b7280", fontWeight: 400, marginLeft: 8 }}>
                        {isNew
                          ? `confidence: ${(confidence).toFixed(2)}`
                          : `${(oldConf!).toFixed(2)} → ${(confidence).toFixed(2)}`}
                      </span>
                    )}
                  </div>
                  <div style={styles.beliefMessage}>{event.message}</div>
                  {confidence !== undefined && (
                    <div style={styles.confidenceBar(confidence)}>
                      <div style={styles.confidenceFill(confidence)} />
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* ─── Experiences Section ─── */}
        {experienceEvents.length > 0 && (
          <>
            <div style={styles.sectionTitle}>
              💡 Experiences Learned ({experienceEvents.length})
            </div>
            {experienceEvents.map((event, i) => (
              <div key={event.event_id || i} style={styles.experienceCard}>
                <div style={styles.experienceMessage}>{event.message}</div>
                {event.data?.confidence !== undefined && (
                  <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>
                    confidence: {(event.data.confidence as number).toFixed(2)}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {/* ─── Evidence Section (Screenshots with links) ─── */}
        {evidenceEvents.length > 0 && (
          <>
            <div style={styles.sectionTitle}>
              📷 Evidence ({evidenceEvents.length})
            </div>
            {evidenceEvents.map((event, i) => {
              const screenshots = event.data?.screenshots as string[] | undefined;

              return (
                <div key={event.event_id || i} style={styles.evidenceCard}>
                  <div style={styles.evidenceMessage}>{event.message}</div>
                  {screenshots && screenshots.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                      {screenshots.map((screenshot, si) => {
                        const filename = screenshot.split("/").pop() || screenshot;
                        const url = `/api/screenshots/${filename}`;
                        const globalIdx = allScreenshotUrls.indexOf(url);
                        return (
                          <span
                            key={si}
                            style={styles.screenshotLink}
                            onClick={() => setLightboxIdx(globalIdx >= 0 ? globalIdx : 0)}
                          >
                            🔍 View screenshot {si + 1}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Screenshot Lightbox with arrow key navigation */}
      {lightboxIdx !== null && allScreenshotUrls.length > 0 && (
        <EvidenceLightbox
          src={allScreenshotUrls[lightboxIdx]}
          onClose={() => setLightboxIdx(null)}
          onPrev={lightboxIdx > 0 ? () => setLightboxIdx(lightboxIdx - 1) : undefined}
          onNext={lightboxIdx < allScreenshotUrls.length - 1 ? () => setLightboxIdx(lightboxIdx + 1) : undefined}
          current={lightboxIdx + 1}
          total={allScreenshotUrls.length}
        />
      )}
    </div>
  );
}

// =============================================================================
// Evidence Lightbox with arrow-key navigation
// =============================================================================

function EvidenceLightbox({ src, onClose, onPrev, onNext, current, total }: {
  src: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  current?: number;
  total?: number;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      if (e.key === "ArrowRight" && onNext) onNext();
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onPrev, onNext, onClose]);

  const navBtn = (enabled: boolean): React.CSSProperties => ({
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: 40,
    height: 60,
    borderRadius: 6,
    border: "1px solid #2e2e3e",
    backgroundColor: enabled ? "#1e1e2ecc" : "#0a0a0f44",
    color: enabled ? "#d4d4d8" : "#4b5563",
    fontSize: 20,
    cursor: enabled ? "pointer" : "default",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "inherit",
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.9)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        cursor: "pointer",
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh" }}>
        <img src={src} alt="Screenshot" style={{ maxWidth: "85vw", maxHeight: "80vh", borderRadius: 6, border: "2px solid #2e2e3e", objectFit: "contain" }} />
        <button onClick={onClose} style={{ position: "absolute", top: -12, right: -12, width: 28, height: 28, borderRadius: "50%", border: "1px solid #2e2e3e", backgroundColor: "#0a0a0f", color: "#d4d4d8", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>✕</button>
        {onPrev && <button onClick={onPrev} style={{ ...navBtn(true), left: -50 }}>‹</button>}
        {onNext && <button onClick={onNext} style={{ ...navBtn(true), right: -50 }}>›</button>}
        <div style={{ textAlign: "center", marginTop: 8, fontSize: 11, color: "#6b7280", display: "flex", gap: 16, justifyContent: "center" }}>
          {current !== undefined && total !== undefined && <span style={{ color: "#d4d4d8", fontWeight: 600 }}>{current} / {total}</span>}
          <span>← → to navigate · Esc to close</span>
        </div>
      </div>
    </div>
  );
}
