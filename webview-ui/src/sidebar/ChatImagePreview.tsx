import { ImageIcon, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  image: { mimeType: string; base64: string };
  label: string;
  size?: 'composer' | 'message';
  active?: boolean;
};

/** Reuses the attached bytes; opening a preview never invokes a host/model tool. */
export function ChatImagePreview({ image, label, size = 'message', active = true }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previewRef = useRef<HTMLButtonElement>(null);
  const src = `data:${image.mimeType};base64,${image.base64}`;

  useEffect(() => {
    setFailed(false);
    setExpanded(false);
  }, [src]);

  useEffect(() => {
    if (!active) setExpanded(false);
  }, [active]);

  useEffect(() => {
    if (!expanded) return;
    const dialog = dialogRef.current;
    const preview = previewRef.current;
    dialog?.showModal();
    return () => {
      if (dialog?.open) dialog.close();
      if (preview?.isConnected) preview.focus({ preventScroll: true });
    };
  }, [expanded]);

  return (
    <>
      <button
        ref={previewRef}
        type="button"
        className={`ws-chat-image-preview ws-chat-image-preview--${size}`}
        aria-label={`Preview ${label}`}
        aria-haspopup="dialog"
        title={failed ? `Preview unavailable: ${label}` : `Preview ${label}`}
        disabled={failed}
        onClick={() => setExpanded(true)}
      >
        {failed ? (
          <ImageIcon size={20} aria-hidden="true" />
        ) : (
          <img src={src} alt="" onError={() => setFailed(true)} />
        )}
      </button>
      {expanded
        ? createPortal(
            <dialog
              ref={dialogRef}
              className="ws-chat-image-dialog"
              aria-label={`Image preview: ${label}`}
              onCancel={(event) => {
                event.preventDefault();
                setExpanded(false);
              }}
              onClose={() => setExpanded(false)}
              onClick={(event) => {
                if (event.target === event.currentTarget) setExpanded(false);
              }}
            >
              <div className="ws-chat-image-dialog__content">
                <header>
                  <bdi title={label}>{label}</bdi>
                  <button
                    type="button"
                    aria-label="Close image preview"
                    title="Close image preview (Escape)"
                    onClick={() => setExpanded(false)}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </header>
                <img src={src} alt={label} />
              </div>
            </dialog>,
            document.body
          )
        : null}
    </>
  );
}
