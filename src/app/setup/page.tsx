import { SetupForm } from "./SetupForm";

export const metadata = { title: "保存先の設定（手元だけ）" };

/** 手元の開発用: where the developer gives the two Supabase values. Shows nothing useful in production. */
export default function SetupPage() {
  if (process.env.NODE_ENV !== "development") {
    return <main className="p-8 text-sm">この画面は手元の開発用です。</main>;
  }
  return <SetupForm defaultUrl="https://rxwqvvpqeguzghueripc.supabase.co" />;
}
