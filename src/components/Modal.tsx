import type { PropsWithChildren } from "react";
import { FiX } from "react-icons/fi";

interface ModalProps extends PropsWithChildren {
  title: string;
  open: boolean;
  onClose: () => void;
  size?: "md" | "lg";
}

export function Modal({ title, open, onClose, children, size = "md" }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <section className={`max-h-[92vh] w-full overflow-y-auto rounded-lg bg-white shadow-2xl ${size === "lg" ? "max-w-4xl" : "max-w-2xl"}`}>
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button className="rounded-md p-2 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close">
            <FiX />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </section>
    </div>
  );
}
