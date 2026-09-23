// Scenario launcher (F5; LAYOUT_SPEC Desk section 5): the dispute featured, the other six in demo order and three
// groups, each announcing its client, expected split and duration before it starts.
import { Link } from "react-router";
import type { ScenarioId } from "@aegis/types";
import { deskCopy as copy, runLabel } from "@/copy/en";
import { useAppConfig } from "@/app/loaders";
import { approxDuration } from "@/lib/format";
import { scenarioInfo, type ScenarioInfo } from "@/lib/present/scenarios";
import { StartError } from "./StartError";
import type { Launch } from "./useLaunch";
import styles from "./runs.module.css";

const GROUPS: { key: keyof typeof copy.groups; ids: ScenarioId[] }[] = [
  { key: "aegisclear", ids: ["B-anchored-dispute", "B-rollover", "B-cooperative"] },
  { key: "control", ids: ["A-complete", "A-reject"] },
  { key: "both", ids: ["all"] },
];

export function ScenarioLauncher({ launch }: { launch: Launch }) {
  const config = useAppConfig();
  const info = (id: ScenarioId) => scenarioInfo(id, config.network);
  const featured = info("B-dispute");
  return (
    <section className={`sheet ${styles.launcher}`} aria-labelledby="launcher-title">
      <div className={styles.launcherHead}>
        <h2 id="launcher-title">{copy.launcher}</h2>
        <p className="meta">{copy.launcherLede}</p>
      </div>
      {launch.live && (
        <p className={styles.liveNote}>
          {copy.oneAtATime} <Link to={`/runs/${launch.live.id}`}>{copy.openLive}</Link>
        </p>
      )}
      {launch.error != null && <StartError error={launch.error} scenario={launch.scenario} live={launch.live} />}

      <section className={styles.featured} aria-labelledby="featured-title">
        <h3 id="featured-title" className={styles.featuredTitle}>{featured.title}</h3>
        <p>{featured.description}</p>
        <Facts info={featured} featured windowSeconds={config.windows.challenge} testnet={config.network === "testnet"} />
        <button id="featured-run" type="button" className="btn btn--primary" disabled={launch.disabled} onClick={() => launch.run("B-dispute")}>
          {launch.pending && launch.scenario === "B-dispute" ? copy.starting : runLabel["B-dispute"]}
        </button>
      </section>

      {GROUPS.map((group) => (
        <section key={group.key} className={styles.group} aria-labelledby={`group-${group.key}`}>
          <h3 id={`group-${group.key}`} className={styles.groupTitle}>{copy.groups[group.key]}</h3>
          <ul className={styles.rows}>
            {group.ids.map((id) => {
              const s = info(id);
              return (
                <li key={id} className={styles.row}>
                  <div className={styles.rowText}>
                    <span className={styles.rowTitle}>{s.title}</span>
                    <Facts info={s} />
                  </div>
                  <button type="button" className="btn btn--small" disabled={launch.disabled} onClick={() => launch.run(id)}>
                    {launch.pending && launch.scenario === id ? copy.starting : runLabel[id]}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </section>
  );
}

function Facts({ info, featured = false, windowSeconds = 0, testnet = false }: { info: ScenarioInfo; featured?: boolean; windowSeconds?: number; testnet?: boolean }) {
  const duration = approxDuration(info.durationSec);
  return (
    <dl className={featured ? styles.factsFeatured : styles.facts}>
      <div><dt className="sr-only">{copy.sessionCols.client}</dt><dd>{copy.client(info.client)}</dd></div>
      <div><dt className={featured ? undefined : "sr-only"}>{copy.expected}</dt><dd>{copy.expectedValue(info.expected)}</dd></div>
      <div><dt className={featured ? undefined : "sr-only"}>{copy.duration}</dt><dd>{featured ? copy.durationFeatured(duration, windowSeconds, testnet) : duration}</dd></div>
      <div><dt className={featured ? undefined : "sr-only"}>{copy.mode}</dt><dd>{copy.modeNames[info.mode] ?? info.mode}</dd></div>
    </dl>
  );
}
