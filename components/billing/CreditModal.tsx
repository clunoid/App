"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useBilling } from "@/lib/billing/store";
import { CreditCards } from "./CreditTopUp";

/**
 * App-wide modal that shows ONLY the two credit cards (Buy credits + Auto-reload),
 * opened from the profile "Add credit" button or the out-of-credits popup.
 */
export function CreditModal() {
  const open = useBilling((s) => s.creditOpen);
  const close = useBilling((s) => s.closeCredit);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[65] grid place-items-center overflow-y-auto bg-black/65 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            className="my-auto w-full max-w-3xl"
            initial={{ scale: 0.96, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 className="font-serif text-xl text-white" style={{ textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>
                Credits
              </h2>
              <button onClick={close} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white/85 backdrop-blur transition hover:bg-white/25">
                <X size={18} />
              </button>
            </div>
            <CreditCards />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
