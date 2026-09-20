import { useEffect, useState } from "react";
import type { ConfigResponse } from "../shared/types";
import { getConfig } from "./api";
import { Header } from "./components/Header";
import { ChannelsTable } from "./components/ChannelsTable";
import { ChannelDrawer } from "./components/ChannelDrawer";
import { DemoPanel } from "./components/DemoPanel";

export function App() {
  const [cfg, setCfg] = useState<ConfigResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => { getConfig().then(setCfg).catch((e) => setErr(String((e as Error).message))); }, []);
  return (
    <main className="wrap">
      <Header cfg={cfg} error={err} />
      <div className="grid">
        <section className="panel"><ChannelsTable cfg={cfg} onSelect={setSelected} /></section>
        <section className="panel"><DemoPanel cfg={cfg} /></section>
      </div>
      {selected && <ChannelDrawer addr={selected} cfg={cfg} onClose={() => setSelected(null)} />}
    </main>
  );
}
