import { Suspense } from "react";
import App from "@/components/App";
export default function Page() {
  return (
    <Suspense fallback={<div className="loading">読み込み中…</div>}>
      <App />
    </Suspense>
  );
}
