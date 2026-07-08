/**
 * /edge — Clunoid Edge, the Sports Intelligence & Betting Analysis platform
 * (admin-only). Same access model as /trading: the page renders for anyone who
 * reaches it, but EVERY byte flows through /api/edge/* routes that verify the
 * server-side session against the immutable admin allow-list (403 otherwise) —
 * the console renders a Restricted screen on 403. Absent from all navigation and
 * feature registries; opening it to more users later = widening the allow-list.
 */
import { EdgeConsole } from "@/components/edge/EdgeConsole";

export default function EdgePage() {
  return (
    <main>
      <EdgeConsole />
    </main>
  );
}
